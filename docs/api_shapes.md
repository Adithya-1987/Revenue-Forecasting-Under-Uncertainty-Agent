# API shapes (frontend <-> Node)

Types live in `web/src/types.ts`. Money is in rupees (number), probabilities 0..1, dates ISO.

| Endpoint | Returns |
|---|---|
| `GET /forecast?horizon=30\|60\|90&basis=bookings\|cash` | `Forecast` |
| `GET /forecast/changes?run_id=` (omit = latest) | `Changes` |
| `GET /deals/risk` | `RiskDeal[]` |
| `GET /metrics/accuracy` | `Accuracy` |
| `POST /run` | `{ run_id }` |
| `GET /events?limit=50` | `DealEvent[]` (latest changes first, creations left out) |
| `GET /deals/:id/history` | `DealHistory` |

```ts
Forecast { as_of, horizon, basis, p10, p50, p90, target, prob_hit_target, top3_share, hhi,
  series: [{ date, p10, p50, p90 }], histogram: [{ bin, count }], top_deal? }

Changes { run_id, prev_run_id, horizon, prev_total, curr_total,
  causes: [{ cause_type, deal_id?, deal_name?, amount, description }], residual }
// Invariant: sum(causes.amount) + residual === curr_total - prev_total
// cause_type in fixed order: closed_won, closed_lost, new_deal, value_change, stage_move,
//   close_date, decay, calibration, window_shift

RiskDeal { deal_id, name, value, p_win, p_win_low, p_win_high, expected_damage, reasons: string[], rep, segment }
// expected_damage = value * (1 - p_win); p_win_low/high = band for the row RangeBand (added to spec)

Accuracy { mape: { 30, 60, 90 }, bias, coverage, baseline_mape,
  history: [{ run_at, predicted, actual, p10, p90 }],
  reps: [{ id, name, committed, actual, score, label: optimist|sandbagger|calibrated }] }

DealEvent { deal_id, deal_name, at, kind: created|stage|close_date|value|status, from_value?, to_value?, source, recorded_at }
// Logged by database triggers on deals (migration 0005): every writer is captured the same way.
DealHistory { deal: { id, name, stage, status, value, created_at, stage_entered_at, expected_close_date, push_count,
  account, segment, payment_terms_days, rep, team }, events: DealEvent[] }
```
