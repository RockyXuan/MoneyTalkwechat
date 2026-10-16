"""Run the unchanged Free evaluator with read-verified modules outside iCloud eviction.
Only code, existing parser dependencies and fictional fixtures are copied. No auth files or DBs.
"""
import datetime, hashlib, importlib.util, json, pathlib, subprocess, sys, tempfile
from concurrent.futures import ThreadPoolExecutor
sys.dont_write_bytecode = True
ROOT = pathlib.Path(__file__).resolve().parents[1]
SCRIPTS = ('semantic-evaluation.mjs', 'semantic-stream.mjs', 'semantic-audit.mjs')
FIXTURES = ('golden-cases.json', 'golden-audits.json', 'messy-cases.json')
def digest(data): return hashlib.sha256(data).hexdigest()
def prepare_snapshot():
    folder = pathlib.Path(tempfile.mkdtemp(prefix='moneytalk-semantic-modules-'))
    rows = [(p, p.relative_to(ROOT)) for p in (ROOT/'shared').glob('*.js')]
    rows += [(ROOT/'scripts'/n, pathlib.Path('scripts')/n) for n in SCRIPTS]
    rows += [(ROOT/'docs/semantic-intake-20261013'/n, pathlib.Path('docs/semantic-intake-20261013')/n) for n in FIXTURES]
    rows += [(ROOT/'package.json', pathlib.Path('package.json'))]
    for name in ('zod', 'eventsource-parser'):
        base = (ROOT/'node_modules'/name).resolve()
        if not base.is_dir(): raise RuntimeError('Existing evaluator dependency is unavailable; do not reinstall automatically')
        rows += [(p, pathlib.Path('node_modules')/name/p.relative_to(base)) for p in base.rglob('*') if p.is_file() and not p.is_symlink() and (p.suffix in ('.js','.mjs','.cjs','.json') or p.name.startswith('LICENSE'))]
    def copy(row):
        source, relative = row; size = source.stat().st_size; data = source.read_bytes()
        if len(data) != size: raise RuntimeError('Incomplete installed source read; no inference sent')
        target = folder/relative; target.parent.mkdir(parents=True, exist_ok=True); target.write_bytes(data)
        if target.read_bytes() != data: raise RuntimeError('Temporary module readback mismatch')
        return {'path':str(relative), 'bytes':len(data), 'sha256':digest(data)}
    with ThreadPoolExecutor(max_workers=8) as pool: files = list(pool.map(copy, rows))
    (folder/'snapshot-manifest.json').write_text(json.dumps({'source':str(ROOT), 'files':files}, ensure_ascii=False, indent=2))
    return folder

def verify_snapshot(folder):
    folder = folder.resolve()
    allowed = (pathlib.Path('/private/tmp').resolve(), pathlib.Path(tempfile.gettempdir()).resolve())
    if not any(folder.is_relative_to(p) for p in allowed): raise RuntimeError('Evaluator copy must remain in a temporary directory')
    manifest = json.loads((folder/'snapshot-manifest.json').read_bytes())
    if manifest.get('source') != str(ROOT): raise RuntimeError('Wrong source repository for temporary modules')
    files = manifest.get('files'); names = set()
    if not isinstance(files, list) or not files: raise RuntimeError('Missing snapshot manifest')
    for row in files:
        relative = pathlib.Path(row['path'])
        if relative.is_absolute() or '..' in relative.parts or str(relative) in names: raise RuntimeError('Invalid snapshot path')
        names.add(str(relative)); data = (folder/relative).read_bytes()
        if len(data) != row['bytes'] or digest(data) != row['sha256']: raise RuntimeError('Temporary module integrity mismatch')
        if relative.parts[0] != 'node_modules' and digest((ROOT/relative).read_bytes()) != row['sha256']: raise RuntimeError('Project source changed; rebuild temporary modules before evaluation')
    required = {'package.json', *('scripts/'+n for n in SCRIPTS), *('docs/semantic-intake-20261013/'+n for n in FIXTURES), *(str(p.relative_to(ROOT)) for p in (ROOT/'shared').glob('*.js'))}
    if not required.issubset(names): raise RuntimeError('Incomplete temporary evaluator source set')
    return folder, {'source':str(ROOT), 'snapshot':str(folder), 'manifest_sha256':digest((folder/'snapshot-manifest.json').read_bytes()), 'verified_files':len(files), 'purpose':'same evaluation modules outside macOS iCloud eviction; auth, budget and evidence remain in original repository'}

def main():
    args = sys.argv[1:]; folder = None
    if '--module-root' in args:
        i = args.index('--module-root')
        if i+1 >= len(args): raise RuntimeError('Missing temporary module directory')
        folder = pathlib.Path(args[i+1]); del args[i:i+2]
    check_only = '--check-only' in args
    if check_only: args.remove('--check-only')
    folder, provenance = verify_snapshot(folder or prepare_snapshot())
    print(json.dumps({'verified_module_root':str(folder), 'verified_files':provenance['verified_files'], 'check_only':check_only}), flush=True)
    if check_only: return
    name = 'execution-module-snapshot-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'.json'
    with (ROOT/'docs/semantic-intake-20261013'/name).open('x') as output: output.write(json.dumps(provenance, ensure_ascii=False, indent=2))
    spec = importlib.util.spec_from_file_location('free_evaluator', ROOT/'scripts/evaluate-cloudflare-free.py')
    evaluator = importlib.util.module_from_spec(spec); spec.loader.exec_module(evaluator)
    def stable_node(code, payload):
        result = subprocess.run(['node','--input-type=module','-e',code], cwd=folder, input=json.dumps(payload,ensure_ascii=False), text=True, capture_output=True, timeout=60)
        if result.returncode: raise RuntimeError('Local evaluator failed; credentials not printed')
        return json.loads(result.stdout)
    evaluator.node = stable_node  # Only local request generation/decoding/scoring; no provider or auth substitution.
    sys.argv = [str(ROOT/'scripts/evaluate-cloudflare-free.py'), *args]
    evaluator.main()
if __name__ == '__main__':
    try: main()
    except Exception as error: print(type(error).__name__, str(error)); sys.exit(1)
