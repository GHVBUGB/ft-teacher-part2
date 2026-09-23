"""Manage the localhost API independently of a temporary development terminal.

Usage: python3 scripts/backend-service.py start|stop|status
Loaded for the current macOS login session; this does not install login startup.
"""
import os
import plistlib
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
label = 'local.ft-practice.backend'
domain = f'gui/{os.getuid()}'
target = f'{domain}/{label}'
action = sys.argv[1] if len(sys.argv) > 1 else 'status'
if action not in ('start', 'stop', 'status'):
    raise SystemExit('Usage: backend-service.py start|stop|status')
if action == 'stop':
    raise SystemExit(subprocess.call(['launchctl', 'bootout', target]))
state = subprocess.run(['launchctl', 'print', target], capture_output=True, text=True)
if state.returncode == 0:
    for line in state.stdout.splitlines():
        if line.strip().startswith(('state =', 'pid =', 'runs =')):
            print(line.strip())
    raise SystemExit(0)
if action == 'status':
    raise SystemExit('Backend is not running. Run this script with start.')
python = root / 'server/.venv/bin/python'
if not python.exists():
    raise SystemExit('Create the server virtual environment first; see server/README.md.')
runtime = root / 'artifacts/runtime/backend-service'
runtime.mkdir(parents=True, exist_ok=True)
plist = runtime / f'{label}.plist'
plist.write_bytes(plistlib.dumps({
    'Label': label,
    'ProgramArguments': [str(python), str(root / 'server/run_local.py')],
    'WorkingDirectory': str(root / 'server'),
    'RunAtLoad': True, 'KeepAlive': True, 'ThrottleInterval': 5,
    'EnvironmentVariables': {'PYTHONUNBUFFERED': '1'},
    'StandardOutPath': str(runtime / 'stdout.log'),
    'StandardErrorPath': str(runtime / 'stderr.log'),
}))
subprocess.run(['launchctl', 'bootstrap', domain, str(plist)], check=True)
print('Backend service started on 127.0.0.1:8000. Logs:', runtime)
