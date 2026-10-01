"""Demo: seed a week ago, run, let a realistic week happen to the pipeline, run again, backtest.

Run: python -m engine.scenario <workspace_id> [--aczen]      (wipes and reseeds that workspace)
--aczen builds the simulated history on the real Aczen Nova clients, reps and business units.
The week: the biggest Enterprise proposal slips 45 days, one deal and two of an optimist's deals are lost,
a large deal closes won, a new deal arrives, one is discounted, one advances, and four go quiet.
"""
import json
import os
import urllib.request
from datetime import date, timedelta

from engine import backtest, generate, run
from engine.db import connect

S = dict(zip(["acme", "globex", "hooli", "soylent", "tyrell", "vandelay", "piedpiper", "cyberdyne", "massive",
              "brightwater", "kestrel", "wonka", "stark", "oscorp", "northstar", "helios"], generate.STORY_IDS))
QUIET = [S["hooli"], S["soylent"], S["tyrell"], S["vandelay"]]
SEGMENT = {"smb": "SMB", "mid_market": "Mid-Market", "mid-market": "Mid-Market", "enterprise": "Enterprise"}


def aczen_people() -> dict:
    """Real clients (segment, payment terms) and reps (employees who own quotations, with their unit) from Nova."""
    base = os.environ.get("NOVA_BASE_URL", "https://www.aczen.in/nova-api/v1").rstrip("/")
    key = os.environ["NOVA_API_KEY"]

    def get(resource):
        out, offset = [], 0
        while True:
            req = urllib.request.Request(f"{base}/{resource}?limit=100&offset={offset}", headers={"Authorization": f"Bearer {key}"})
            body = json.load(urllib.request.urlopen(req, timeout=30))
            out += body["data"]
            if not body["pagination"]["has_more"]:
                return out
            offset += body["pagination"]["limit"]

    clients, employees, units, quotes = get("clients"), get("employees"), get("business-units"), get("quotations")
    unit = {u["id"]: u["name"] for u in units}
    sellers = {q["sales_rep_id"] for q in quotes}
    return dict(
        clients=[dict(id=c["id"], name=c["name"], segment=SEGMENT.get(str(c["segment"]).lower(), "SMB"),
                      terms=c.get("payment_terms_days") or 30) for c in clients],
        reps=[dict(id=e["id"], name=e["name"], team=unit.get(e["business_unit_id"])) for e in employees if e["id"] in sellers],
    )


def the_week(conn, ws: str, d1: date):
    with conn.cursor() as cur:
        # event log first, from the values before this week's changes
        cur.execute("insert into closedate_events (workspace_id, deal_id, old_date, new_date, changed_at) "
                    "select workspace_id, id, expected_close_date, expected_close_date + 45, %s from deals "
                    "where workspace_id = %s and id = %s and status = 'open'", (d1 - timedelta(days=3), ws, S["acme"]))
        cur.execute("insert into stage_events (workspace_id, deal_id, from_stage, to_stage, changed_at) "
                    "select workspace_id, id, stage, 'Negotiation', %s from deals where workspace_id = %s and id = %s",
                    (d1 - timedelta(days=2), ws, S["oscorp"]))
        closing = [S["globex"], S["brightwater"], S["kestrel"], S["stark"]]
        cur.execute("insert into stage_events (workspace_id, deal_id, from_stage, to_stage, changed_at) "
                    "select workspace_id, id, stage, 'Closed', %s from deals where workspace_id = %s "
                    "and id = any(%s) and status = 'open'", (d1 - timedelta(days=2), ws, closing))
        cur.execute("update deals set expected_close_date = expected_close_date + 45, push_count = push_count + 1 "
                    "where workspace_id = %s and id = %s and status = 'open'", (ws, S["acme"]))
        cur.execute("update deals set status = 'lost', closed_at = %s where workspace_id = %s and id = any(%s) and status = 'open'",
                    (d1 - timedelta(days=2), ws, [S["globex"], S["brightwater"], S["kestrel"]]))
        cur.execute("update deals set status = 'won', stage = 'Negotiation', closed_at = %s where workspace_id = %s and id = %s",
                    (d1 - timedelta(days=1), ws, S["stark"]))
        cur.execute("update deals set value = round(value * 0.85) where workspace_id = %s and id = %s", (ws, S["piedpiper"]))
        cur.execute("update deals set stage = 'Negotiation' where workspace_id = %s and id = %s", (ws, S["oscorp"]))
        # most live deals see activity during the week; the quiet four do not
        cur.execute("update deals set last_activity_date = %s - (abs(hashtext(id)) %% 7) "
                    "where workspace_id = %s and status = 'open' and not (id = any(%s)) and abs(hashtext(id)) %% 10 < 7",
                    (d1, ws, QUIET))
        # a new SMB deal from an existing customer, owned by the first rep
        cur.execute("insert into deals (workspace_id, id, name, customer_id, salesperson_id, value, stage, status, created_at, "
                    "expected_close_date, last_activity_date) "
                    "select %s, 'D-9001', c.name || ' · new expansion', c.id, (select id from salespeople where workspace_id = %s order by id limit 1), "
                    "200000, 'Proposal', 'open', %s, %s, %s from customers c where c.workspace_id = %s and c.segment = 'SMB' order by c.id limit 1",
                    (ws, ws, d1 - timedelta(days=3), d1 + timedelta(days=18), d1 - timedelta(days=1), ws))
        cur.execute("insert into stage_events (workspace_id, deal_id, from_stage, to_stage, changed_at) values "
                    "(%s, 'D-9001', null, 'Qualify', %s), (%s, 'D-9001', 'Qualify', 'Proposal', %s)",
                    (ws, d1 - timedelta(days=3), ws, d1 - timedelta(days=1)))
    conn.commit()


def main(ws: str, aczen: bool = False):
    d1 = date.today()
    d0 = d1 - timedelta(days=7)
    generate.main(ws, d0, people=aczen_people() if aczen else None)
    run.main(d0, ws)
    with connect() as conn:
        the_week(conn, ws, d1)
    run.main(d1, ws)
    backtest.main(d1, ws)


if __name__ == "__main__":
    import sys
    main(sys.argv[1], aczen="--aczen" in sys.argv)
