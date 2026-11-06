#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLIST="\${HOME}/Library/LaunchAgents/com.dealradar.local-scan.plist"
LOG_DIR="\${HOME}/Library/Logs/DealRadar"
mkdir -p "$(dirname "$PLIST")" "$LOG_DIR"
python3 - "$ROOT" "$PLIST" "$LOG_DIR" <<'PY'
import os
import plistlib
import sys
root, plist_path, log_dir = sys.argv[1:]
script = os.path.join(root, "scripts", "run_local_radar.sh")
data = {
    "Label": "com.dealradar.local-scan",
    "ProgramArguments": ["/bin/bash", script],
    "WorkingDirectory": root,
    "RunAtLoad": True,
    "StartInterval": 900,
    "StandardOutPath": os.path.join(log_dir, "scanner.log"),
    "StandardErrorPath": os.path.join(log_dir, "scanner-error.log"),
    "EnvironmentVariables": {
        "PATH": "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
    },
}
with open(plist_path, "wb") as f:
    plistlib.dump(data, f)
PY
launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/com.dealradar.local-scan"
echo "Installed: local Deal Radar scan every 15 minutes while Mac is logged in and Ollama is running."
echo "Logs: \${LOG_DIR}"
