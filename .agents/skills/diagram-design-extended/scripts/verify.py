#!/usr/bin/env python3
"""Single verification entrypoint for diagram HTML, with no third-party deps.

    python3 scripts/verify.py my-diagram.html [--profile SLUG_OR_PATH] [--dark] [--screenshots IMG ...]

Layer-2 opinion gates (accent budget, radius range, shadow policy, the
dark-mode/glow guard) are parameterized by the active profile's fenced YAML
block via profile_gates.py (issue 14). Resolution order per issue 08: an
explicit --profile wins, else the nearest project marker file
`.diagram-design`, else the shipped default profile. The profile that
parameterized the run is recorded in verify.json under "profile".

Probes the environment and picks the highest achievable verification tier
(issues 01/02 of the diagram-profiles-next map):

* T1 browser-verified: agent-browser drives a rendered pass (verify_browser.py)
  on top of the static checks. Only T1 may claim "browser check passed".
* T2 screenshot-assisted: automation blocked, but user-supplied screenshots
  (--screenshots) serve as the rendered baseline for human review.
* T3 static-only: source audits alone; rendered geometry was not verified.

Runs the existing check scripts appropriate to the tier and writes
`<name>.verify.json` next to the input file: tier reached, per-check
pass/fail, fix cycles used, component library id, and the list of output
files. This report is the machine-readable return contract (issue 08) that
the future agent's retry/accept loop consumes.

On tier-probe failure the verbatim agent-browser provisioning recipe from
issue 01 is printed; this script never self-provisions.

Exit 0 = every check that ran passed. Exit 1 = findings or unreadable input.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

import profile_gates  # noqa: E402  sibling stdlib-only helper (issue 14)
import self_check  # noqa: E402  sibling stdlib-only helper

# Verbatim provisioning recipe from issues/01-agent-browser-in-codex-sandbox.md.
AGENT_BROWSER_RECIPE = """\
One-time setup, run outside the sandbox (normal terminal, or approve the
escalation when Codex asks):

    npm install -g agent-browser
    agent-browser install              # downloads Chrome for Testing to ~/.agent-browser/browsers/
    agent-browser install --with-deps  # Linux only: system libraries, needs sudo
    agent-browser doctor               # verify: launch test must pass

Codex config, in ~/.codex/config.toml:

    sandbox_mode = "workspace-write"

    [sandbox_workspace_write]
    network_access = true
    writable_roots = ["~/.agent-browser"]

Environment for every agent-browser call inside the sandbox:

    export AGENT_BROWSER_SOCKET_DIR=/tmp/agent-browser-sock   # sockets under a default writable root
    export AGENT_BROWSER_ARGS=--no-sandbox                    # Chromium cannot nest its sandbox inside Codex's
    # only if Chrome was NOT installed via agent-browser install:
    export AGENT_BROWSER_EXECUTABLE_PATH=/usr/bin/chromium    # or any system Chrome path
"""


def probe_t1() -> str | None:
    """Return None when agent-browser can drive a browser, else the blocking reason."""
    if shutil.which("agent-browser") is None:
        return "agent-browser not on PATH"
    try:
        result = subprocess.run(
            ["agent-browser", "eval", "1+1"],
            capture_output=True,
            text=True,
            timeout=120,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return f"agent-browser probe failed to run: {exc}"
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "no output"
        return f"agent-browser cannot launch a browser: {detail}"
    return None


def run_check(name: str, command: list[str]) -> dict[str, object]:
    result = subprocess.run(command, capture_output=True, text=True)
    output = (result.stdout + result.stderr).strip()
    status = "pass" if result.returncode == 0 else "fail"
    print(f"[{status.upper():4}] {name}")
    if output and status == "fail":
        print("\n".join(f"       {line}" for line in output.splitlines()[:20]))
    return {
        "status": status,
        "exit_code": result.returncode,
        "output": output,
    }


def has_motion_markup(path: Path) -> bool:
    try:
        return "data-motion-root" in path.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return False


def component_library(path: Path) -> str | None:
    """Return the data-component-library value on the diagram SVG root, or None.

    The convention (references/components.md): the SVG root carries
    data-component-library="<library-id>@<major>". Only <svg> opening tags
    are scanned, so mentions of the attribute in visible text don't match.
    """
    try:
        source = path.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return None
    for svg_tag in re.finditer(r"<svg\b[^>]*>", source):
        attr = re.search(
            r"""data-component-library\s*=\s*["']([^"']+)["']""", svg_tag.group(0)
        )
        if attr:
            return attr.group(1)
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", type=Path, help="diagram HTML file")
    parser.add_argument(
        "--profile",
        default=None,
        metavar="SLUG_OR_PATH",
        help="explicit active profile (path or library slug); wins over the project marker file",
    )
    parser.add_argument("--dark", action="store_true", help="pass --dark through to the browser gate")
    parser.add_argument(
        "--screenshots",
        nargs="+",
        type=Path,
        default=[],
        metavar="IMG",
        help="user-supplied rendered screenshots; enables T2 when the browser probe fails",
    )
    args = parser.parse_args()

    path = args.file.resolve()
    if not path.is_file():
        print(f"ERROR {path}: not a file")
        return 1

    blocking_reason = probe_t1()
    if blocking_reason is None:
        tier = "T1"
    elif args.screenshots:
        tier = "T2"
    else:
        tier = "T3"

    if blocking_reason is not None:
        print(f"Tier probe: T1 unavailable ({blocking_reason}). Running at {tier}.")
        print("To reach T1, provision agent-browser (issue 01 recipe, verbatim):")
        print()
        print(AGENT_BROWSER_RECIPE)
    else:
        print("Tier probe: agent-browser launch OK. Running at T1.")

    checks: dict[str, dict[str, object]] = {}

    # Layer-2 opinion gates, parameterized by the active profile (issue 14).
    # Resolution order (issue 08): explicit --profile, else the project
    # marker file, else the shipped default (references/style-guide.md).
    # Layer-1 invariants below stay hardcoded and always block.
    profile_report: dict[str, object] | None = None
    try:
        profile_report, gate_findings = profile_gates.run(path, args.profile)
    except profile_gates.GateError as exc:
        checks["profile_gates"] = {
            "status": "fail",
            "exit_code": 1,
            "output": f"profile gates could not run: {exc}",
        }
        print("[FAIL] profile_gates")
        print(f"       profile gates could not run: {exc}")
    else:
        label = profile_report["slug"] or profile_report["name"] or "default"
        print(f"Active profile: {label} ({profile_report['source']}) at {profile_report['path']}")
        status = "fail" if gate_findings else "pass"
        checks["profile_gates"] = {
            "status": status,
            "exit_code": 1 if gate_findings else 0,
            "output": "\n".join(gate_findings),
        }
        print(f"[{status.upper():4}] profile_gates")
        for finding in gate_findings[:20]:
            print(f"       {finding}")

    # Static checks run at every tier.
    checks["self_check"] = run_check(
        "self_check", [sys.executable, str(SCRIPT_DIR / "self_check.py"), str(path)]
    )
    checks["check_slop"] = run_check(
        "check_slop", [sys.executable, str(SCRIPT_DIR / "check_slop.py"), str(path)]
    )
    checks["verify-geometry"] = run_check(
        "verify-geometry", [sys.executable, str(SCRIPT_DIR / "verify-geometry.py"), str(path)]
    )
    # Static card copy-budget check (issues 02/03): blocking at every tier,
    # so the T3 static-only path still enforces it.
    checks["card-lines"] = run_check(
        "card-lines",
        [sys.executable, str(SCRIPT_DIR / "verify-geometry.py"), "--card-lines", str(path)],
    )
    if has_motion_markup(path):
        checks["verify-motion"] = run_check(
            "verify-motion", [sys.executable, str(SCRIPT_DIR / "verify-motion.py"), str(path)]
        )
    else:
        checks["verify-motion"] = {"status": "skipped", "reason": "no motion markup"}
        print("[SKIP] verify-motion (no motion markup)")

    # Mandatory safety preflight before any browser rendering (fail closed):
    # a file that breaks the single-file safety contract must never be opened
    # in agent-browser, even though the static checks above already recorded
    # the failure for the report.
    safety: list[str] = []
    if tier == "T1":
        try:
            safety = self_check.safety_errors(path)
        except (OSError, UnicodeError) as exc:
            safety = [f"safety preflight could not read the file: {exc}"]

    screenshot_dir = path.parent / f"{path.stem}-screenshots"
    if tier == "T1" and safety:
        blocked = (
            "blocked: single-file safety findings — unsafe HTML was not rendered\n"
            + "\n".join(safety)
        )
        print("[FAIL] verify_browser (blocked: unsafe HTML, not rendered)")
        for finding in safety[:20]:
            print(f"       {finding}")
        checks["verify_browser"] = {"status": "fail", "exit_code": 1, "output": blocked}
        for name in ("card-overlap", "connector-transit", "label-collision"):
            checks[f"rendered-{name}"] = {"status": "fail", "exit_code": 1, "output": blocked}
    elif tier == "T1":
        command = [
            sys.executable,
            str(SCRIPT_DIR / "verify_browser.py"),
            str(path),
            "--out",
            str(screenshot_dir),
        ]
        if args.dark:
            command.append("--dark")
        checks["verify_browser"] = run_check("verify_browser", command)
        # T1 rendered geometry checks (issues 02/03): verify_browser.py emits
        # one machine-readable line with per-check findings; surface each as
        # its own blocking check in verify.json.
        rendered: dict[str, list[str]] = {}
        for line in str(checks["verify_browser"]["output"]).splitlines():
            if line.startswith("RENDERED_CHECKS_JSON: "):
                try:
                    rendered = json.loads(line[len("RENDERED_CHECKS_JSON: "):])
                except json.JSONDecodeError:
                    rendered = {}
        for name in ("card-overlap", "connector-transit", "label-collision"):
            if name in rendered:
                lines = rendered[name]
                checks[f"rendered-{name}"] = {
                    "status": "fail" if lines else "pass",
                    "exit_code": 1 if lines else 0,
                    "output": "\n".join(lines),
                }
            else:
                checks[f"rendered-{name}"] = {
                    "status": "fail",
                    "exit_code": 1,
                    "output": "verify_browser.py did not report this rendered check (gate aborted before geometry ran)",
                }
    else:
        checks["verify_browser"] = {"status": "skipped", "reason": blocking_reason}
        print(f"[SKIP] verify_browser ({blocking_reason})")
        for name in ("card-overlap", "connector-transit", "label-collision"):
            checks[f"rendered-{name}"] = {"status": "skipped", "reason": blocking_reason}

    output_files = [str(path)]
    if tier == "T1" and screenshot_dir.is_dir():
        output_files.extend(str(shot) for shot in sorted(screenshot_dir.glob("*.png")))
    if tier == "T2":
        output_files.extend(str(shot.resolve()) for shot in args.screenshots)
    report_path = path.parent / f"{path.stem}.verify.json"
    output_files.append(str(report_path))

    report = {
        "tier": tier,
        "t1_blocking_reason": blocking_reason,
        "profile": profile_report,
        "checks": checks,
        "fix_cycles": 0,
        "component_library": component_library(path),
        "output_files": output_files,
    }
    # Sidecar write hardening: never follow a pre-planted symlink (local file
    # clobbering in an attacker-controlled directory), and replace the
    # directory entry atomically via a temp file + os.replace.
    if report_path.is_symlink():
        print(f"ERROR {report_path}: refusing to write the report over a symlink")
        return 1
    fd, tmp_name = tempfile.mkstemp(
        dir=str(path.parent), prefix=f".{path.stem}.verify.", suffix=".tmp"
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(json.dumps(report, indent=2) + "\n")
        os.replace(tmp_name, report_path)
    except OSError:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise

    failed = sorted(name for name, check in checks.items() if check["status"] == "fail")
    ran = sum(1 for check in checks.values() if check["status"] != "skipped")
    print(f"Report: {report_path}")
    print(f"Summary: tier {tier}, {ran} check(s) run, {len(failed)} failure(s)."
          + (f" Failed: {', '.join(failed)}." if failed else ""))
    if tier != "T1":
        print("Rendered geometry was NOT verified; do not claim a browser check passed.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
