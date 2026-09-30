"""Turn deal rows into DealInputs: win probability with named factors, close timing, cash delay, rep calibration.

History rows' features are read 21 days before close (the generator's convention); open rows at as_of.
"""
import math
from datetime import date, timedelta

import numpy as np
from sklearn.linear_model import LogisticRegression

STAGES = ["Qualify", "Demo", "Proposal", "Negotiation"]
# column -> factor name shown to users; stage_* columns fold into one "stage" factor
COLUMNS = ["stage_Demo", "stage_Proposal", "stage_Negotiation", "silent", "pushes", "size", "seg_Mid", "seg_Ent"]
FACTOR_OF = {"stage_Demo": "stage", "stage_Proposal": "stage", "stage_Negotiation": "stage", "silent": "silent",
             "pushes": "pushes", "size": "size", "seg_Mid": "segment", "seg_Ent": "segment"}
CAL_PSEUDO = 10  # shrinkage: a rep starts with 10 perfectly calibrated deals
OBS_LAG = timedelta(days=21)

DEAL_COLS = ["id", "name", "segment", "salesperson_id", "customer_id", "value", "stage", "status", "created_at",
             "expected_close_date", "last_activity_date", "push_count", "closed_at", "paid_at"]


def load_deals(conn, ws: str) -> list[dict]:
    with conn.cursor() as cur:
        cur.execute(f"select {', '.join('d.' + c if c != 'segment' else 'c.segment' for c in DEAL_COLS)} "
                    "from deals d join customers c on c.workspace_id = d.workspace_id and c.id = d.customer_id "
                    "where d.workspace_id = %s", (ws,))
        return [dict(zip(DEAL_COLS, r)) | {"value": float(r[5])} for r in cur.fetchall()]


def silent_days(d: dict, obs: date) -> int:
    return max((obs - d["last_activity_date"]).days, 0)


def feature_row(d: dict, obs: date, medians: dict) -> list[float]:
    return [
        d["stage"] == "Demo", d["stage"] == "Proposal", d["stage"] == "Negotiation",
        min(max(silent_days(d, obs) - 7, 0), 60), d["push_count"], math.log(d["value"] / medians[d["segment"]]),
        d["segment"] == "Mid-Market", d["segment"] == "Enterprise",
    ]


def _lognorm(xs: list[float]) -> tuple[float, float]:
    logs = np.log(np.maximum(xs, 1))
    return float(logs.mean()), float(max(logs.std(), 0.05))


def fit(history: list[dict], bootstrap: int = 30, seed: int = 0) -> dict:
    """Fit every model on closed deals. Pure: same rows in, same model out."""
    medians = {s: float(np.median([d["value"] for d in history if d["segment"] == s] or [1]))
               for s in ("SMB", "Mid-Market", "Enterprise")}
    X = np.array([feature_row(d, d["closed_at"] - OBS_LAG, medians) for d in history], dtype=float)
    y = np.array([d["status"] == "won" for d in history])
    lr = LogisticRegression(C=10, max_iter=1000).fit(X, y)

    rng = np.random.default_rng(seed)
    boots = []
    for _ in range(bootstrap):
        i = rng.integers(0, len(y), len(y))
        b = LogisticRegression(C=10, max_iter=1000).fit(X[i], y[i])
        boots.append(np.append(b.coef_[0], b.intercept_[0]))

    p_hist = lr.predict_proba(X)[:, 1]
    cal = {}
    for rep in {d["salesperson_id"] for d in history}:
        m = np.array([d["salesperson_id"] == rep for d in history])
        cal[rep] = float((y[m].sum() + CAL_PSEUDO) / (p_hist[m].sum() + CAL_PSEUDO))

    timing, payment = {}, {}
    for s in medians:
        seg = [d for d in history if d["segment"] == s]
        ratios = [(d["closed_at"] - d["created_at"]).days / max((d["expected_close_date"] - d["created_at"]).days, 1) for d in seg]
        logs = np.log(ratios) if ratios else np.array([0.0])
        timing[s] = (float(logs.mean()), float(max(logs.std(), 0.05)))
        paid = [(d["paid_at"] - d["closed_at"]).days for d in seg if d["paid_at"]]
        payment[s] = _lognorm(paid) if paid else (math.log(45), 0.3)

    return dict(lr=lr, boots=np.array(boots), means=X.mean(axis=0), medians=medians, cal=cal,
                timing=timing, payment=payment, p_hist=p_hist, y=y)


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


def reasons_for(d: dict, as_of: date, cal: float, p: float, medians: dict) -> list[str]:
    out, silent = [], silent_days(d, as_of)
    if silent >= 14:
        out.append(f"silent {silent} days")
    if d["push_count"]:
        out.append(f"{ordinal(d['push_count'])} date push")
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
    X = np.array([feature_row(d, as_of, med) for d in open_deals], dtype=float)
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
        mu_s, sig_s = model["timing"][d["segment"]]
        planned = max((d["expected_close_date"] - d["created_at"]).days, 7)
        cmu, csig = remaining(mu_s, sig_s, planned, (as_of - d["created_at"]).days)
        dmu, dsig = model["payment"][d["segment"]]
        p = clip(raw[i])
        out.append(dict(
            deal_id=d["id"], name=d["name"], value=d["value"], stage=d["stage"], segment=d["segment"],
            salesperson_id=d["salesperson_id"], customer_id=d["customer_id"],
            p_win=p, p_win_low=clip(np.percentile(boot_p[i], 10)), p_win_high=clip(np.percentile(boot_p[i], 90)),
            calibration=cal, cycle_mu=cmu, cycle_sigma=csig,
            payment_delay_mu=dmu, payment_delay_sigma=dsig, expected_close_date=d["expected_close_date"],
            factors={k: round(v, 4) for k, v in factors.items()},
            reasons=reasons_for(d, as_of, cal, p, med),
        ))
    return out


def receivables(model: dict, deals: list[dict], as_of: date) -> list[dict]:
    """Won but unpaid: signed is not cash. Days left until paid, given it is already this late."""
    out = []
    for d in deals:
        if d["status"] == "won" and d["closed_at"] <= as_of and (d["paid_at"] is None or d["paid_at"] > as_of):
            dmu, dsig = model["payment"][d["segment"]]
            mu, sig = remaining(dmu, dsig, 1.0, (as_of - d["closed_at"]).days)
            out.append(dict(name=d["name"], value=d["value"], mu=mu, sigma=sig))
    return out


MIN_HISTORY = 200


def get_deal_inputs(conn, ws: str, as_of: date) -> tuple[list[dict], list[dict], dict]:
    """(open DealInputs, receivables, fitted model), using only deals closed by as_of."""
    deals = load_deals(conn, ws)
    history = [d for d in deals if d["status"] != "open" and d["closed_at"] <= as_of]
    if len(history) < MIN_HISTORY or len({d["status"] for d in history}) < 2:
        raise SystemExit(f"Need at least {MIN_HISTORY} closed deals, both won and lost, to learn from. "
                         f"This workspace has {len(history)}. Add history rows to the CSV, or use sample data.")
    model = fit(history)
    return deal_inputs(model, [d for d in deals if d["status"] == "open"], as_of), receivables(model, history, as_of), model
