# Message Playbook

Use this file when processing PadSplit or Airbnb inboxes.

## Inbox Depth Protocol

Do not stop at the initially visible inbox rows. Every run must build a scan list before deciding there is nothing to do.

For each platform inbox:

1. Initialize `seen_conversations`, `work_queue`, `oldest_timestamp_seen`, and `stop_reason`.
2. Scan the visible conversation list. For each row, capture the stable identifier available in the UI: conversation/member/guest name, property/listing if visible, preview text, timestamp/date label, unread marker state, and whether the preview appears to be inbound from the member/guest.
3. Add a row to `work_queue` when either is true:
   - It has an unread marker.
   - It is a same-day unresponded inbound conversation: the newest visible preview/recent thread indicates the member/guest sent the latest human message today and no later host reply is visible in the thread.
4. Scroll the conversation list downward and repeat. Use small page-sized scrolls so rows are not skipped. Continue until one of these stop conditions is met:
   - At least 40 unique conversations have been scanned and the oldest visible timestamp is older than today.
   - Two consecutive scroll pages add no new conversation rows.
   - The bottom/end of the inbox list is reached.
5. If messages commonly spill past the first 40 rows, keep going until the oldest visible timestamp is older than today and two consecutive pages have no unread or same-day inbound candidates.
6. Preserve scroll position or enough row identity to return to the next unprocessed item after opening a thread. Never restart at the top and accidentally end the run early.
7. After processing `work_queue`, do a same-day backfill pass over the scanned rows: open any same-day inbound row that was not handled because no unread marker was present, verify whether the latest message is still unresponded, and respond or log the skip reason.

Run log requirements:

- `PadSplit scan depth: [N] unique conversations scanned; oldest reached: [timestamp/date]; stop reason: [reason]`
- `Airbnb scan depth: [N] unique conversations scanned; oldest reached: [timestamp/date]; stop reason: [reason]`
- `Same-day unresponded backfill: [N] checked / [N] replied / [N] skipped`

If the UI cannot expose timestamps or row identity reliably, log that as a P1 run-quality issue and scan more conservatively: at least 60 unique rows or until the bottom of the list.

## Skip Logic

Skip and log:

- Closed chats unless a host explicitly reopened them.
- Platform/system notifications.
- Conversations where a non-automation host has already handled the last message.
- Conversations where another host replied within 30 minutes.
- Active back-and-forth with another host, unless there is a genuine safety emergency.
- Conversations already replied to in `session_replied`.

Even when skipping, scan the last few messages for follow-up triggers:

- Named complaint about another resident -> queue direct follow-up.
- House-wide active issue -> queue a broadcast after status is verified.

## PadSplit Reply Categories

Use the Knowledge Hub first, then PadSplit dashboard.

- Thank-you/closing: brief warmth. Avoid sign-off.
- Rental inquiry/availability: look up actual availability and rate before answering.
- Lockout/access issue: reassure immediately, then follow `locks.md`.
- Maintenance request: direct the member to submit a PadSplit maintenance ticket. Do not promise a technician or dispatch timeline unless a ticket already exists and Jordan has authorized the commitment.
- Tier 1 maintenance/safety: no access caused by lock failure, flooding, no heat below 60 F, no AC above 90 F, gas/smoke/fire, credible threat. Reply urgently and flag P0.
- Tier 2 maintenance: lock will not secure, no hot water, HVAC not working in non-extreme weather, broken exterior door/window. Reply and flag P1.
- Tier 3 maintenance: appliance issue, minor repair, ordinary pest sighting, cleaning/supply request. Reply with ticket instructions.
- Complaint about another resident: acknowledge, say it will be addressed directly, then queue follow-up. Do not reveal reporter identity.
- Move-in/move-out: verify real dates in Details before answering. Trigger lock protocol when needed.
- Missing linens: explain that rooms are furnished with bed frame/mattress but bedding/linens are member-provided.
- Locked bathroom/padlocked door: do not promise removal or unlocking. Acknowledge and flag for Jordan review.
- Billing/refund: answer visible facts only. Refunds and billing adjustments go to PadSplit Support; do not claim host can process them.
- Distressed message: lead with warmth before logistics.
- Aggressive message: stay calm, ask for the specific issue, avoid concessions under pressure.
- Direct physical threat: do not escalate the argument; flag P0 immediately and notify Jordan.

## Past-Due Outreach

Before any past-due message:

- Exclude financial status `Eviction` unless Jordan explicitly directs a specific same-day message.
- Skip if the member was contacted about payment in the last 3 days.
- Skip and flag if there is an active dispute, extension, or promise-to-pay thread.
- Do not threaten eviction, legal action, debt collection, or platform penalties beyond factual standing/rental-history language.
- Never disclose another resident's payment status.

Use a firm, supportive tone for 1-6 days overdue, a more urgent tone for 7-13 days, and a serious tone for 14+ days. For vacated members with unpaid balances, request immediate contact without legal threats.

## Airbnb Hybrid Co-Living Rules

These are rooms in active co-living homes, not private whole-home rentals.

- Be hospitality-forward, but honest that common areas are shared.
- Say "residents", "household", or "other guests/residents"; never name PadSplit members or disclose their platform status.
- For first pre-arrival messages, proactively mention shared common areas when appropriate.
- Do not provision access for inquiries. Provision timed access only for confirmed bookings.
- Do not approve early check-in or late checkout without Jordan's approval.
- For lockout during stay, execute lock protocol immediately.
- For maintenance, use the same urgency tiers and prefix logs with `[Airbnb]`.
- For complaints about another resident, handle both sides in the same run and flag P1 as a cross-platform incident.
- Do not solicit reviews explicitly after stay.

## Cross-Platform Incidents

A cross-platform incident involves Airbnb and PadSplit occupants at the same property, or an issue requiring action on both platforms.

Rules:

- Handle both sides in the same run.
- Never reveal the other party's platform, room, private details, or occupancy type.
- Apply equal respect and accountability to all occupants.
- Flag every cross-platform incident for Jordan.
- Log as `[Cross-Platform] [timestamp] [property] - [description and actions taken]`.

## Follow-Up Actions

Named complaint:

1. Search for the accused person in PadSplit or Airbnb, as appropriate.
2. Read enough recent thread context to avoid contradicting prior host instructions.
3. Send a factual, non-inflammatory corrective message.
4. Do not name the reporter.
5. Queue Knowledge Hub and dossier notes.

House-wide issue:

1. Check ticket/status first.
2. If complete/resolved, do not broadcast.
3. If active and unresolved, send a brief factual house broadcast.
4. If Airbnb occupancy is active at the property, send a platform-appropriate parallel Airbnb message.

Same issue at multiple properties:

- Log a pattern and flag P1.
- Do not broadcast cross-property information to residents.

## Dispute-Containment Mode

If Jordan asks to "filibuster" a member, interpret it as dispute-containment:

- Be thorough, procedural, and policy-grounded.
- Ask necessary clarifying questions.
- Avoid concessions or commitments not authorized by Jordan.
- Do not intentionally waste time, mislead, bury the answer, or obstruct a legitimate safety/maintenance issue.
- Never apply this mode to Airbnb guests or emergencies.

## Language Handling

If a message is roughly 30% Spanish or clearly mixed Spanish/English:

- Set `language_detected[name]` to `es` or `mixed`.
- Reply in English first, blank line, then Spanish.
- Keep the Spanish natural and concise.
- Queue `language-preference: es` or `mixed` in the dossier.
- For the full detection and bilingual style protocol, read `voice-drift.md`.

## Voice Self-Check

For the full voice consistency, confidence scoring, drift logging, and language protocol, read `voice-drift.md`. The reminders below are only the compact checklist.

Reject and revise any draft containing:

- PadSplit terms in an Airbnb message or Airbnb terms in a PadSplit message.
- Another resident's private details.
- A final line that is a sign-off, name, or closing phrase.
- "I understand your frustration"
- "I apologize for any inconvenience"
- "Please don't hesitate to"
- "As per our conversation"
- "I hope this message finds you well"
- "Thank you for bringing this to our attention"

Score sent replies in the log:

- F: factual accuracy, 1-5.
- T: tone fit, 1-5.
- S: situational read, 1-5.

Any score at or below 2 creates a P1 flag, but confidence scoring is log-only; do not fabricate or hold a reply because of the score.
