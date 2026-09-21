#!/usr/bin/env python3
"""Local orchestrator for Phase 2 storefront generation via short Edge harness actions.

Flow: reseed (new session @ runtime tip) → context → start → poll → complete → followup → …
Writes sanitized report to tools/cursor-cloud-phase1/.proof-output/phase2/ (gitignored).

Env:
  PHASE1_HARNESS_TOKEN from /tmp/sv-phase1-harness.env
  SUPABASE_ANON_KEY from env (or env file)
  PHASE2_TEST_USER_ID default f30cbfb8-eeb4-4ccf-8c95-8a8de505d7e5
  CURSOR_RUNTIME_STARTING_REF / PHASE2_RUNTIME_COMMIT_SHA default 6ced389a52e4a9e7e9716fd8586039fd17a9a053
  model composer-2.5

Do NOT run this against live Cursor until deploy + CURSOR_RUNTIME_STARTING_REF are ready.
Forces a NEW session (does not reuse old agent bc-5ef2e642…).
"""
from __future__ import annotations

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
OUT = Path(__file__).resolve().parents[1] / ".proof-output" / "phase2"
TEST_USER = os.environ.get(
    "PHASE2_TEST_USER_ID",
    "f30cbfb8-eeb4-4ccf-8c95-8a8de505d7e5",
)
MODEL = os.environ.get("PHASE2_MODEL", "composer-2.5")
RUNTIME_SHA = os.environ.get(
    "PHASE2_RUNTIME_COMMIT_SHA",
    os.environ.get(
        "CURSOR_RUNTIME_STARTING_REF",
        "6ced389a52e4a9e7e9716fd8586039fd17a9a053",
    ),
).strip()


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
    # Never leak Cursor API keys into proof output.
    assert "crsr_" not in body
    return json.loads(body)


def sanitize(obj):
    """Drop large blobs / emails from report."""
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            lk = str(k).lower()
            if lk in {"context", "full_context", "prompt", "fullprompt"}:
                continue
            if "email" in lk and isinstance(v, str):
                out[k] = "[redacted]"
            else:
                out[k] = sanitize(v)
        return out
    if isinstance(obj, list):
        return [sanitize(x) for x in obj]
    if isinstance(obj, str) and len(obj) > 2000:
        return obj[:2000] + "…"
    return obj


def poll_run(agent_id: str, run_id: str, timeout_s: int) -> dict:
    start = time.time()
    last: dict = {}
    while time.time() - start < timeout_s:
        last = call(
            {
                "mode": "phase2_poll",
                "agentId": agent_id,
                "runId": run_id,
                "test_user_id": TEST_USER,
            },
            timeout=60,
        )
        st = str(last.get("status") or "").upper()
        print(f"  poll {run_id} -> {st}")
        if st in {"FINISHED", "ERROR", "CANCELLED", "EXPIRED"}:
            return last
        time.sleep(5)
    last["status"] = "TIMEOUT"
    return last


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    report: dict = {
        "steps": [],
        "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "test_user_id": TEST_USER,
        "model": MODEL,
        "runtime_commit_sha": RUNTIME_SHA,
    }

    def rec(name: str, ok: bool, detail=None, error=None):
        report["steps"].append(
            {"name": name, "ok": ok, "detail": sanitize(detail), "error": error}
        )
        print(f"[{'OK' if ok else 'FAIL'}] {name}" + (f" — {error}" if error else ""))

    # 0 status snapshot
    status0 = call({"mode": "phase2_status", "test_user_id": TEST_USER}, timeout=60)
    rec("status_before", True, status0)

    # 1 Force NEW session at runtime tip (do not reuse old agent bc-5ef2e642…).
    reseed = call(
        {
            "mode": "phase2_reseed",
            "test_user_id": TEST_USER,
            "runtime_commit_sha": RUNTIME_SHA,
            "replacement_reason": "orchestratePhase2_runtime_tip",
        },
        timeout=60,
    )
    rec(
        "reseed",
        bool(reseed.get("ok")),
        {
            "old_session_id": reseed.get("old_session_id"),
            "new_session_id": reseed.get("new_session_id"),
            "runtime_commit_sha": reseed.get("runtime_commit_sha"),
            "created_fresh": reseed.get("created_fresh"),
        },
        None if reseed.get("ok") else reseed.get("error"),
    )
    if not reseed.get("ok"):
        (OUT / "report.json").write_text(json.dumps(report, indent=2))
        return 1
    report["session_id"] = reseed.get("new_session_id")
    report["runtime_commit_sha"] = reseed.get("runtime_commit_sha") or RUNTIME_SHA

    # 2 context (no Cursor spend)
    ctx = call({"mode": "phase2_context", "test_user_id": TEST_USER}, timeout=90)
    ok_ctx = bool(ctx.get("ok")) and isinstance(ctx.get("chars"), int)
    rec(
        "context",
        ok_ctx,
        {
            "chars": ctx.get("chars"),
            "productCount": ctx.get("productCount"),
            "collectionCount": ctx.get("collectionCount"),
            "sampleProductIds": ctx.get("sampleProductIds"),
            "preview": ctx.get("preview"),
            "source": ctx.get("source"),
        },
        None if ok_ctx else ctx.get("error"),
    )
    (OUT / "context-preview.json").write_text(
        json.dumps(sanitize(ctx.get("preview") or {}), indent=2)
    )
    if not ok_ctx:
        (OUT / "report.json").write_text(json.dumps(report, indent=2))
        return 1

    # 3 start generation on NEW session (creates agent pinned to RUNTIME_SHA)
    started = call(
        {
            "mode": "phase2_start",
            "test_user_id": TEST_USER,
            "model": MODEL,
            "runtime_commit_sha": RUNTIME_SHA,
            "idempotency_key": f"phase2-orch-{int(time.time())}",
            "prompt": (
                "Create a polished but simple production-ready storefront using the supplied "
                "real store products and images. Include navigation, hero, product grid and footer. "
                "Use the provided SpeedVendors commerce contract. Keep implementation concise and buildable. "
                "After presentation edits run only: npm run build:artifact. "
                "Do not invent packaging; do not rewrite protected commerce files."
            ),
        },
        timeout=120,
    )
    if started.get("error"):
        rec("start", False, started, started.get("error") or started.get("detail"))
        (OUT / "report.json").write_text(json.dumps(report, indent=2))
        return 1

    agent_id = started.get("agentId")
    run1 = started.get("runId") or started.get("cursor_run_id")
    db_run1 = started.get("run_id")
    runtime_after_start = started.get("runtime_commit_sha") or report["runtime_commit_sha"]
    report["runtime_commit_sha"] = runtime_after_start
    rec(
        "start",
        bool(agent_id and run1 and db_run1),
        {
            "agentId": agent_id,
            "runId": run1,
            "run_id": db_run1,
            "session_id": started.get("session_id"),
            "model": started.get("model"),
            "contextChars": started.get("contextChars"),
            "runtime_commit_sha": runtime_after_start,
        },
    )

    # 4 poll initial
    fin1 = poll_run(agent_id, run1, timeout_s=20 * 60)
    rec("initial_terminal", fin1.get("status") == "FINISHED", fin1)

    # 5 complete initial
    complete1 = call(
        {
            "mode": "phase2_complete",
            "test_user_id": TEST_USER,
            "run_id": db_run1,
            "agentId": agent_id,
            "runId": run1,
        },
        timeout=180,
    )
    rec(
        "complete_initial",
        bool(complete1.get("ok")),
        {
            "version_id": complete1.get("version_id"),
            "content_sha256": complete1.get("content_sha256"),
            "content_size_bytes": complete1.get("content_size_bytes"),
            "usage": complete1.get("usage"),
            "error": complete1.get("error"),
        },
        None if complete1.get("ok") else complete1.get("error") or complete1.get("detail"),
    )

    # 6 followup — skipped by default until packaging proof (PHASE2_RUN_FOLLOWUP=1)
    run2 = None
    if os.environ.get("PHASE2_RUN_FOLLOWUP", "").strip() == "1":
        follow = call(
            {
                "mode": "phase2_followup",
                "test_user_id": TEST_USER,
                "model": MODEL,
                "idempotency_key": f"phase2-follow-{int(time.time())}",
                "prompt": (
                    "Add a best sellers section before the footer using exactly three real products "
                    "from this store. Preserve the rest of the design. "
                    "After edits run only npm run build:artifact."
                ),
            },
            timeout=120,
        )
        run2 = follow.get("runId") or follow.get("cursor_run_id")
        db_run2 = follow.get("run_id")
        rec(
            "followup_start",
            bool(run2) and follow.get("agentId") == agent_id and run2 != run1,
            {
                "runId": run2,
                "run_id": db_run2,
                "parent_version_id": follow.get("parent_version_id"),
            },
            follow.get("error"),
        )

        if run2:
            fin2 = poll_run(agent_id, run2, timeout_s=15 * 60)
            rec("followup_terminal", fin2.get("status") == "FINISHED", fin2)
            complete2 = call(
                {
                    "mode": "phase2_complete",
                    "test_user_id": TEST_USER,
                    "run_id": db_run2,
                    "agentId": agent_id,
                    "runId": run2,
                },
                timeout=180,
            )
            rec(
                "complete_followup",
                bool(complete2.get("ok")),
                {
                    "version_id": complete2.get("version_id"),
                    "content_sha256": complete2.get("content_sha256"),
                    "parent_of": complete1.get("version_id"),
                },
                None if complete2.get("ok") else complete2.get("error"),
            )
            report["version2"] = complete2.get("version_id")
    else:
        rec("followup_skipped", True, {"reason": "PHASE2_RUN_FOLLOWUP not set; packaging proof first"})

    # 7 final status
    status1 = call({"mode": "phase2_status", "test_user_id": TEST_USER}, timeout=60)
    rec("status_after", True, status1)

    report["agentId"] = agent_id
    report["run1"] = run1
    report["run2"] = run2 if run2 else None
    report["version1"] = complete1.get("version_id")
    report["ok"] = all(s["ok"] for s in report["steps"])
    (OUT / "report.json").write_text(json.dumps(report, indent=2))
    print("WROTE", OUT / "report.json")
    print("runtime_commit_sha", report.get("runtime_commit_sha"))
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
