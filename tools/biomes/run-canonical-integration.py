#!/usr/bin/env python3
"""CI-only: execute every run step of the maintained Dev Integration job.
The candidate does not edit that workflow just to add a temporary branch.
Fail closed on unsupported step semantics instead of silently omitting checks.
Checkout and Node setup are supplied by the enclosing candidate workflow.
"""
import json
import os
from pathlib import Path
import subprocess
import time
import yaml

root = Path(__file__).resolve().parents[2]
workflow = yaml.safe_load((root / '.github/workflows/qa-dev-integration.yml').read_text())
job = workflow['jobs']['qa']
assert not set(job) - {'runs-on', 'timeout-minutes', 'steps'}, 'Unsupported canonical job semantics'
steps = job['steps']
for step in steps:
    assert not set(step) - {'name', 'uses', 'with', 'run', 'shell', 'continue-on-error'}, step
    if 'uses' in step:
        assert step['uses'] in ('actions/checkout@v4', 'actions/setup-node@v4'), step
    else:
        assert isinstance(step.get('run'), str) and step.get('shell', 'bash') == 'bash', step
report = {'head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
          'sourceWorkflow': '.github/workflows/qa-dev-integration.yml', 'steps': []}
failed = False
for step in steps:
    if 'uses' in step:
        continue
    name = step.get('name', step['run'].splitlines()[0])
    print(f'::group::{name}', flush=True)
    start = time.perf_counter()
    result = subprocess.run(['bash', '--noprofile', '--norc', '-eo', 'pipefail', '-c', step['run']], cwd=root)
    tolerated = step.get('continue-on-error', False) is True
    report['steps'].append(dict(name=name, exitCode=result.returncode,
                                tolerated=tolerated, seconds=time.perf_counter() - start))
    print('::endgroup::', flush=True)
    if result.returncode and not tolerated:
        failed = True
        break
report['requiredFailures'] = sum(s['exitCode'] != 0 and not s['tolerated'] for s in report['steps'])
report['toleratedFailures'] = sum(s['exitCode'] != 0 and s['tolerated'] for s in report['steps'])
Path(os.environ['RUNNER_TEMP'], 'biome-canonical-integration.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps({k: v for k, v in report.items() if k != 'steps'}), flush=True)
print(f"Canonical run steps executed: {len(report['steps'])}", flush=True)
raise SystemExit(1 if failed else 0)
