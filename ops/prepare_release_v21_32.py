import json
from pathlib import Path

VERSION = '21.32.0'

pkg_path = Path('package.json')
pkg = json.loads(pkg_path.read_text(encoding='utf-8'))
pkg['version'] = VERSION
pkg['worldDriveChannel'] = 'stable'
pkg_path.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

lock_path = Path('package-lock.json')
lock = json.loads(lock_path.read_text(encoding='utf-8'))
lock['version'] = VERSION
lock.setdefault('packages', {}).setdefault('', {})['version'] = VERSION
lock_path.write_text(json.dumps(lock, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

qa_path = Path('qa/qa-version-branding-a6.mjs')
qa = qa_path.read_text(encoding='utf-8')
old = "assert.equal(pkg.version,'21.31.0','A6 must align the package build with the V21.31 baseline');\nassert.equal(pkg.worldDriveChannel,'dev','the development branch must identify itself as dev; stable is reserved for release promotion');"
new = "const refName=process.env.GITHUB_REF_NAME||'';\nconst expectedChannel=(refName==='main'||refName.startsWith('release/'))?'stable':'dev';\nassert.equal(pkg.version,'21.32.0','A6 must align the package build with the V21.32 baseline');\nassert.equal(pkg.worldDriveChannel,expectedChannel,'package channel must match branch role: release/main=stable, development=dev');"
if old not in qa:
    raise SystemExit('qa-version-branding-a6.mjs expected baseline assertions not found')
qa_path.write_text(qa.replace(old, new, 1), encoding='utf-8')

workflow_path = Path('.github/workflows/qa-dev-integration.yml')
workflow = workflow_path.read_text(encoding='utf-8')
needle = "    branches:\n      - dev\n"
replacement = "    branches:\n      - dev\n      - 'release/**'\n"
if "      - 'release/**'\n" not in workflow:
    if needle not in workflow:
        raise SystemExit('Dev Integration branch trigger anchor not found')
    workflow = workflow.replace(needle, replacement, 1)
workflow_path.write_text(workflow, encoding='utf-8')

print('Prepared World Drive V21.32 stable candidate')
