# RISK-LEDGER.md

Companion file for Step 5: Risk + Revenue Pulse.

Load this file at runtime to score member risk, detect financial reconciliation failures, and write the daily risk ledger to `{VAULT}/_RISK-LEDGER.md`.

Risk scoring runs opportunistically during Step 5. Score members whose dossiers are already in memory. Do not load additional dossier files solely to run scores. If doing a targeted sweep, load dossiers for members with the worst-known balances first.

Write-back to `_RISK-LEDGER.md` happens in Step 10 hub write-back, not Step 5. Step 5 builds scores and flags in memory.

## Early-Warning Scoring Formula

Score each member on a 1-10 weighted composite using four independent factors.

### Factor A - Balance Trajectory

Weight: 40%.

Negative balance means the member owes money.

| Balance Range | Score |
|---|---:|
| <= -$800 | 10 |
| -$600 to -$799 | 8 |
| -$400 to -$599 | 6 |
| -$200 to -$399 | 4 |
| -$50 to -$199 | 2 |
| > -$50 | 0 |

### Factor B - Message Sentiment

Weight: 25%.

Score from the tone of the member's most recent inbound message.

| Tone | Score |
|---|---:|
| Hostile or threatening | 10 |
| Frustrated, confrontational, or complaint | 7 |
| Neutral inquiry | 4 |
| Positive, thank-you, or no recent message | 0 |

### Factor C - Days Since Last Payment

Weight: 20%.

Estimate from balance trend and `last-updated`. If days cannot be determined, use score 3 as a conservative neutral estimate.

| Days Since Last Payment | Score |
|---|---:|
| > 21 days | 10 |
| > 14 days | 7 |
| > 7 days | 4 |
| <= 7 days | 0 |
| Cannot be determined | 3 |

### Factor D - Lockout History

Weight: 15%.

Use `lockout-count` from the member dossier. This is total ever recorded, not only the last 30 days.

| Lockout Count | Score |
|---|---:|
| 3+ | 10 |
| 2 | 5 |
| 1 | 2 |
| 0 | 0 |

### Composite Score

```text
Composite = (A * 0.40) + (B * 0.25) + (C * 0.20) + (D * 0.15)
```

Round to one decimal place.

### Flag Thresholds

| Score Range | Flag | Action |
|---|---|---|
| >= 9.0 | P0 | Alert Jordan now |
| 7.0-8.9 | P1 | Prominent in run log |
| 5.0-6.9 | P2 | Log only |
| < 5.0 | none | No flag |

## Scoring With Incomplete Data

Use defaults rather than skipping a member entirely.

| Missing Data | Default |
|---|---|
| `balance` absent or unreadable | Factor A = 0. Flag if balance was expected. |
| No dossier exists | Factor D = 0. |
| No recent inbound message to assess tone | Factor B = 0. |
| Cannot calculate days since last payment | Factor C = 3. |

Document defaults in the ledger entry when they affect the score.

## Financial Reconciliation Loop

Runs during Step 5 alongside risk scoring.

Purpose: catch members whose balances should have resolved but have not moved in 48+ hours.

Protocol:

1. Scan member dossier files where `payment-tier: weekly` and `balance < -200`.
2. Calculate days since `last-updated`.
3. If `last-updated` is today, skip.
4. If more than 2 days and balance has not changed, flag reconciliation.
5. Cross-reference `last-contact`. If recently contacted about balance and still no movement or response, add a non-responsive note.

Escalation thresholds:

| Condition | Flag | Note |
|---|---|---|
| balance < -$200 and last-updated > 2 days | P1 | Reconciliation issue |
| balance < -$500 and last-updated > 7 days | P0 | Reconciliation issue |
| balance < -$200 and last-updated > 2 days and no response in 48h | P1 | Non-responsive |

Required log format:

```text
[FIN-RECON] [Member] @ [Property]: balance $[amount], last-updated [N] days ago. Tier: [payment-tier]. Status: [P0/P1].
```

Example:

```text
[FIN-RECON] Marcus Webb @ 214 Elm St Rm 3: balance $-620, last-updated 9 days ago. Tier: weekly. Status: P0.
```

## Daily Risk Ledger Format

Target file:

`{VAULT}/_RISK-LEDGER.md`

Write behavior:

- Append only.
- Use targeted edit to insert entries above `<!-- append -->`.
- Write-back happens in Step 10.

If the file is empty or has no prior entries, prepend:

```markdown
# CoHost Management - Risk Ledger
*Auto-appended by padsplit-message-responder on each run.*
---
```

Ledger block template:

```markdown
---
## [YYYY-MM-DD HH:MM] Risk Ledger

### Top Risk Members (score >= 5.0)
| Member | Property | Score | Balance | Sentiment | Days No Pay | Lockouts | Flag |
|--------|----------|-------|---------|-----------|-------------|----------|------|
| [Name] | [Addr]   | [X.X] | $[amt]  | [tone]    | [N]         | [N]      | P0/P1/P2 |

### Financial Reconciliation Flags
- [Member] @ [Property]: $[balance], [N] days since update - P0/P1

### Score Changes Since Last Run
- [Member]: [old score] -> [new score] (+/-[delta])

### Summary
- Members scored this run: [N]
- P0 flags: [N] | P1 flags: [N] | P2 flags: [N]
- Financial reconciliation flags: [N]
---
```

Field notes:

- Score: one decimal place.
- Balance: include sign and dollar sign, such as `$-450` or `$+25`.
- Sentiment: `hostile`, `frustrated`, `neutral`, `positive`, or `n/a`.
- Days No Pay: integer or `?` if unknown.
- Lockouts: integer from `lockout-count`, or `0` if no dossier.
- Flag: `P0`, `P1`, `P2`, or blank if score below 5.0.

If no members scored 5.0 or higher, replace the Top Risk Members table with:

```text
No high-risk members identified this run.
```

Score changes are optional. Only include the section if prior scores are available in recent context. If not, omit it entirely.

If no FIN-RECON flags were raised, write:

```text
No financial reconciliation flags this run.
```

## Integration Notes

Execution order:

| Step | Action |
|---|---|
| Step 5 | Score dossiers already in memory, build FIN-RECON flags, hold results in memory. |
| Step 10 | Write results to `{VAULT}/_RISK-LEDGER.md` above `<!-- append -->`. |

Scoring discipline:

- Score opportunistically as dossiers are accessed during the normal run.
- Do not make extra reads solely to generate scores.
- For targeted sweeps, load worst-known-balance members first using visible data in existing member files.

Past scores are not required. Current scores come from current dossier/live data. Use past scores only for optional score-change notes if already available.

P0 escalation:

- Any composite score >= 9.0 or P0 FIN-RECON flag must be surfaced to Jordan immediately.
- Do not wait for Step 10 write-back.

## Quick Reference

```text
FACTOR A (Balance, weight 0.40)
  <= -800 -> 10 | -600 to -799 -> 8 | -400 to -599 -> 6
  -200 to -399 -> 4 | -50 to -199 -> 2 | > -50 -> 0

FACTOR B (Sentiment, weight 0.25)
  hostile -> 10 | frustrated -> 7 | neutral -> 4 | positive/none -> 0

FACTOR C (Days no pay, weight 0.20)
  > 21 -> 10 | > 14 -> 7 | > 7 -> 4 | <= 7 -> 0 | unknown -> 3

FACTOR D (Lockouts, weight 0.15)
  3+ -> 10 | 2 -> 5 | 1 -> 2 | 0 -> 0

COMPOSITE = (A * 0.40) + (B * 0.25) + (C * 0.20) + (D * 0.15)
Round to 1 decimal.

FLAGS: >= 9.0 -> P0 | 7.0-8.9 -> P1 | 5.0-6.9 -> P2 | < 5.0 -> none

FIN-RECON:
  balance < -500 + last-updated > 7 days -> P0
  balance < -200 + last-updated > 2 days -> P1
  balance < -200 + last-updated > 2 days + no response 48h -> P1
```

---

<!-- append -->
