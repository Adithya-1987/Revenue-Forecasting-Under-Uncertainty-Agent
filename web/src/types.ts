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
  cash_risk?: CashRisk | null
  concentration?: { hhi: number | null; effective_deals: number | null; largest: { name: string; expected: number; share: number } | null } | null
}

export interface CashRisk {
  /** expected revenue booked inside the window but paid after it */
  booked_paid_later: number
  overdue_receivables: number
  overdue_count: number
  top: { name: string; amount: number; kind: string }[]
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
  team?: string | null
  segment: 'SMB' | 'Mid-Market' | 'Enterprise'
  slip_prob?: number | null
  /** chance it closes after the end of the month it was promised for */
  slip_period_prob?: number | null
  days_in_stage?: number | null
  age_days?: number | null
  stage?: string
  expected_close_date?: string
}

/** One logged change to a deal (deal_events). Values are text: a stage, an ISO date, an amount or a status. */
export interface DealEvent {
  deal_id: string
  deal_name: string
  at: string
  kind: 'created' | 'stage' | 'close_date' | 'value' | 'status'
  from_value: string | null
  to_value: string | null
  source: string
  recorded_at: string
}

export interface DealHistory {
  deal: {
    id: string
    name: string
    stage: string
    status: 'open' | 'won' | 'lost'
    value: number
    created_at: string
    stage_entered_at: string
    expected_close_date: string
    push_count: number
    account: string
    segment: RiskDeal['segment']
    payment_terms_days: number
    rep: string
    team: string | null
  }
  events: DealEvent[]
}

export interface Accuracy {
  mape: Record<'30' | '60' | '90', number | null>
  bias: number
  coverage: number | null
  baseline_mape: number | null
  history: { run_at: string; predicted: number; actual: number; p10: number; p90: number }[]
  reps: { id: string; name: string; team?: string; committed: number; actual: number; score: number; label: Calibration
    /** factor the forecast applies to this rep */ correction?: number; basis?: 'commits' | 'model'; periods?: number }[]
  teams?: { team: string; reps: number; committed: number; actual: number; score: number; label: Calibration }[]
  lost_patterns?: { sign: string; deals: number; loss_rate: number; loss_rate_without: number }[]
  seasonality?: Record<string, number>
}
export type Calibration = 'optimist' | 'sandbagger' | 'calibrated'
