#!/usr/bin/env python3
"""Local orchestrator for Phase 1 live proofs via short Edge harness actions.

Uses PHASE1_HARNESS_TOKEN from /tmp/sv-phase1-harness.env.
Never prints CURSOR_API_KEY (only lives in Edge secrets).
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

ENV = Path("/tmp/sv-phase1-harness.env")
URL = os.environ.get(
    "PHASE1_HARNESS_URL",
    "https://mkkqbekhvcnwcheegjpy.supabase.co/functions/v1/cursor-phase1-harness",
)
OUT = Path(__file__).resolve().parents[1] / ".proof-output" / "live-orchestrated"
TEST_USER = os.environ.get("PHASE1_TEST_USER_ID", "619aa227-c8fb-4e8e-b4ba-1f6fdc0b774d")


def token() -> str:
    for line in ENV.read_text().splitlines():
        if line.startswith("PHASE1_HARNESS_TOKEN="):
            return line.split("=", 1)[1].strip()
    raise SystemExit("missing PHASE1_HARNESS_TOKEN in /tmp/sv-phase1-harness.env")


def anon_key() -> str:
    for key in ("SUPABASE_ANON_KEY", "VITE_SUPABASE_ANON_KEY", "PHASE1_SUPABASE_ANON_KEY"):
        val = os.environ.get(key, "").strip()
        if val:
            return val
    if ENV.exists():
        for line in ENV.read_text().splitlines():
            if line.startswith("SUPABASE_ANON_KEY="):
                return line.split("=", 1)[1].strip()
    raise SystemExit("missing SUPABASE_ANON_KEY (env or /tmp/sv-phase1-harness.env)")


def call(payload: dict, timeout: int = 120) -> dict:
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        URL,
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {token()}",
            "apikey": anon_key(),
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read().decode()
    assert "crsr_" not in body
    return json.loads(body)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    report: dict = {"steps": [], "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}

    def rec(name: str, ok: bool, detail=None, error=None):
        report["steps"].append({"name": name, "ok": ok, "detail": detail, "error": error})
        print(f"[{'OK' if ok else 'FAIL'}] {name}" + (f" — {error}" if error else ""))

    # 1 probe
    probe = call({"mode": "probe"}, timeout=60)
    for s in probe.get("steps") or []:
        rec(f"probe_{s['name']}", bool(s.get("ok")), s.get("detail"), s.get("error"))
    if not all(s.get("ok") for s in probe.get("steps") or []):
        (OUT / "report.json").write_text(json.dumps(report, indent=2))
        return 1

    models = next(s for s in probe["steps"] if s["name"] == "models")
    model_id = (models.get("detail") or {}).get("chosen") or "composer-2.5"

    # 2 create
    created = call(
        {
            "mode": "create",
            "model": model_id,
            "test_user_id": TEST_USER,
            "prompt": (
                "You are proving SpeedVendors Phase 1 on the isolated storefront runtime. "
                "Use ONLY mock commerce in src/speedvendors/. "
                "Create a clean test storefront hero and featured products section. "
                "Keep build valid (npm run build). "
                "Write artifacts/phase1-live-marker.txt with exact text SPEEDVENDORS_PHASE1_LIVE_OK. "
                "Do not open a PR. Do not edit src/speedvendors/**."
            ),
        },
        timeout=90,
    )
    if created.get("error"):
        rec("create", False, created, created.get("error"))
        (OUT / "report.json").write_text(json.dumps(report, indent=2))
        return 1
    agent_id = created["agentId"]
    run1 = created["runId"]
    db_run1 = created.get("dbRunId")
    rec("create", agent_id.startswith("bc-"), created)

    # 3 poll run1
    fin1 = poll_run(agent_id, run1, timeout_s=15 * 60)
    rec("initial_terminal", fin1.get("status") == "FINISHED", fin1)
    call({"mode": "persist_usage", "agentId": agent_id, "runId": run1, "dbRunId": db_run1, "status": fin1.get("status")})
    call({"mode": "release", "dbRunId": db_run1, "status": "finished" if fin1.get("status") == "FINISHED" else "error", "cursorRunId": run1})

    # 4 followup
    follow = call(
        {
            "mode": "followup",
            "agentId": agent_id,
            "model": model_id,
            "test_user_id": TEST_USER,
            "prompt": "Make the hero approximately 25% shorter without changing the product section. Keep build valid.",
        },
        timeout=90,
    )
    run2 = follow.get("runId")
    db_run2 = follow.get("dbRunId")
    rec(
        "followup_create",
        bool(run2) and follow.get("agentId") == agent_id and run2 != run1,
        follow,
        follow.get("error"),
    )
    if run2:
        # concurrent second followup should be blocked at DB before Cursor
        blocked = call(
            {
                "mode": "claim_only",
                "test_user_id": TEST_USER,
                "idempotency_key": f"concurrent-{int(time.time())}",
                "prompt": "should block",
            }
        )
        rec(
            "concurrency_block",
            blocked.get("ok") is False and blocked.get("reason") == "run_already_active",
            blocked,
        )

        fin2 = poll_run(agent_id, run2, timeout_s=12 * 60)
        rec("followup_terminal", fin2.get("status") == "FINISHED", fin2)
        call({"mode": "persist_usage", "agentId": agent_id, "runId": run2, "dbRunId": db_run2, "status": fin2.get("status")})
        call({"mode": "release", "dbRunId": db_run2, "status": "finished" if fin2.get("status") == "FINISHED" else "error", "cursorRunId": run2})

    # 5 artifacts
    arts = call({"mode": "artifacts", "agentId": agent_id, "test_user_id": TEST_USER, "dbRunId": db_run1}, timeout=90)
    rec("artifacts", bool(arts.get("ok")), arts, arts.get("error"))

    # 6 usage + cost polls
    for label, rid in [("run1", run1), ("run2", run2)]:
        if not rid:
            continue
        settled = None
        for wait in (0, 15, 45, 90):
            if wait:
                time.sleep(wait)
            u = call({"mode": "usage", "agentId": agent_id, "runId": rid}, timeout=60)
            has_cost = "chargedCents" in json.dumps(u) or ('"cost"' in json.dumps(u) and u.get("usage"))
            if has_cost:
                settled = {"waited_s": wait, "usage": u}
                break
            last = u
        rec(f"usage_{label}", True, settled or {"waited_s": "unsettled", "usage": last})
        rec(f"cost_{label}", bool(settled), settled)

    # 7 cancel
    cancel = call({"mode": "cancel_probe", "agentId": agent_id}, timeout=90)
    rec("cancel", bool(cancel.get("ok")), cancel, cancel.get("error"))

    # 8 entitlement
    ent = call({"mode": "entitlement_probe", "test_user_id": TEST_USER})
    rec("entitlement", bool(ent.get("ok")), ent)

    # 9 archive
    arch = call({"mode": "archive", "agentId": agent_id, "test_user_id": TEST_USER})
    rec("archive", bool(arch.get("ok")), arch, arch.get("error"))

    report["agentId"] = agent_id
    report["run1"] = run1
    report["run2"] = run2
    report["modelId"] = model_id
    report["ok"] = all(s["ok"] for s in report["steps"])
    (OUT / "report.json").write_text(json.dumps(report, indent=2))
    print("WROTE", OUT / "report.json")
    return 0 if report["ok"] else 1


def poll_run(agent_id: str, run_id: str, timeout_s: int) -> dict:
    start = time.time()
    last = {}
    while time.time() - start < timeout_s:
        last = call({"mode": "get_run", "agentId": agent_id, "runId": run_id}, timeout=60)
        st = str(last.get("status") or "").upper()
        print(f"  poll {run_id} -> {st}")
        if st in {"FINISHED", "ERROR", "CANCELLED", "EXPIRED"}:
            return last
        time.sleep(5)
    last["status"] = "TIMEOUT"
    return last


if __name__ == "__main__":
    sys.exit(main())
