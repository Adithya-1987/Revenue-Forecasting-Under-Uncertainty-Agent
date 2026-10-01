"""Turn deal rows into DealInputs: win probability with named factors, close timing with slippage and
seasonality, cash timing from payment terms, and rep calibration.

History rows' features are read 21 days before close (the generator's convention); open rows at as_of.
"""
import math
from collections import defaultdict
from datetime import date, timedelta

import numpy as np
from scipy.stats import norm
from sklearn.linear_model import LogisticRegression

STAGES = ["Qualify", "Demo", "Proposal", "Negotiation"]
# column -> factor name shown to users; stage_* columns fold into one "stage" factor
COLUMNS = ["stage_Demo", "stage_Proposal", "stage_Negotiation", "silent", "pushes", "size", "seg_Mid", "seg_Ent", "stuck", "age"]
FACTOR_OF = {"stage_Demo": "stage", "stage_Proposal": "stage", "stage_Negotiation": "stage", "silent": "silent",
             "pushes": "pushes", "size": "size", "seg_Mid": "segment", "seg_Ent": "segment", "stuck": "stage_time", "age": "age"}
CAL_PSEUDO = 10  # shrinkage: a rep starts with 10 perfectly calibrated deals
OBS_LAG = timedelta(days=21)
MIN_BAND = 40  # fewer closed deals than this in a segment x size band: fall back to the segment
SEASON_SHRINK = 10  # pseudo-closes per month pulling seasonality toward 1.0
# seasonality is applied in the simulation (closes in weak months defer to the next); the median nudge is off
SEASON_WEIGHT = 0.0
CUSTOMER_PSEUDO = 4  # a customer's own lateness counts like this many invoices of its segment's average
MIN_HISTORY = 40  # small books (e.g. a Nova sync with 60 closed quotes) still forecast, with stronger regularisation


def load_payments(conn, ws: str) -> list[dict]:
    """Extra payment history (e.g. every Aczen invoice): customer, segment, terms and days to pay."""
    with conn.cursor() as cur:
        cur.execute(
            "select i.customer_id, c.segment, coalesce(c.payment_terms_days, 30), i.invoice_date, i.paid_date "
            "from invoice_payments i join customers c on c.workspace_id = i.workspace_id and c.id = i.customer_id "
            "where i.workspace_id = %s and i.paid_date is not null", (ws,))
        return [dict(customer_id=r[0], segment=r[1], terms=r[2], ratio=(r[4] - r[3]).days / max(r[2], 1)) for r in cur.fetchall()]


def load_deals(conn, ws: str) -> list[dict]:
    """Deals with segment, payment terms, team, and the dates of their stage changes."""
    with conn.cursor() as cur:
        cur.execute(
            "select d.id, d.name, c.segment, d.salesperson_id, d.customer_id, d.value, d.stage, d.status, d.created_at, "
            "d.expected_close_date, d.last_activity_date, d.push_count, d.closed_at, d.paid_at, "
            "coalesce(c.payment_terms_days, 30), coalesce(p.team, 'Unassigned') "
            "from deals d join customers c on c.workspace_id = d.workspace_id and c.id = d.customer_id "
            "left join salespeople p on p.workspace_id = d.workspace_id and p.id = d.salesperson_id "
            "where d.workspace_id = %s", (ws,))
        cols = ["id", "name", "segment", "salesperson_id", "customer_id", "value", "stage", "status", "created_at",
                "expected_close_date", "last_activity_date", "push_count", "closed_at", "paid_at", "terms", "team"]
        deals = [dict(zip(cols, r)) for r in cur.fetchall()]
        cur.execute("select deal_id, changed_at from stage_events where workspace_id = %s and to_stage <> 'Closed' "
                    "order by changed_at", (ws,))
        changes = defaultdict(list)
        for deal_id, when in cur.fetchall():
            changes[deal_id].append(when)
    for d in deals:
        d["value"] = float(d["value"])
        d["stage_dates"] = changes.get(d["id"], [])
    return deals


def silent_days(d: dict, obs: date) -> int:
    return max((obs - d["last_activity_date"]).days, 0)


def days_in_stage(d: dict, obs: date) -> int:
    """Days since the last stage change on or before `obs`; no history -> since creation."""
    last = max((t for t in d.get("stage_dates", []) if t <= obs), default=d["created_at"])
    return max((obs - last).days, 0)


def age_days(d: dict, obs: date) -> int:
    return max((obs - d["created_at"]).days, 0)


def activity_tracked(deals: list[dict]) -> bool:
    """False when last activity is just the creation date (a source with no activity log, e.g. Nova)."""
    real = sum(d["last_activity_date"] != d["created_at"] for d in deals)
    return bool(deals) and real / len(deals) > 0.2


def feature_row(d: dict, obs: date, medians: dict, activity: bool = True) -> list[float]:
    return [
        d["stage"] == "Demo", d["stage"] == "Proposal", d["stage"] == "Negotiation",
        min(max(silent_days(d, obs) - 7, 0), 60) if activity else 0, d["push_count"], math.log(d["value"] / medians[d["segment"]]),
        d["segment"] == "Mid-Market", d["segment"] == "Enterprise",
        min(max(days_in_stage(d, obs) - 30, 0), 90), min(max(age_days(d, obs) - 60, 0), 300),
    ]


def _lognorm(xs) -> tuple[float, float]:
    logs = np.log(np.maximum(np.asarray(xs, dtype=float), 1e-3))
    return float(logs.mean()), float(max(logs.std(), 0.05))


def band(d: dict, medians: dict) -> str:
    return "large" if d["value"] > medians[d["segment"]] else "small"


def lost_patterns(history: list[dict], medians: dict, activity: bool = True) -> list[dict]:
    """How often deals with each warning sign were lost, against deals without it."""
    signs = {
        "Silent 14+ days": lambda d, o: silent_days(d, o) >= 14,
        "Close date pushed 2+ times": lambda d, o: d["push_count"] >= 2,
        "Stuck in one stage 45+ days": lambda d, o: days_in_stage(d, o) >= 45,
        "Still at Qualify or Demo": lambda d, o: d["stage"] in ("Qualify", "Demo"),
        "Large for its segment (2.5x median)": lambda d, o: d["value"] > 2.5 * medians[d["segment"]],
        "Open 180+ days": lambda d, o: age_days(d, o) >= 180,
    }
    if not activity:
        signs.pop("Silent 14+ days")
    out = []
    for label, test in signs.items():
        hit = [d for d in history if test(d, d["closed_at"] - OBS_LAG)]
        miss = [d for d in history if not test(d, d["closed_at"] - OBS_LAG)]
        if len(hit) < 20 or len(miss) < 20:
            continue
        rate = lambda ds: sum(d["status"] == "lost" for d in ds) / len(ds)  # noqa: E731
        out.append(dict(sign=label, deals=len(hit), loss_rate=round(rate(hit), 3), loss_rate_without=round(rate(miss), 3)))
    return sorted(out, key=lambda x: x["loss_rate"] - x["loss_rate_without"], reverse=True)


def fit(history: list[dict], bootstrap: int = 30, seed: int = 0, payments: list[dict] = ()) -> dict:
    """Fit every model on closed deals. Pure: same rows in, same model out."""
    medians = {s: float(np.median([d["value"] for d in history if d["segment"] == s] or [1]))
               for s in ("SMB", "Mid-Market", "Enterprise")}
    activity = activity_tracked(history)
    X = np.array([feature_row(d, d["closed_at"] - OBS_LAG, medians, activity) for d in history], dtype=float)
    y = np.array([d["status"] == "won" for d in history])
    # less history -> stronger regularisation, so a few deals cannot produce extreme coefficients
    C = 10.0 if len(y) >= 500 else max(0.3, len(y) / 50)
    lr = LogisticRegression(C=C, max_iter=2000).fit(X, y)

    rng = np.random.default_rng(seed)
    boots = []
    for _ in range(bootstrap):
        i = rng.integers(0, len(y), len(y))
        if len(set(y[i])) < 2:
            continue  # a resample with one class cannot be fitted
        b = LogisticRegression(C=C, max_iter=2000).fit(X[i], y[i])
        boots.append(np.append(b.coef_[0], b.intercept_[0]))

    p_hist = lr.predict_proba(X)[:, 1]
    cal = {}
    for rep in {d["salesperson_id"] for d in history}:
        m = np.array([d["salesperson_id"] == rep for d in history])
        cal[rep] = float((y[m].sum() + CAL_PSEUDO) / (p_hist[m].sum() + CAL_PSEUDO))

    # cycle: actual / planned length, per segment and size band (planned = first promised close date)
    def ratio(d):
        return (d["closed_at"] - d["created_at"]).days / max((d["expected_close_date"] - d["created_at"]).days, 1)

    timing = {}
    for s in medians:
        seg = [d for d in history if d["segment"] == s]
        timing[s] = _lognorm([ratio(d) for d in seg] or [1])
        for b in ("small", "large"):
            part = [d for d in seg if band(d, medians) == b]
            timing[(s, b)] = _lognorm([ratio(d) for d in part]) if len(part) >= MIN_BAND else timing[s]

    # cash: days from close to payment as a multiple of the customer's payment terms; per segment, then
    # per customer shrunk toward its segment (a customer with 2 invoices barely moves; one with 20 mostly its own)
    obs = [dict(customer_id=d["customer_id"], segment=d["segment"], ratio=(d["paid_at"] - d["closed_at"]).days / max(d["terms"], 1))
           for d in history if d["paid_at"]] + [o for o in payments if o["ratio"] >= 0]
    payment = {}
    for s in medians:
        paid = [o["ratio"] for o in obs if o["segment"] == s]
        payment[s] = _lognorm(paid) if len(paid) >= 10 else (math.log(1.2), 0.3)
    by_customer = defaultdict(list)
    for o in obs:
        by_customer[o["customer_id"]].append(math.log(max(o["ratio"], 1e-3)))
    customer_pay = {}
    for cid, logs in by_customer.items():
        seg = next((o["segment"] for o in obs if o["customer_id"] == cid), None)
        if seg not in payment or len(logs) < 2:
            continue
        mu_s, sig_s = payment[seg]
        customer_pay[cid] = ((len(logs) * float(np.mean(logs)) + CUSTOMER_PSEUDO * mu_s) / (len(logs) + CUSTOMER_PSEUDO), sig_s)

    # seasonality: closes per calendar month, shrunk toward the average month
    counts = np.bincount([d["closed_at"].month for d in history], minlength=13)[1:]
    raw = (counts + SEASON_SHRINK) / (counts.mean() + SEASON_SHRINK)
    raw = raw / np.exp(np.log(raw).mean())  # geometric mean 1, so the log shifts cancel across the year
    season = {m + 1: float(v) for m, v in enumerate(raw)}

    seen = [d["stage"] for d in history]
    return dict(lr=lr, boots=np.array(boots), means=X.mean(axis=0), medians=medians, cal=cal, timing=timing,
                payment=payment, customer_pay=customer_pay, season=season, p_hist=p_hist, y=y, lost=lost_patterns(history, medians, activity),
                stages_seen=set(seen), common_stage=max(set(seen), key=seen.count), activity=activity)


_Z = np.random.default_rng(1).standard_normal(4000)  # fixed draws: same inputs, same answer


def remaining(mu: float, sigma: float, scale: float, elapsed: float) -> tuple[float, float]:
    """Lognormal fit of (total - elapsed) given total = scale * lognormal(mu, sigma) and total > elapsed.

    An overdue deal is not "7 days from closing": it still has the tail of its slip to live through.
    """
    total = scale * np.exp(mu + sigma * _Z)
    left = total[total > elapsed + 1] - elapsed
    if len(left) < 100:  # far past anything seen: slow, uncertain
        return math.log(max(0.3 * scale, 7)), 0.6
    logs = np.log(left)
    return float(logs.mean()), float(max(logs.std(), 0.1))


def ordinal(n: int) -> str:
    return f"{n}{'th' if 10 <= n % 100 <= 20 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')}"


def month_end(d: date) -> date:
    return (d.replace(day=1) + timedelta(days=32)).replace(day=1) - timedelta(days=1)


def reasons_for(d: dict, as_of: date, cal: float, p: float, slip: float, medians: dict, activity: bool = True,
                slip_period: float = 0.0) -> list[str]:
    out, silent, stuck = [], silent_days(d, as_of), days_in_stage(d, as_of)
    if activity and silent >= 14:
        out.append(f"silent {silent} days")
    if d["push_count"]:
        out.append(f"{ordinal(d['push_count'])} date push")
    if stuck >= 45:
        out.append(f"stuck in {d['stage'].lower()} {stuck} days")
    if slip_period >= 0.6:
        nxt = month_end(max(d["expected_close_date"], as_of)) + timedelta(days=1)
        out.append(f"likely to slip into {nxt:%B} ({round(slip_period * 100)}%)")
    elif slip >= 0.6:
        out.append(f"likely to miss its date ({round(slip * 100)}%)")
    if cal < 0.9:
        out.append("optimistic rep")
    elif cal > 1.1:
        out.append("cautious rep")
    if d["stage"] in ("Qualify", "Demo"):
        out.append("early stage")
    if d["value"] > 2.5 * medians[d["segment"]]:
        out.append(f"large for {d['segment']}")
    if not out and p > 0.6:
        out.append("late stage" if d["stage"] == "Negotiation" else "on track")
    return out[:3]


def deal_inputs(model: dict, open_deals: list[dict], as_of: date) -> list[dict]:
    """The contract: one DealInput per open deal. p_win already includes rep calibration."""
    if not open_deals:
        return []
    lr, med = model["lr"], model["medians"]
    # a stage no closed deal ever had cannot be scored from history: read it as the most common one
    # instead of extrapolating its coefficient (a Nova book with only "sent" quotes has no Qualify)
    seen, common = model.get("stages_seen", set(STAGES)), model.get("common_stage", "Proposal")
    scored = [d if d["stage"] in seen else dict(d, stage=common) for d in open_deals]
    activity = model.get("activity", True)
    X = np.array([feature_row(d, as_of, med, activity) for d in scored], dtype=float)
    raw = lr.predict_proba(X)[:, 1]
    contrib = (X - model["means"]) * lr.coef_[0]  # logit contribution of each column vs an average deal
    b = model["boots"]
    boot_p = 1 / (1 + np.exp(-(X @ b[:, :-1].T + b[:, -1]))) if len(b) else raw[:, None]  # deals x bootstraps
    out = []
    for i, d in enumerate(open_deals):
        cal = model["cal"].get(d["salesperson_id"], 1.0)
        clip = lambda v: float(min(max(v * cal, 0.01), 0.98))  # noqa: E731
        factors: dict[str, float] = {}
        for j, col in enumerate(COLUMNS):
            factors[FACTOR_OF[col]] = factors.get(FACTOR_OF[col], 0.0) + float(contrib[i, j])

        mu_s, sig_s = model["timing"].get((d["segment"], band(d, med)), model["timing"][d["segment"]])
        planned = max((d["expected_close_date"] - d["created_at"]).days, 7)
        cmu, csig = remaining(mu_s, sig_s, planned, (as_of - d["created_at"]).days)
        month = max(d["expected_close_date"], as_of).month
        cmu -= SEASON_WEIGHT * math.log(model["season"].get(month, 1.0))
        to_promise = (d["expected_close_date"] - as_of).days
        slip = 1.0 if to_promise < 0 else float(1 - norm.cdf((math.log(max(to_promise, 1)) - cmu) / csig))
        # slipping into a later period: closing after the end of the month it was promised for
        to_period_end = (month_end(d["expected_close_date"]) - as_of).days
        slip_period = 1.0 if to_period_end < 0 else float(1 - norm.cdf((math.log(max(to_period_end, 1)) - cmu) / csig))

        rmu, rsig = model.get("customer_pay", {}).get(d["customer_id"], model["payment"][d["segment"]])
        p = clip(raw[i])
        out.append(dict(
            deal_id=d["id"], name=d["name"], value=d["value"], stage=d["stage"], segment=d["segment"],
            salesperson_id=d["salesperson_id"], customer_id=d["customer_id"],
            p_win=p, p_win_low=clip(np.percentile(boot_p[i], 10)), p_win_high=clip(np.percentile(boot_p[i], 90)),
            calibration=cal, cycle_mu=cmu, cycle_sigma=csig, slip_prob=slip, slip_period_prob=slip_period,
            payment_delay_mu=math.log(max(d["terms"], 1)) + rmu, payment_delay_sigma=rsig, payment_terms=d["terms"],
            expected_close_date=d["expected_close_date"], days_in_stage=days_in_stage(d, as_of), age_days=age_days(d, as_of),
            factors={k: round(v, 4) for k, v in factors.items()},
            reasons=reasons_for(d, as_of, cal, p, slip, med, activity, slip_period),
        ))
    return out


def receivables(model: dict, deals: list[dict], as_of: date) -> list[dict]:
    """Won but unpaid: signed is not cash. Days left until paid, given it is already this late."""
    out = []
    for d in deals:
        if d["status"] == "won" and d["closed_at"] <= as_of and (d["paid_at"] is None or d["paid_at"] > as_of):
            rmu, rsig = model.get("customer_pay", {}).get(d["customer_id"], model["payment"][d["segment"]])
            mu, sig = remaining(rmu, rsig, max(d["terms"], 1), (as_of - d["closed_at"]).days)
            due = d["closed_at"] + timedelta(days=d["terms"])
            out.append(dict(name=d["name"], value=d["value"], mu=mu, sigma=sig, due=due, days_overdue=max((as_of - due).days, 0)))
    return out


def get_deal_inputs(conn, ws: str, as_of: date) -> tuple[list[dict], list[dict], dict]:
    """(open DealInputs, receivables, fitted model), using only deals closed by as_of."""
    deals = load_deals(conn, ws)
    payments = [p for p in load_payments(conn, ws)]
    history = [d for d in deals if d["status"] != "open" and d["closed_at"] <= as_of]
    if len(history) < MIN_HISTORY or len({d["status"] for d in history}) < 2:
        raise SystemExit(f"Need at least {MIN_HISTORY} closed deals, both won and lost, to learn from. "
                         f"This workspace has {len(history)}. Add history rows to the CSV, or use sample data.")
    model = fit(history, payments=payments)
    return deal_inputs(model, [d for d in deals if d["status"] == "open"], as_of), receivables(model, history, as_of), model
