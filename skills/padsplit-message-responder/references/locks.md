# LOCK MANAGEMENT - CoSpace Locks (TTLock)

Use this file before any CoSpace Locks, TTLock, eKey, PIN, move-in access, move-out revocation, lockout, Airbnb timed-access, or checkout-verification task.

Primary app: `http://localhost:3001`

Fallback portal: `https://lock2.ttlock.com`

Lock registry: `lock-registry.md`

Cooldown file: `lock-cooldown.txt`

## Authorization And Scope

Jordan has authorized lock operations for CoSpace Management properties, including:

- issuing eKeys
- generating custom PINs
- handling lockouts
- move-in access setup
- move-out access revocation
- Airbnb timed access
- Airbnb checkout verification

Use live lock systems only when Jordan asks for this workflow or the active inbox run produces a lock trigger. Stop and log any login wall, MFA, CAPTCHA, security challenge, or authorization error.

## Routing - Primary Path vs Web Portal Fallback

Primary path:

- Use CoSpace Locks at `http://localhost:3001`.
- It uses the TTLock developer API.

Fallback path:

- Use TTLock web portal at `https://lock2.ttlock.com`.
- It uses an authenticated user session rather than developer API quota.
- Before fallback work, read `lock-registry.md` and sort queued actions by account.
- Do not store or write portal passwords in this skill. Use Jordan-provided credentials from the approved password manager or current session context.

### Layer 0 - 24-Hour Cooldown

Before loading `localhost:3001`, read `lock-cooldown.txt` in this reference directory.

- If it exists and contains an ISO 8601 timestamp less than 24 hours old, skip the primary path and set `use_web_portal = true`.
- Log: `Primary path on cooldown until [cooldown expiry time] - using web portal.`
- If the timestamp is older than 24 hours, test the primary path again.
- If the file is missing or empty, test the primary path.

Write the cooldown file with the current ISO timestamp whenever the primary path fails at batch start or mid-action. Do not clear it manually unless Jordan explicitly asks.

### Checkpoint 1 - Batch Start

Only run if cooldown is not active.

1. Open/reuse a dedicated CoSpace Locks tab.
2. Load `http://localhost:3001`.
3. If it loads normally, start with the primary path.
4. If it shows API limit, quota exceeded, 429, connection refused, or any loading error, set `use_web_portal = true`, write cooldown, and use the web portal.

### Checkpoint 2 - Mid-Action Failure

If using the primary path and any lock action fails:

1. Stop using the primary path immediately.
2. Set `use_web_portal = true`.
3. Write cooldown with the current timestamp.
4. Do not retry the failed action on `localhost:3001`.
5. Re-queue the failed action plus remaining lock actions for the web portal.
6. Continue with the action that failed.
7. Log: `Primary path failed mid-batch on [action type] for [member] @ [property] - switching to web portal. Cooldown set for 24 hours.`

Detect primary-path failure after every eKey send, PIN generation, or deletion:

- error/toast text on page
- modal not closing after submit
- text containing `error`, `failed`, `limit`, `quota`, `exceeded`, `unauthorized`, or `try again`
- expected eKey, PIN, or deletion not reflected in the list

Once `use_web_portal = true`, do not return to the primary path for the rest of the run.

## Offline Locks And eKey Behavior

Gateway offline or no gateway does not mean access cannot be issued.

Works while gateway is offline:

- eKey issuance works because eKeys are delivered to the member's TTLock account and unlock by Bluetooth.
- Existing PINs work locally on the keypad.
- Existing timed PINs activate and expire locally once synced.

Does not work while gateway is offline:

- New PIN generation.
- Remote lock/unlock.
- Remote PIN deletion.

Move-in with offline gateway:

1. Always issue eKeys.
2. Attempt PIN generation.
3. If PIN generation fails, send eKeys anyway and flag pending PIN for Jordan.
4. Do not tell a member the lock system is down or that access cannot be provided when eKeys are available.

Distinguish errors:

- Gateway offline: lock shows offline/no gateway, PIN creation may fail, eKey issuance should succeed.
- API quota exhausted: both eKeys and PIN creation fail, often with quota/429 messaging. Trigger web portal fallback.

## Lock Task Triggers

Queue lock tasks when:

- A member reports lockout or access failure.
- A move-in is detected from PadSplit details, system events, TurboTenant, or Jordan.
- A move-out is confirmed or detected.
- An Airbnb pre-arrival, confirmed booking, check-in-day, checkout verification, or guest lockout event appears.
- Jordan explicitly requests a lock action.

During message processing, complete the messaging response first, then add non-urgent lock work to `lock_action_queue`. Run queued non-urgent lock actions as a batch after all conversations are processed.

Exception: active lockouts are urgent. Execute immediately inline.

## Step 0 - Validate Digital Locks

Before issuing eKeys, generating PINs, revoking access, or sending lock instructions, confirm the property uses digital locks.

Maintain `lock_validation_cache` for the current run:

- `true`: skip validation and proceed.
- `false`: skip lock action and log.
- `ambiguous`: skip lock action, log, and flag P1.

Validation:

1. Note the property address from PadSplit/Airbnb/Hub.
2. If using primary path, search the CoSpace Locks list for that address or clear property identifier.
3. If using web portal, search `lock-registry.md`, then verify lock names in the portal.
4. If locks are found, cache `true`.
5. If no locks are found, cache `false` and do not send lock-related instructions.
6. If unclear, cache `ambiguous`, capture enough evidence for Jordan, flag P1, and skip.

## Member Email Lookup

Before extracting from PadSplit:

1. Check the Knowledge Hub member notes.
2. Check the member dossier `email-cached`.
3. If not cached, extract from PadSplit profile React data.

PadSplit extraction:

1. In the conversation, click Details.
2. Click View profile.
3. Run this JavaScript in the page:

```javascript
const nextEl = document.getElementById('__next');
const containerKey = Object.keys(nextEl).find(k => k.startsWith('__reactContainer'));

function searchFiber(fiber, depth, maxDepth) {
  depth = depth || 0; maxDepth = maxDepth || 50;
  if (!fiber || depth > maxDepth) return null;
  const emailRegex = /"email"\s*:\s*"([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})"/;
  const checkObj = function(obj) {
    try {
      var str = JSON.stringify(obj);
      var match = str && str.match(emailRegex);
      return match ? match[1] : null;
    } catch(e) { return null; }
  };
  var result = checkObj(fiber.memoizedProps) || checkObj(fiber.memoizedState);
  if (result) return result;
  return searchFiber(fiber.child, depth + 1, maxDepth) || searchFiber(fiber.sibling, depth + 1, maxDepth);
}

searchFiber(nextEl[containerKey]);
```

Confirm the result looks plausible, then cache it in the Knowledge Hub and dossier with extraction date.

## CoSpace Locks React Handling

The CoSpace Locks app is React-based. Standard DOM `.click()` may not trigger internal handlers. Prefer normal UI actions first; if they do not register, invoke React props.

Search/select lock example:

```javascript
var modal = document.querySelector('.modal');
var searchInput = modal.querySelector('input[placeholder="Search locks..."]');
var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
nativeSetter.call(searchInput, '3300 NW 15th Room 2');
searchInput.dispatchEvent(new Event('input', { bubbles: true }));

var lockBtns = Array.from(modal.querySelectorAll('.lock-pick-btn'));
var target = lockBtns.find(function(b) { return b.textContent.includes('Room 2'); });
var propsKey = Object.keys(target).find(function(k) { return k.startsWith('__reactProps'); });
target[propsKey].onClick({});
```

Fill fields example:

```javascript
var modal = document.querySelector('.modal');
var nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

var emailInput = modal.querySelector('input[placeholder*="email"]');
nativeSetter.call(emailInput, 'member@example.com');
emailInput.dispatchEvent(new Event('input', { bubbles: true }));

var nameInput = modal.querySelector('input[placeholder*="Guest"]');
nativeSetter.call(nameInput, 'Member Name - Room 2');
nameInput.dispatchEvent(new Event('input', { bubbles: true }));
```

Submit example:

```javascript
var modal = document.querySelector('.modal');
var sendBtn = modal.querySelector('.btn-primary');
var propsKey = Object.keys(sendBtn).find(function(k) { return k.startsWith('__reactProps'); });
sendBtn[propsKey].onClick({});
```

The modal closing and the item appearing in the list are success signals.

## PadSplit Member Access

### Always Issue Two eKeys

For move-in, lockout, or on-demand eKey requests, issue two separate eKeys:

1. Front door: `[Member Name] - Front Door`
2. Room door: `[Member Name] - Room [N]`

Send one PadSplit message after both eKeys are confirmed. Include TTLockApp setup link: `http://onelink.to/ttlock`.

### Move-In Access Setup

Only send access on move-in morning or later unless Jordan explicitly approves earlier access.

Steps:

1. Run Step 0 validation.
2. Get member email from hub/dossier or React extraction.
3. Check hub for WiFi and house-specific notes.
4. Issue two eKeys: front door and room door.
5. Generate one random non-trivial 4-digit PIN for the member.
6. Apply the same PIN to the room lock and front door lock.
7. Never use TTLock auto-generate for PadSplit member PINs.
8. If PIN generation fails because gateway is offline, send eKeys and mark PIN pending for Jordan.
9. Send one all-in-one PadSplit welcome/access message.
10. Queue Knowledge Hub and dossier updates.

Full access message shape:

```text
Good morning [Name]! Welcome - today is your move-in day! Here's everything you need:
E-Key: I've issued you an E-key. If you download the app and register with your email you will be able to unlock the doors with your phone. Install the TTLockApp (http://onelink.to/ttlock) and unlock the door using the app.
Your keypad PIN: [PIN] - this code works on both the front door and your room door.
WiFi - Network: [NETWORK] | Password: [PASSWORD]
The PIN works directly on the keypads with or without the app. Let me know if you need anything!
```

Partial eKey-only message shape:

```text
Good morning [Name]! Welcome - today is your move-in day! Here's everything you need:
E-Key: I've issued you an E-key. If you download the app and register with your email you will be able to unlock the doors with your phone. Install the TTLockApp (http://onelink.to/ttlock) and unlock the door using the app. This is your primary access method - it works on both the front door and your room door.
WiFi - Network: [NETWORK] | Password: [PASSWORD]
Your keypad code is being finalized and I'll send it to you shortly. In the meantime, the eKey in the app will open both doors. Let me know if you need anything!
```

Omit WiFi if unknown and queue the missing fact for Jordan.

### Lockout Assistance

If the report is vague, ask one clarifying question:

```text
Hey [Name], I want to make sure I get you in right away - can you clarify: did you forget your PIN, is your eKey not working in the app, or is the lock itself not responding?
```

Then run Step 0 and identify the scenario:

- PIN forgotten/not working: generate a new permanent custom PIN and send it.
- eKey/app issue: resend eKey, confirm email, and send backup PIN if available.
- Keypad unresponsive/dead battery: Tier 1 maintenance, flag P0, escalate immediately.
- Lock beeps but door does not open: mechanical issue, flag urgent maintenance.
- Locked out of room but inside house: generate/send room PIN if possible.
- Night/urgent lockout: issue eKey and backup PIN immediately where possible.

After lockout:

- Update hub/dossier with scenario and resolution.
- If second lockout in 30 days, flag P1.
- If battery issue appears likely, add maintenance note.
- Check for confirmation from the member; if none, send a brief follow-up asking if they got in.

### Move-Out Revocation

Steps:

1. Run Step 0 validation.
2. Confirm member name, room, property, and move-out date.
3. Delete eKeys for front door and room.
4. Delete custom PINs for front door and room.
5. Confirm entries are removed.
6. Queue hub/dossier updates.
7. Log result.

If revocation is more than 2 days late, flag P1.

### On-Demand eKey Or PIN

For eKeys:

- Run Step 0.
- Get email.
- Confirm room/property.
- Issue two eKeys: front door and room.
- Send one PadSplit instruction message with the TTLockApp link.

For PIN:

- Run Step 0.
- Generate a permanent custom 4-digit code.
- Assign by member name where supported.
- Send one PadSplit message with the PIN.

## Airbnb Guest Access

Airbnb guests receive timed PINs and timed eKeys. Never use permanent access for Airbnb.

### Triggers

Queue Airbnb lock tasks when:

- pre-arrival message is received
- confirmed booking is detected
- check-in day is today and access is not provisioned
- checkout has passed and access should be verified
- Jordan requests an Airbnb lock action

Active Airbnb lockouts execute immediately.

### Check-In Access Setup

Steps:

1. Run Step 0 validation.
2. Look up guest name, check-in/out date and time, room, and property.
3. Generate two timed 4-digit PINs: front door and room.
4. Use exact check-in/check-out times.
5. Issue two timed eKeys only if guest email is visible in Airbnb reservation/sidebar.
6. Do not ask the guest for email just to send eKeys. PINs are mandatory; eKeys are optional.
7. Send access through Airbnb.
8. Update `## Current Airbnb Occupancy`.
9. Log timed access.

Name examples:

- `[Guest First Name] - Airbnb Front Door`
- `[Guest First Name] - Airbnb Room [N]`

Airbnb access message shape:

```text
Hey [Name]! Here's everything you need for check-in:

Front door code: [FRONT PIN] - this works on the keypad at the front entrance.
Your room ([Room N]) code: [ROOM PIN] - this opens your private room.

Both codes activate at [check-in time] on [check-in date] and expire at [check-out time] on [check-out date].

I've also issued you a digital key (eKey) - if you'd like to unlock with your phone, install the TTLockApp (http://onelink.to/ttlock), register with the email on your Airbnb account, and you'll be able to unlock both doors from the app. This is optional - the keypad codes work perfectly on their own.

WiFi - Network: [NETWORK] | Password: [PASSWORD]

Just a heads up - this is a co-living home, so you'll have your own private room and share common areas like the kitchen and living room with other residents. Everyone's friendly and respectful. Let me know if you need anything!
```

Omit eKey, WiFi, or co-living paragraphs when not applicable or already disclosed.

### Checkout Verification

Every run:

1. Check Knowledge Hub for Airbnb guests whose checkout date is today or in the past and status is `in-house`.
2. Verify timed PINs and eKeys expired.
3. Delete/disable anything still active.
4. Clean expired entries from lists if appropriate.
5. Update occupancy status to `checked out`.
6. Log verification.

If a guest asks for access after checkout, do not re-provision without Jordan approval and Airbnb booking modification.

### Airbnb Guest Lockout

Steps:

1. Run Step 0.
2. Verify current time is within reservation window.
3. If PINs should still work, resend them.
4. If PINs fail after correct entry, generate replacement timed PINs within the same approved window.
5. Reissue timed eKeys when guest email is available.
6. If hardware seems at fault, treat as Tier 1/urgent maintenance and flag Jordan.

### Early Check-In Or Late Checkout

Never adjust lock access windows without Jordan approval.

If approved:

1. Delete existing timed PINs for front door and room.
2. Generate new timed PINs with adjusted windows.
3. Adjust timed eKeys if issued.
4. Message guest with updated codes/times.
5. Update Knowledge Hub.
6. Log the adjusted access window.

## Web Portal Fallback Procedures

Use a single dedicated TTLock web portal tab.

Before portal work:

- Read `lock-registry.md`.
- Load it once and cache it in memory.
- Sort lock queue by account number.
- Process all actions for one account before switching.
- Use approved credentials from Jordan's password manager or current session context. Do not write credentials into skill files, logs, screenshots, or Knowledge Hub.

Login:

1. Navigate to `https://lock2.ttlock.com`.
2. If login form appears, use the registry to choose the account.
3. If already logged in, verify the active account.
4. If wrong account, log out and switch.
5. If login fails, CAPTCHA/MFA appears, or security challenge appears, skip that account's actions and flag Jordan.

Navigating to a lock:

1. Use page text as the primary read tool.
2. Search for property address or exact lock name from registry.
3. Open the target lock detail view.
4. Locate Passcodes/Passwords, eKeys/Access, Records, or Settings.
5. Use screenshots only when text extraction is ambiguous or empty.

Issue eKey:

1. Open target lock.
2. Open eKey/send access form.
3. Fill recipient email, key name, type, and time window if timed.
4. Submit.
5. Confirm success by success text or new eKey entry.
6. Repeat for front door and room as required.

Generate PIN:

1. Open target lock.
2. Open Passcodes/Passwords.
3. Add passcode.
4. Choose Permanent/Custom for PadSplit or Timed for Airbnb.
5. Enter a manually chosen non-trivial 4-digit PIN.
6. Use the same PadSplit member PIN on front door and room.
7. Use timed Airbnb PINs matching exact reservation windows.
8. Record the PIN for the outgoing platform message.

Revoke access:

1. Open target lock.
2. Delete/revoke eKey entries by member/guest name.
3. Delete PIN/passcode entries by member/guest name.
4. Confirm entries are gone.
5. Repeat across front door and room.

Read front door PIN list:

1. Open front door lock.
2. Open Passcodes/Passwords.
3. Read full passcode list.
4. Find the member/room assignment.

Registry Discovery:

1. Log into each configured account listed in `lock-registry.md`.
2. Read the complete lock list.
3. Record exact lock names.
4. Group by property.
5. Update `lock-registry.md`.
6. Log: `Lock registry updated - [N] locks cataloged across [N] accounts`.

Only run discovery when the registry is unpopulated, a new property is onboarded, locks moved accounts, or a lock action fails due to stale registry.

## Token Efficiency For Portal Work

- Prefer page text over screenshots.
- Sort by account before beginning.
- Use the registry; do not search across accounts unnecessarily.
- Reuse one portal tab.
- Do not re-read the registry mid-run.
- If an action fails, log it, skip that action, continue to the next, and flag Jordan.

## Guardrails

PadSplit:

- Validate digital locks before lock actions.
- Never send eKeys/PINs before move-in morning unless Jordan approves.
- Always issue two eKeys per member.
- Always send one PadSplit message after eKeys.
- eKeys work when locks are offline.
- Existing PINs work when locks are offline.
- Get email from hub/dossier or React extraction; do not guess.
- Confirm exact member before revoking.
- Never share one member's PIN/eKey with another person.
- Keep one dedicated CoSpace Locks tab open during lock work.
- If re-authentication is required, log it and notify Jordan.

Airbnb:

- Always use timed PINs and timed eKeys.
- Never provision access before booking confirmation.
- Match exact check-in/check-out times.
- Never share Airbnb access with PadSplit members or PadSplit access with Airbnb guests.
- Run checkout verification every run.
- Never re-provision after checkout without Jordan approval.
- Never adjust access windows without Jordan approval.
- Name all Airbnb timed PINs/eKeys with `Airbnb`.
- Airbnb front door timed PIN must differ from PadSplit member front door PINs.
- eKeys are optional for Airbnb guests; PINs are mandatory.
