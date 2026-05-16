# Risk And Revenue

Use this file as the Step 5 navigation page for the once-per-run risk/revenue pulse.

Skip risk and revenue pulse work when `hub_available = false`.

## Detailed Protocols

- Read `risk-ledger.md` for member risk scoring, financial reconciliation, P0/P1/P2 thresholds, and `_RISK-LEDGER.md` output format.
- Read `revenue.md` for occupancy, pricing signals, fill-rate trends, pacing/churn alerts, Airbnb utilization, and `_REVENUE.md` output format.

## Execution Summary

Step 5:

- Build risk scores and financial reconciliation flags in memory.
- Build revenue pulse signals in memory.
- Do not write ledgers yet.

Step 10:

- Append risk results to `{VAULT}/_RISK-LEDGER.md`.
- Append revenue results to `{VAULT}/_REVENUE.md`.
- Use targeted edits above `<!-- append -->` markers when present.
- Do not rewrite full ledger files unless creating them for the first time.

## P0 Handling

P0 risk or revenue flags must be surfaced to Jordan immediately during the run. Do not wait for Step 10 write-back.
