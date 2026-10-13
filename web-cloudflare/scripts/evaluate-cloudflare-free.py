"""Offline fixtures -> fixed Cloudflare model -> own validator. No application or D1 writes.

Run from web-cloudflare with Node 22 on PATH. Requires a freshly observed Free plan proof
in /private/tmp/moneytalk-free-plan-proof.json. Auth is obtained from official Wrangler
in memory; never print subprocess stdout/stderr containing credentials.
"""
import datetime, fcntl, hashlib, json, os, pathlib, re, subprocess, sys, time, urllib.request, urllib.error

ROOT = pathlib.Path(__file__).resolve().parents[1]
ACCOUNT = '1b2d1ae28fa06087cb07499650768745'
BASE_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8'
COMPARISON_MODEL = '@cf/qwen/qwen3.8-27b'
SUITE = ROOT / 'docs/semantic-intake-20261013/golden-cases.json'
CAP = 9500  # Aggregate UTC-day reservation ceiling; retain 500 below the official Free limit.

def budget_used(folder, utc_day=None):
    """Known completed usage settles reservation; unknown outcomes keep the full bound.
    This is this evaluator's cost ceiling, not the account-wide remaining allowance.
    """
    used = 0
    utc_day=utc_day or datetime.datetime.now(datetime.timezone.utc).date().isoformat()
    for statefile in folder.glob('free-*/reservations.json'):
        state = json.loads(statefile.read_text())
        for attempt in state['attempts']:
            cost = attempt['reserved']
            response = statefile.parent / (attempt['case'] + '.json')
            if response.exists():
                record = json.loads(response.read_text())
                result = record.get('envelope', {}).get('result', {})
                usage = result.get('usage', {})
                model = result.get('model')
                if record.get('http_status') == 200 and model in (BASE_MODEL, COMPARISON_MODEL):
                    inp, out = usage.get('prompt_tokens'), usage.get('completion_tokens')
                    neurons = usage.get('neurons')
                    if all(isinstance(n, (int, float)) and not isinstance(n, bool) and n >= 0 for n in (inp, out, neurons)):
                        if attempt.get('utc','')[:10] < utc_day: continue  # Known previous-day calls don't consume today's reset quota.
                        rates = (40909, 290909) if model == COMPARISON_MODEL else (4625, 30475)
                        estimate = (inp * rates[0] + out * rates[1]) / 1e6
                        cost = max(neurons, estimate) + 1  # Include rounding margin; never hide an overrun.
            used += cost
    return used

def node(code, payload):
    p = subprocess.run(['node', '--input-type=module', '-e', code], cwd=ROOT,
                       input=json.dumps(payload, ensure_ascii=False), text=True, capture_output=True)
    if p.returncode: raise RuntimeError('local evaluator failed')
    return json.loads(p.stdout)

def read_auth():
    p = subprocess.run([str(ROOT / 'node_modules/.bin/wrangler'), 'auth', 'token', '--json'],
                       cwd=ROOT, capture_output=True, text=True, env={**os.environ,'WRANGLER_WRITE_LOGS':'false','WRANGLER_SEND_METRICS':'false'})
    try: auth = json.loads(p.stdout)
    except Exception: raise RuntimeError('Wrangler authentication unavailable; credentials not printed')
    if auth.get('type') not in ('oauth', 'api_token'): raise RuntimeError('Bearer auth required')
    return auth

def main():
    lock = open('/private/tmp/moneytalk-free-evaluation.lock', 'w')
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)  # One evaluator at a time, including budget reservation.
    proof = json.loads(pathlib.Path('/private/tmp/moneytalk-free-plan-proof.json').read_text())
    verify_code="""import {verifyFreeDashboardProof} from './scripts/semantic-evaluation.mjs';import fs from 'node:fs';
const p=JSON.parse(fs.readFileSync(0,'utf8'));try {console.log(JSON.stringify({ok:verifyFreeDashboardProof(p.proof,p.account)}));}
catch(e){console.log(JSON.stringify({error:e.message}));}"""
    if not (node(verify_code,{'proof':proof,'account':ACCOUNT}).get('ok') and pathlib.Path(proof.get('screenshot','')).is_file()):
        raise RuntimeError('Fresh, account-specific Free proof required; no inference sent')
    suite = json.loads(SUITE.read_text())
    args=sys.argv[1:]
    version = 'synthetic-free-v4'
    if '--prompt' in args:
        pos = args.index('--prompt')
        if pos + 1 >= len(args) or args[pos + 1] not in ('v4', 'v5'): raise RuntimeError('Invalid fixed prompt version')
        version = 'synthetic-free-' + args[pos + 1]; del args[pos:pos + 2]
    messy = '--messy' in args
    if messy:
        args.remove('--messy')
        suite = json.loads((SUITE.parent / 'messy-cases.json').read_text())
    extended = '--extended' in args
    if extended: args.remove('--extended')
    run_suffix=''
    if '--run' in args:
        pos=args.index('--run')
        if pos+1>=len(args) or not re.fullmatch(r'[A-Za-z0-9_-]{1,40}',args[pos+1]): raise RuntimeError('Invalid explicit run identity')
        run_suffix='-'+args[pos+1];del args[pos:pos+2]
    comparison='--comparison' in args
    if comparison: args.remove('--comparison')
    model=COMPARISON_MODEL if comparison else BASE_MODEL
    outdir=ROOT / ('docs/semantic-intake-20261013/' + ('free-qwen38-' if comparison else 'free-api-') + version.rsplit('-', 1)[1] + run_suffix)
    ids = args or [suite['cases'][0]['id']]
    selected = [next(c for c in suite['cases'] if c['id'] == i) for i in ids]
    prefixes = ('MESSY',) if messy else ('SEM', 'SCALE') if extended else ('SEM',)
    if any(not i.startswith(prefixes) for i in ids): raise RuntimeError('Explicit synthetic long-input selection required')
    outdir.mkdir(exist_ok=True)
    statefile = outdir / 'reservations.json'
    state = json.loads(statefile.read_text()) if statefile.exists() else {'reserved_neurons': 0, 'attempts': []}
    auth=read_auth()
    request_code = """import {evaluationRequest} from './scripts/semantic-evaluation.mjs';
import fs from 'node:fs';const p=JSON.parse(fs.readFileSync(0,'utf8'));
try { const r=evaluationRequest(p.fixture,p.suite,p.version,p.model);console.log(JSON.stringify({body:r.body,reserved:r.reservedNeurons})); }
catch(e){console.log(JSON.stringify({error:e.message}));}"""
    score_code = """import {evaluateEnvelope} from './scripts/semantic-evaluation.mjs';
import fs from 'node:fs';const p=JSON.parse(fs.readFileSync(0,'utf8'));
try {console.log(JSON.stringify(evaluateEnvelope(p.envelope,p.fixture,p.suite,p.model,p.version)));}
catch(e){console.log(JSON.stringify({validation_error:e.message}));}"""
    for f in selected:
        target = outdir / (f['id'] + '.json')
        if target.exists() or f['id'] in [a['case'] for a in state['attempts']]:
            print(f['id'], 'already attempted; no automatic retry', flush=True); continue
        # A long batch must not turn a one-hour observation into permanent permission.
        if not node(verify_code, {'proof': proof, 'account': ACCOUNT}).get('ok'):
            print('Plan proof expired; no call sent', flush=True); break
        req = node(request_code, {'fixture': f, 'suite': suite, 'model':model, 'version': version})
        if 'error' in req: print(f['id'], req['error'], flush=True); continue
        if budget_used(outdir.parent) + req['reserved'] > CAP: print('Budget stop; no call sent', flush=True); break
        state['reserved_neurons'] += req['reserved']
        state['attempts'].append({'case': f['id'], 'reserved': req['reserved'], 'utc': datetime.datetime.now(datetime.timezone.utc).isoformat()})
        statefile.write_text(json.dumps(state, ensure_ascii=False, indent=2))
        t = time.monotonic()
        record = {'case': f['id'], 'model_requested': model, 'prompt_version': version,
                  'fixture_sha256': hashlib.sha256(f['raw'].encode()).hexdigest(), 'request_sha256': hashlib.sha256(json.dumps(req['body'],ensure_ascii=False).encode()).hexdigest(), 'request':req['body'], 'max_tokens': req['body'].get('max_tokens',req['body'].get('max_completion_tokens')),
                  'reserved_neurons': req['reserved'], 'plan_verified': 'Free $0; dashboard', 'synthetic_only': True}
        request = urllib.request.Request(f'https://api.cloudflare.com/client/v4/accounts/{ACCOUNT}/ai/run/{model}',
            data=json.dumps(req['body'], ensure_ascii=False).encode(), method='POST',
            headers={'Authorization': 'Bearer ' + auth['token'], 'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(request, timeout=180) as r:
                record['http_status'] = r.status
                record['cf_ray'] = r.headers.get('cf-ray')
                raw = r.read(2 * 1024 * 1024 + 1)
                if len(raw) > 2 * 1024 * 1024: raise RuntimeError('provider response too large')
                record['envelope'] = json.loads(raw)
            record['evaluation'] = node(score_code, {'envelope': record['envelope'], 'fixture': f, 'suite': suite, 'model':model, 'version': version})
        except urllib.error.HTTPError as e:
            record['http_status'] = e.code
            try: record['provider_error'] = json.loads(e.read(8192))
            except Exception: record['provider_error'] = 'non-JSON error (not logged)'
        except Exception as e:
            record['transport_error'] = type(e).__name__  # Unknown outcome keeps reserved budget.
        record['seconds'] = round(time.monotonic() - t, 3)
        target.write_text(json.dumps(record, ensure_ascii=False, indent=2))
        ev = record.get('evaluation', {})
        print(f['id'], record.get('http_status'), record['seconds'],
              'PASS' if ev.get('score', {}).get('pass') else str(ev.get('validation_error', ev.get('score', {}).get('failures', 'API failed')))[:180], flush=True)
        if record.get('http_status') != 200: break  # No repeated auth/quota/transport calls.

if __name__ == '__main__':
    try: main()
    except Exception as e: print(type(e).__name__, str(e)); sys.exit(1)
