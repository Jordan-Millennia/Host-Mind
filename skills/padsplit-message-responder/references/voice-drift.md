# VOICE-DRIFT.md

Voice consistency, confidence scoring, drift logging, and language detection for `padsplit-message-responder`.

Load at Step 1c when initializing `voice_drift_corrections[]`. Reference during message processing before every send.

## Voice Consistency Self-Check

Run on every drafted reply before typing into the message box. All five checks must pass. If any check fails, revise and re-run all five from the top.

### Check 1 - Platform Bleed

Prevent PadSplit-specific language from appearing in Airbnb messages, and vice versa.

Never use in Airbnb messages:

- `member`; use `guest` or `you`
- `PadSplit`
- `house message`
- `move-in date`; use `check-in date`
- `weekly rate`; use `nightly rate` or `your reservation rate`
- `lease` or `lease agreement`

Never use in PadSplit messages:

- `guest`; use `member` or the person's name
- `reservation`
- `check-in` or `check-out`; use `move-in` and `move-out`
- `Airbnb`
- `listing`
- `booking`

Context rule:

- PadSplit: address a long-term co-living resident.
- Airbnb: address a short-term guest in a shared home.

### Check 2 - Cross-Member Privacy

Remove any reference to another person's:

- name
- room number
- payment status or balance
- personal situation
- reason they are being contacted separately

The person being addressed must never learn another occupant's situation through their own conversation.

### Check 3 - Sign-Off

The last character of every message must be the punctuation mark of the final content sentence.

The message must not end with:

- Jordan's name or initials
- `Thanks`, `Best`, `Take care`, `Cheers`, or `Regards`
- a comma-separated trailer that reads like an email sign-off

The `Jordan` signature seen in PadSplit automated messages is a platform artifact. Do not replicate it.

### Check 4 - Robotic Phrase Filter

Replace or remove:

| Detected phrase | Replacement |
|---|---|
| `I understand your frustration` | Say something real about the situation instead. |
| `I apologize for any inconvenience` | Apologize specifically, or do not apologize. |
| `Please don't hesitate to` | `let me know` |
| `As per our conversation` | `like I mentioned`, or say it directly. |
| `I hope this message finds you well` | Remove entirely. |
| `Thank you for bringing this to our attention` | `good to know`, or address the issue directly. |
| `Per our policy` | State the policy directly. |

### Check 5 - Voice Drift Alignment

Check `voice_drift_corrections[]`, loaded from `_VOICE-DRIFT-LOG.md`.

For each correction pattern:

- If the current message type matches, apply the learned adjustment.
- Example: if Jordan repeatedly replaces `Submit a maintenance ticket` with `Drop a maintenance request in the app`, use Jordan's phrasing.

If `voice_drift_corrections[]` is empty, skip silently.

## Confidence Scoring Protocol

Run after the voice self-check passes and before clicking Send.

This is log-only. It never holds or delays a message.

### Axis F - Factual Accuracy

| Score | Meaning |
|---|---|
| 5 | Directly confirmed against Knowledge Hub data or PadSplit dashboard this run. |
| 4 | Based on reliable hub data that was recently updated. |
| 3 | Best available info; hub data may be stale or topic is not in hub. |
| 2 | Making an assumption; PadSplit lookup would be needed to confirm. |
| 1 | Reply may contain an error or contradict known hub data. |

### Axis T - Tone Fit

| Score | Meaning |
|---|---|
| 5 | Exactly right for this person, message type, and moment. |
| 4 | Close; could be slightly adjusted. |
| 3 | Adequate but not ideal. |
| 2 | Noticeably off: too formal, casual, cold, or warm. |
| 1 | Wrong tone for the situation. |

### Axis S - Situational Read

| Score | Meaning |
|---|---|
| 5 | Intent is clear and reply addresses it completely. |
| 4 | Clear intent, mostly addressed. |
| 3 | Some ambiguity; interpreted the most likely meaning. |
| 2 | Ambiguous; reply addresses one possible interpretation. |
| 1 | May have misread what the person asked or expressed. |

Log format:

```text
{member: "[Name]", F: X, T: X, S: X, summary: "[one word description]"}
```

P1 trigger:

- If a sent reply scored F <= 2, T <= 2, or S <= 2 on any axis, add a P1 flag with the member name and low axis.

No holds. If the reply is factually uncertain, handle it in the message naturally, such as `I'll need to verify that and follow up`.

## Voice Drift Log Protocol

Purpose: detect when Jordan manually replies after the skill and capture voice/judgment corrections for future runs.

Detection runs during Step 11 after messages are processed.

For each PadSplit thread the skill replied to this run:

1. Scan for any message from `Jordan`, not Chef and not PadSplit, sent after the skill's reply.
2. If found, capture member name, property, first 100 characters of the skill reply, first 100 characters of Jordan's reply, and message type.
3. Append to `{VAULT}/_VOICE-DRIFT-LOG.md`.

Likely correction signals:

- Jordan re-addressed the same topic differently.
- Jordan's message is significantly shorter or longer.
- Jordan clearly changed the position or tone.

If unsure, log with `(possible correction - review needed)`.

Log entry format:

```markdown
---
[YYYY-MM-DD HH:MM] | [Member Name] @ [Property] | Type: [message type]
Skill sent: "[first 100 chars of skill's message]"
Jordan sent: "[first 100 chars of Jordan's reply]"
Observed delta: [brief description of what changed - tone, content, phrasing, position]
Pattern: [one-line synthesis]
---
```

### Loading Corrections At Run Start

1. Read the last 10 entries from `{VAULT}/_VOICE-DRIFT-LOG.md`.
2. Extract each `Pattern:` line.
3. Store as informal rules in `voice_drift_corrections[]`.
4. Apply during Check 5.

If the log has fewer than 10 entries, load all. If the log does not exist, skip silently.

### File Initialization

If `_VOICE-DRIFT-LOG.md` does not exist and needs to be written, create:

```markdown
# CoHost Management - Voice Drift Log
*Auto-appended by padsplit-message-responder when Jordan's manual corrections are detected.*
*Loaded at run start to improve voice consistency over time.*
---
<!-- append -->
```

## Language Detection Protocol

When reading an incoming message, check whether it is primarily Spanish or mixed Spanish/English.

Detection rule:

- If at least 30% of message words are Spanish or clearly Spanish-language phrases, flag Spanish preference.

Common indicators:

- `hola`
- `gracias`
- `por favor`
- `habitacion`
- `llave`
- `wifi`
- `cuando`
- `como`
- `ayuda`
- `problema`
- `no funciona`
- mixed constructions such as `the llave does not work` or `help me con el wifi`

When Spanish is detected:

1. Set `language_detected[member_name] = "es"`.
2. Queue dossier update: `language-preference: es`.
3. Generate a bilingual reply: English first, blank line, Spanish second.
4. Make the Spanish natural, not word-for-word.
5. Apply voice self-check to both sections independently.

Avoid in Spanish:

| Avoid | Use |
|---|---|
| `Sin dudas contactarme` | `Cualquier pregunta, avisame` |
| `No dude en comunicarse` | `Avisame si necesitas algo` |
| Over-formal `usted` when the member uses casual `tu` | Match the member's register. |

When mixed language is detected:

- Set `language_detected[member_name] = "mixed"`.
- Generate a bilingual reply.
- Log as mixed.

Log format:

```text
[LANGUAGE] [Member Name] @ [Property]: Spanish/mixed detected - bilingual reply sent. Dossier updated.
```
