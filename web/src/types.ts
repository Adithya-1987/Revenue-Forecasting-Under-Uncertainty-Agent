export type Horizon = 30 | 60 | 90
export type Basis = 'bookings' | 'cash'

export interface Forecast {
  as_of: string
  horizon: Horizon
  basis: Basis
  p10: number
  p50: number
  p90: number
  target: number
  prob_hit_target: number
  top3_share: number
  hhi: number
  series: { date: string; p10: number; p25?: number; p50: number; p75?: number; p90: number }[]
  histogram: { bin: number; count: number }[]
  top_deal?: string
  top_deals?: { name: string; share: number }[]
  /** Same horizon and basis from the previous run, when there is one. */
  prev?: { p10: number; p50: number; p90: number } | null
}

export type CauseType =
  | 'closed_won'
  | 'closed_lost'
  | 'new_deal'
  | 'value_change'
  | 'stage_move'
  | 'close_date'
  | 'decay'
  | 'calibration'
  | 'window_shift'

export interface Cause {
  cause_type: CauseType
  deal_id?: string
  deal_name?: string
  amount: number
  description: string
}

export interface Changes {
  run_id: string
  prev_run_id: string
  horizon: Horizon
  prev_total: number
  curr_total: number
  causes: Cause[]
  residual: number
}

export interface RiskDeal {
  deal_id: string
  name: string
  value: number
  p_win: number
  p_win_low: number
  p_win_high: number
  expected_damage: number
  reasons: string[]
  rep: string
  segment: 'SMB' | 'Mid-Market' | 'Enterprise'
}

export interface Accuracy {
  mape: Record<'30' | '60' | '90', number>
  bias: number
  coverage: number
  baseline_mape: number
  history: { run_at: string; predicted: number; actual: number; p10: number; p90: number }[]
  reps: { id: string; name: string; committed: number; actual: number; score: number; label: 'optimist' | 'sandbagger' | 'calibrated' }[]
}
