#!/usr/bin/env python3
"""auto-loop.py — drive the autonomous build loop via fresh `claude -p` invocations.

Each iter is a brand-new Claude Code session — no accumulated context, no /compact,
no token-runway exhaustion. State persists on disk (CLAUDE.md, GOALS.md, logs/).

Defaults are tuned for Claude Max 20x. Note: Anthropic's plan limit is per *model
request*, not per `claude -p` invocation. A single fat-iter dispatching 6-8
sub-agents + tool calls can be 50-100 requests, so we throttle on iters, not
msgs (default ~12 iters/5h ≈ ~900 requests/5h, the Max-20x soft cap).

Usage:
  python3 scripts/auto-loop.py                       # defaults
  python3 scripts/auto-loop.py --max-iters 20        # stop after 20 iters
  python3 scripts/auto-loop.py --min-interval 300    # tighten cadence

Stop:
  - Ctrl-C
  - touch .auto-loop/stop
  - GOALS.md backlog empty
  - --max-iters reached
  - 3 consecutive iters fail to commit
"""

from __future__ import annotations

import argparse
import json
import os
import re
import signal
import subprocess
import sys
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

VERSION = "0.1.2"
ROLLING_WINDOW_HOURS = 5
WEEKLY_WINDOW_HOURS = 24 * 7

DEFAULTS = {
    "min_interval": 600,
    "max_interval": 3600,
    # Iters per 5h rolling window. Anthropic counts per model request; a fat-iter
    # ≈ 50-100 requests, so 12 iters ≈ ~900 requests, ~Max-20x soft cap.
    "iters_per_5h": 12,
    "iters_per_week": 80,      # ~5x the 5h budget, accounting for off-hours
    "max_iters_per_run": 50,
    # Fresh `claude -p` sessions don't reuse the prompt cache across iters,
    # so cache-creation tokens are paid on every iter. Empirically a typical
    # Opus iter on a non-trivial repo lands at $4-8 just on context bootstrap
    # (~200-400K input tokens × Opus's $18.75/MTok cache-creation rate). Pin
    # at $10 by default. To lower cost, pass --model sonnet via --extra-args.
    "max_budget_usd_per_iter": 10.0,
    "iter_timeout_s": 1800,    # 30 min hard cap per iter
}

EXTERNAL_SCHEDULER_NOTE = (
    "EXTERNAL_SCHEDULER=1 is set; the driver script handles cadence. "
    "Do NOT call ScheduleWakeup or attempt to schedule a follow-up — that "
    "tool is not registered in non-interactive `claude -p` sessions and "
    "any such call will fail. Exit cleanly after the iter log is committed."
)

PROMPT = (
    "Run ONE iteration of the autonomous build loop per CLAUDE.md "
    '§ "Autonomous build loop protocol". The external driver handles cadence '
    "(env EXTERNAL_SCHEDULER=1) — do NOT call ScheduleWakeup and do NOT "
    "attempt to schedule a follow-up. Read state, set goals, execute, "
    "update GOALS.md, write logs/iter-NNN.md, commit, then exit."
)


@dataclass
class IterRecord:
    ts: str
    duration_s: float
    exit_code: int
    committed: bool
    iter_number: int | None
    input_tokens: int
    output_tokens: int
    cache_creation_input_tokens: int
    cache_read_input_tokens: int
    cost_usd: float


def load_records(state_file: Path) -> list[dict]:
    if not state_file.exists():
        return []
    records: list[dict] = []
    for line in state_file.read_text().splitlines():
        if not line.strip():
            continue
        try:
            records.append(json.loads(line))
        except json.JSONDecodeError:
            # Truncated/corrupted line from a previous SIGKILL or power loss.
            # Skip rather than crash the whole loader.
            continue
    return records


def filter_window(records: list[dict], hours: int) -> list[dict]:
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    return [r for r in records if datetime.fromisoformat(r["ts"]) >= cutoff]


def load_loop_state(repo: Path) -> dict:
    """Read .loop/state.json; return {} if missing or malformed."""
    state = repo / ".loop" / "state.json"
    if not state.exists():
        return {}
    try:
        return json.loads(state.read_text(encoding="utf-8", errors="replace"))
    except (json.JSONDecodeError, OSError):
        return {}


def backlog_empty(repo: Path, backlog_source: dict | None) -> bool:
    """Heuristic: configured backlog file has no `[ ]`, `[wip]`, or `[blocked]` markers.

    Only applies when backlog_source.kind == 'file'. External sources (github_issues,
    linear, etc.) are too costly to poll per-iter from the driver; the agent decides
    when to stop on backlog-empty in those cases. Defaults to GOALS.md for back-compat.
    """
    src = backlog_source or {"kind": "file", "path": "GOALS.md"}
    if src.get("kind") != "file":
        return False
    path = repo / src.get("path", "GOALS.md")
    if not path.exists():
        return False
    text = path.read_text(encoding="utf-8", errors="replace")
    return not re.search(r"\[\s\]|\[wip\]|\[blocked\]", text, re.IGNORECASE)


def current_head(repo: Path) -> str:
    out = subprocess.run(
        ["git", "-C", str(repo), "rev-parse", "HEAD"],
        capture_output=True, text=True,
    )
    return out.stdout.strip() if out.returncode == 0 else ""


def latest_iter_number(repo: Path) -> int | None:
    logs = repo / "logs"
    if not logs.is_dir():
        return None
    nums = []
    for p in logs.glob("iter-*.md"):
        m = re.search(r"iter-(\d+)\.md$", p.name)
        if m:
            nums.append(int(m.group(1)))
    return max(nums) if nums else None


def run_one_iter(
    repo: Path,
    prompt: str,
    budget_usd: float,
    timeout_s: int,
    proc_holder: dict,
) -> IterRecord:
    head_before = current_head(repo)
    iter_before = latest_iter_number(repo)
    start = time.time()
    state = load_loop_state(repo)
    env = {**os.environ, "EXTERNAL_SCHEDULER": "1"}
    base_branch = state.get("base_branch") or "main"
    env["LOOP_BASE_BRANCH"] = base_branch
    backlog = state.get("backlog_source") or {"kind": "file", "path": "GOALS.md"}
    env["LOOP_BACKLOG_KIND"] = str(backlog.get("kind", "file"))
    env["LOOP_BACKLOG_PATH"] = str(backlog.get("path", "GOALS.md"))
    if backlog.get("ref"):
        env["LOOP_BACKLOG_REF"] = str(backlog["ref"])
    cmd = [
        "claude", "-p", prompt,
        "--output-format", "json",
        "--permission-mode", "bypassPermissions",
        "--max-budget-usd", str(budget_usd),
        "--no-session-persistence",
        "--append-system-prompt", EXTERNAL_SCHEDULER_NOTE,
    ]
    # stdin=DEVNULL: if any prompt path leaks (workspace-trust dialog, MCP auth,
    # OAuth refresh), the subprocess would block on TTY read until iter_timeout_s.
    # start_new_session=True: gives the child its own process group, so SIGINT to
    # the parent doesn't propagate automatically and we can choose to escalate.
    try:
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env=env,
            cwd=str(repo),
            start_new_session=True,
        )
        proc_holder["proc"] = proc
        try:
            stdout, stderr = proc.communicate(timeout=timeout_s)
            returncode = proc.returncode
        except subprocess.TimeoutExpired:
            try:
                os.killpg(proc.pid, signal.SIGTERM)
                stdout, stderr = proc.communicate(timeout=10)
            except (subprocess.TimeoutExpired, ProcessLookupError):
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                stdout, stderr = proc.communicate()
            returncode = 124  # conventional timeout exit code
        finally:
            proc_holder["proc"] = None
    except FileNotFoundError:
        stdout, stderr, returncode = "", "claude CLI not found on PATH", 127

    duration = time.time() - start
    head_after = current_head(repo)
    iter_after = latest_iter_number(repo)
    committed = bool(head_after) and head_after != head_before

    usage = {
        "input_tokens": 0,
        "output_tokens": 0,
        "cache_creation_input_tokens": 0,
        "cache_read_input_tokens": 0,
    }
    cost_usd = 0.0
    try:
        data = json.loads(stdout)
        if isinstance(data, dict):
            u = data.get("usage") or {}
            for k in usage:
                usage[k] = int(u.get(k, 0))
            cost_usd = float(data.get("total_cost_usd") or data.get("cost_usd") or 0.0)
    except (json.JSONDecodeError, ValueError):
        pass

    # On timeout-kill, --output-format json never emits its envelope, so cost_usd
    # comes out 0 even though the iter consumed budget. Conservatively assume the
    # iter spent its full budget so the dashboard doesn't under-report burn.
    if returncode == 124 and cost_usd == 0.0:
        cost_usd = float(budget_usd)

    # write stderr tail to driver log on failure for debug
    if returncode != 0 and stderr:
        sys.stderr.write(f"[claude stderr tail]\n{stderr[-2000:]}\n")

    return IterRecord(
        ts=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        duration_s=round(duration, 1),
        exit_code=returncode,
        committed=committed,
        iter_number=iter_after if iter_after != iter_before else None,
        cost_usd=round(cost_usd, 4),
        **usage,
    )


def compute_sleep(records_5h: list[dict], cfg: dict) -> int:
    """Pace so we don't blow the 5h iter budget.

    Strategy: divide remaining-window-seconds by remaining-iter-budget. Clamp to
    [min_interval, max_interval]. If budget exhausted, wait until oldest record
    drops out of the window.
    """
    used = len(records_5h)
    remaining = cfg["iters_per_5h"] - used
    if remaining <= 0:
        oldest = min(records_5h, key=lambda r: r["ts"])
        oldest_dt = datetime.fromisoformat(oldest["ts"])
        wait = (oldest_dt + timedelta(hours=ROLLING_WINDOW_HOURS)) - datetime.now(timezone.utc)
        return max(cfg["min_interval"], int(wait.total_seconds()) + 60)
    target = (ROLLING_WINDOW_HOURS * 3600) / remaining
    return int(max(cfg["min_interval"], min(cfg["max_interval"], target)))


def interruptible_sleep(total_s: int, stop_file: Path, is_interrupted) -> None:
    """Sleep up to total_s seconds, waking on SIGINT or stop_file presence.

    Polls in 2s slices for stop_file. SIGINT raises InterruptedError inside time.sleep.
    """
    elapsed = 0
    while elapsed < total_s:
        if is_interrupted() or stop_file.exists():
            return
        slice_s = min(2, total_s - elapsed)
        try:
            time.sleep(slice_s)
        except InterruptedError:
            return
        elapsed += slice_s


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--repo", default=os.getcwd(), help="repo root (default: cwd)")
    ap.add_argument("--min-interval", type=int, default=DEFAULTS["min_interval"])
    ap.add_argument("--max-interval", type=int, default=DEFAULTS["max_interval"])
    ap.add_argument("--iters-per-5h", type=int, default=DEFAULTS["iters_per_5h"],
                    help="iter cap per 5h rolling window (default 12 for Max-20x)")
    ap.add_argument("--iters-per-week", type=int, default=DEFAULTS["iters_per_week"])
    ap.add_argument("--max-iters", type=int, default=DEFAULTS["max_iters_per_run"])
    ap.add_argument("--max-budget-usd-per-iter", type=float, default=DEFAULTS["max_budget_usd_per_iter"])
    ap.add_argument("--iter-timeout-s", type=int, default=DEFAULTS["iter_timeout_s"])
    ap.add_argument("--prompt", default=PROMPT)
    ap.add_argument("--no-empty-backlog-stop", action="store_true",
                    help="don't stop when GOALS.md backlog goes empty")
    ap.add_argument("--skip-denylist-check", action="store_true",
                    help="proceed even if .claude/settings.local.json is missing")
    ap.add_argument("--version", action="version", version=f"auto-loop.py {VERSION}")
    args = ap.parse_args()

    repo = Path(args.repo).resolve()
    if not (repo / "CLAUDE.md").exists():
        sys.stderr.write(f"error: no CLAUDE.md at {repo}\n")
        return 2

    state_dir = repo / ".auto-loop"
    state_dir.mkdir(exist_ok=True)
    state_file = state_dir / "usage.jsonl"
    stop_file = state_dir / "stop"
    log_file = state_dir / "driver.log"

    cfg = {
        "min_interval": args.min_interval,
        "max_interval": args.max_interval,
        "iters_per_5h": args.iters_per_5h,
        "iters_per_week": args.iters_per_week,
    }

    def log(msg: str) -> None:
        line = f"[{datetime.now(timezone.utc).isoformat(timespec='seconds')}] {msg}"
        print(line, flush=True)
        with log_file.open("a") as f:
            f.write(line + "\n")

    log(f"auto-loop start: v{VERSION} repo={repo}")
    log(f"  cfg={cfg} max_iters={args.max_iters} budget_usd_per_iter={args.max_budget_usd_per_iter}")

    # Defense-in-depth: --permission-mode bypassPermissions is set in run_one_iter,
    # so the only real sandbox is the repo's .claude/settings.local.json deny list.
    # Warn loudly (or refuse) if missing — the bootstrap skill is supposed to write
    # a baseline file but a hand-copied driver wouldn't have one.
    settings_local = repo / ".claude" / "settings.local.json"
    if not settings_local.exists():
        msg = (
            f"WARNING: no {settings_local.relative_to(repo)} — "
            "claude -p will run with bypassPermissions and no deny list. "
            "Re-run via the auto-loop-bootstrap skill OR pass "
            "--skip-denylist-check to proceed anyway."
        )
        if args.skip_denylist_check:
            log(msg)
        else:
            sys.stderr.write(msg + "\n")
            return 2

    interrupted = False
    proc_holder: dict = {"proc": None}
    sigint_count = 0

    def handle_sigint(signum, frame):
        nonlocal interrupted, sigint_count
        sigint_count += 1
        child = proc_holder.get("proc")
        if sigint_count >= 2:
            # second Ctrl-C: kill the child group AND exit the driver immediately.
            # Skips the rest of post-iter bookkeeping; user expressly wants out.
            if child is not None and child.poll() is None:
                try:
                    os.killpg(child.pid, signal.SIGTERM)
                except (ProcessLookupError, OSError):
                    pass
            log("second SIGINT — hard exit")
            os._exit(130)
        interrupted = True
        log("SIGINT received — exiting after current iter (press Ctrl-C again to kill child immediately)")

    signal.signal(signal.SIGINT, handle_sigint)

    consecutive_failures = 0
    iters_this_run = 0

    while True:
        if interrupted:
            log("stop: SIGINT")
            break
        if stop_file.exists():
            log(f"stop: {stop_file} present")
            break
        if iters_this_run >= args.max_iters:
            log(f"stop: max-iters reached ({args.max_iters})")
            break
        if consecutive_failures >= 3:
            log("stop: 3 consecutive failed iters")
            break
        if not args.no_empty_backlog_stop:
            state = load_loop_state(repo)
            backlog_source = state.get("backlog_source")
            if backlog_empty(repo, backlog_source):
                path = (backlog_source or {}).get("path", "GOALS.md")
                log(f"stop: backlog empty ({path})")
                break

        records = load_records(state_file)
        records_5h = filter_window(records, ROLLING_WINDOW_HOURS)
        records_week = filter_window(records, WEEKLY_WINDOW_HOURS)

        if len(records_week) >= cfg["iters_per_week"]:
            log(f"pause: weekly cap reached ({len(records_week)}/{cfg['iters_per_week']}); sleep 1h")
            interruptible_sleep(3600, stop_file, lambda: interrupted)
            continue

        if len(records_5h) >= cfg["iters_per_5h"]:
            sleep_s = compute_sleep(records_5h, cfg)
            log(f"5h cap reached ({len(records_5h)}/{cfg['iters_per_5h']}); sleep {sleep_s}s")
            interruptible_sleep(sleep_s, stop_file, lambda: interrupted)
            continue

        log(f"iter {iters_this_run + 1}/{args.max_iters}: spawning claude -p")
        rec = run_one_iter(
            repo, args.prompt,
            budget_usd=args.max_budget_usd_per_iter,
            timeout_s=args.iter_timeout_s,
            proc_holder=proc_holder,
        )
        iters_this_run += 1

        with state_file.open("a") as f:
            f.write(json.dumps(asdict(rec)) + "\n")

        status = "committed" if rec.committed else "NO COMMIT"
        iter_str = f"iter-{rec.iter_number}" if rec.iter_number else "no-new-log"
        log(
            f"  done: exit={rec.exit_code} {status} {iter_str} "
            f"dur={rec.duration_s}s cost=${rec.cost_usd} "
            f"in={rec.input_tokens} out={rec.output_tokens} "
            f"cache_r={rec.cache_read_input_tokens}"
        )

        if rec.exit_code != 0 or not rec.committed:
            consecutive_failures += 1
            log(f"  failure streak: {consecutive_failures}/3")
        else:
            consecutive_failures = 0

        records_5h = filter_window(load_records(state_file), ROLLING_WINDOW_HOURS)
        records_week = filter_window(load_records(state_file), WEEKLY_WINDOW_HOURS)
        total_cost_5h = sum(r.get("cost_usd", 0) for r in records_5h)
        log(
            f"  window: 5h={len(records_5h)}/{cfg['iters_per_5h']} iters "
            f"(${total_cost_5h:.2f}) · week={len(records_week)}/{cfg['iters_per_week']}"
        )

        sleep_s = compute_sleep(records_5h, cfg)
        log(f"  sleep {sleep_s}s")
        interruptible_sleep(sleep_s, stop_file, lambda: interrupted)

    log("auto-loop exit")
    return 0


if __name__ == "__main__":
    sys.exit(main())
