"""Install a per-user macOS launch agent for research-only shadow scheduling.

Run from this checkout after setting LLM_RESEARCHER_ENABLED=true in .env.
No cadence overrides or other ingestion sources are enabled by this service.
"""
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys

if sys.platform != "darwin":
    raise SystemExit("This installer requires macOS launchd.")
root = Path(__file__).resolve().parents[1]
node = shutil.which("node")
if not node:
    raise SystemExit("Node.js is required.")
label = "local.culture-crisis-tracker.researcher"
agent = Path.home() / "Library" / "LaunchAgents" / f"{label}.plist"
logs = Path.home() / "Library" / "Logs" / "CultureCrisisTracker"
agent.parent.mkdir(parents=True, exist_ok=True)
logs.mkdir(parents=True, exist_ok=True)
config = {
    "Label": label,
    "ProgramArguments": [node, "--conditions=react-server", "--import", "tsx", "scripts/scheduler-worker.ts", "--research-only"],
    "WorkingDirectory": str(root),
    "EnvironmentVariables": {"SCHEDULER_ENABLED": "true", "PATH": f"{Path(node).parent}:/usr/bin:/bin:/usr/sbin:/sbin"},
    "RunAtLoad": True,
    "KeepAlive": True,
    "ThrottleInterval": 300,
    "StandardOutPath": str(logs / "researcher.log"),
    "StandardErrorPath": str(logs / "researcher-error.log"),
}
previous_config = plistlib.loads(agent.read_bytes()) if agent.exists() else None
with agent.open("wb") as stream:
    plistlib.dump(config, stream)
agent.chmod(0o600)
domain = f"gui/{os.getuid()}"
loaded = subprocess.run(["launchctl", "print", f"{domain}/{label}"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
if loaded and previous_config == config:
    # Restart an unchanged service in place; bootout/bootstrap has an async teardown race.
    subprocess.run(["launchctl", "kickstart", "-k", f"{domain}/{label}"], check=True)
else:
    if loaded:
        import time
        subprocess.run(["launchctl", "bootout", f"{domain}/{label}"], check=True)
        for _ in range(25):
            if subprocess.run(["launchctl", "print", f"{domain}/{label}"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode != 0:
                break
            time.sleep(0.2)
        time.sleep(0.5)
    subprocess.run(["launchctl", "bootstrap", domain, str(agent)], check=True)
print(f"Installed {label}\nConfiguration: {agent}\nLogs: {logs}")
