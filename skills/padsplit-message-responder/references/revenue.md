# REVENUE.md - Risk + Revenue Pulse Step 5

Load this file during Step 5 of each `padsplit-message-responder` run when `hub_available = true`. It defines how to analyze occupancy, pricing signals, fill-rate trends, pacing alerts, and Airbnb utilization across the CoHost Management portfolio.

Build the pulse in memory during Step 5. Write it to disk during Step 10 hub write-back.

## Portfolio Scope

- Operator: Jordan Ruvalcaba / CoHost Management.
- Property types: PadSplit co-living houses and Airbnb-enabled rooms.
- Active markets: Jacksonville FL, Denver CO, Tampa FL, Sarasota FL, Miami FL, Gainesville FL, Ocala FL, San Antonio TX, Atlanta GA, and others.
- Approximate property count: about 22.
- Property files: `{VAULT}/{AddressSlug}.md`.
- Revenue output file: `{VAULT}/_REVENUE.md`.

## Step 5A - Occupancy Pulse

Goal: track how full each property is and flag underperforming properties early.

Efficiency rule:

Do not load all property files just to calculate occupancy. Instead:

1. Scan member dossier files in `{VAULT}/members/`.
2. Read YAML fields `property` and `status`.
3. Group dossiers with `status: Active` by `property`.
4. Active member count per property equals active dossiers grouped to that property string.
5. Compare active count to `total-rooms`. Pull `total-rooms` from the property file YAML only if not already cached.

Room count fallback:

- If `total-rooms` is absent, estimate from named rooms in the `Current Members` section.
- If that is unavailable, mark `room count unknown`, skip the property in the occupancy table, and note it in the summary.

Occupancy calculation:

```text
occupancy_pct = (active_member_count / total_rooms) * 100
```

Flag thresholds:

| Condition | Flag |
|---|---|
| Occupancy below 75% for 7+ consecutive days, confirmed by prior revenue entries | P1 |
| Occupancy below 50% for any duration | P1 |
| Single room confirmed vacant more than 14 days | P2 fill-rate |
| Single room confirmed vacant more than 21 days | P1 fill-rate |

To confirm 7+ consecutive days, check the last 2-3 Revenue Pulse entries in `_REVENUE.md`. If the property appears below 75% in each prior entry, the threshold is met.

## Step 5B - Pricing Signals

Goal: detect rooms priced below market, especially when they have been vacant.

Only check rooms already identified as vacant in Step 5A.

Process:

1. Load the property file, using cache if available.
2. Read `market-rate-benchmark` from YAML frontmatter.
3. If absent, skip the property. Do not guess market rate.
4. Read the room's `current-rate` weekly value from the property file or the most recent PadSplit hub entry for that listing.
5. Apply the threshold.

Pricing threshold:

```text
current_rate < market_rate_benchmark * 0.90
AND room has been vacant > 14 days
=> P1 pricing signal
```

Log format:

```text
[PRICING] [Property] Room [N]: $[current]/week listed, $[benchmark]/week benchmark - [N] days vacant. Consider rate adjustment.
```

The skill flags only. Pricing decisions belong to Jordan.

## Step 5C - Fill-Rate Tracking

Goal: measure how quickly vacant rooms fill and identify properties that are slow to refill.

Data source:

- Vacancy date: move-out date recorded when a member's status changed to `Moving out` or `Terminated`.
- Fill date: move-in date recorded when a new member at that room reached `status: Active`.

Tracking process:

1. When a member moves out, note date and room number in the property file.
2. When a new member moves in at that room, calculate `fill_days = move_in_date - vacancy_date`.
3. Append to the property file fill-rate log:

```text
Room [N]: vacant [YYYY-MM-DD] -> filled [YYYY-MM-DD] = [N] days
```

4. Create the fill-rate log section if absent.
5. Update `avg-fill-days` in property YAML with the running average across recorded fill events.

Flag thresholds:

| Condition | Flag |
|---|---|
| Single room fill time over 21 days | P1 |
| Portfolio avg fill-time deteriorating vs 30-day average with 3+ data points | P1 trend |

For portfolio trend, use `avg-fill-days` fields across properties with 3 or more fill events. Compare current rolling average to the value from 30 days prior if captured in a prior pulse entry.

## Step 5D - Pacing And Churn Alerts

Goal: detect churn acceleration when move-outs significantly outpace move-ins at a property.

Process:

1. For each property, count move-outs in the last 30 days from dossiers where status changed to `Terminated` or `Moving out` with a date in the window.
2. Count move-ins in the last 30 days from dossiers where status changed to `Active` with a date in the window.
3. Apply thresholds.

Thresholds:

| Condition | Flag |
|---|---|
| move_outs > move_ins + 1 in last 30 days | P1 churn |
| move_outs > move_ins + 2 in last 30 days | P0 churn |

Churn log format:

```text
[CHURN] [Property]: [N] move-outs vs. [N] move-ins in last 30 days - net [+/-N]. Occupancy: [%].
```

P0 churn alerts must appear prominently in the run log summary, not only in the revenue pulse.

## Step 5E - Airbnb Occupancy Tracking

Goal: track Airbnb room utilization separately from PadSplit member occupancy.

Process:

1. For each property with `Active on Airbnb: yes`, load or use cached property file.
2. Read `Current Airbnb Occupancy`.
3. Identify rooms currently `in-house` or `pre-arrival`.
4. Flag any Airbnb-listed room with zero bookings in the past 14 days as P2 Airbnb pacing.
5. Include Airbnb utilization as a separate row or subsection. Do not blend with PadSplit occupancy percentages.

## Step 5F - Revenue Pulse Output

The pulse is built in memory during Step 5 and committed during Step 10. Append the pulse block above `<!-- append -->` in `_REVENUE.md`.

If `_REVENUE.md` does not exist, create:

```markdown
# CoHost Management - Revenue Intelligence
*Auto-appended by padsplit-message-responder on each run.*
---
<!-- append -->
```

Pulse block:

```markdown
---
## [YYYY-MM-DD HH:MM] Revenue Pulse

### Portfolio Occupancy
| Property | Total Rooms | Active | Occupancy % | Flag |
|----------|-------------|--------|-------------|------|
| [Address short] | [N] | [N] | [%] | P1 / P2 / - |

Portfolio average: [%] occupancy ([N]/[N] rooms filled)

### Vacant Rooms > 7 Days
- [Property] Room [N]: vacant [N] days | Rate: $[amt]/week | Benchmark: $[amt] | Flag: P1 / P2 / -

### Pricing Signals
- [Property] Room [N]: [description] - P1 / -

### Pacing / Churn Alerts
- [Property]: [description] - P0 / P1 / -

### Airbnb Pacing
- [Property] [Room/Unit]: [N] days without booking - P2 / -

### Summary
- P0 revenue flags: [N] | P1: [N] | P2: [N]
- Portfolio occupancy: [%] (vs. last run: [+/-]%)
---
```

If no revenue flags were generated:

```markdown
---
## [YYYY-MM-DD HH:MM] Revenue Pulse
Revenue pulse complete - no flags.
---
```

## Efficiency Rules

| Rule | Detail |
|---|---|
| Dossier-first occupancy | Build occupancy counts from member dossier YAML. Load property files only for room count and pricing fields, and only when needed. |
| Cache loaded files | If a property file is loaded during Step 5, cache it so Step 8 does not reload it. |
| Skip properties with no data | If a property has no dossier files and no recently cached property file, skip and note `[Property]: insufficient data - skipped.` |
| Revenue pulse writes in Step 10 | Step 5 builds the pulse object only. Step 10 commits it to `_REVENUE.md` using a targeted edit above `<!-- append -->`. |
| Reuse prior pulse for trend checks | Read `_REVENUE.md` once at the start of Step 5 to extract prior occupancy percentages. Do not re-read it later. |

## Flag Reference

| Flag | Level | Trigger |
|---|---|---|
| Occupancy sustained low | P1 | Below 75% for 7+ consecutive days |
| Occupancy critically low | P1 | Below 50% regardless of duration |
| Fill-rate extended vacancy | P2 | Single room vacant more than 14 days |
| Fill-rate critical vacancy | P1 | Single room vacant more than 21 days |
| Pricing signal | P1 | Rate more than 10% below benchmark and vacant more than 14 days |
| Fill-rate trend | P1 | Portfolio avg fill-time worsening vs 30-day avg with 3+ data points |
| Churn alert | P1 | move-outs > move-ins + 1 in 30 days |
| Severe churn alert | P0 | move-outs > move-ins + 2 in 30 days |
| Airbnb pacing | P2 | Zero bookings in past 14 days for an active Airbnb room |

P0: raise prominently in the run log for immediate Jordan review.

P1: raise in the run log for next-check review.

P2: log only.
