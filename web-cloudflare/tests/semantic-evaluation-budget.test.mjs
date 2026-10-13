import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('actual free evaluation budget settles measured calls, carries unknown outcomes and separates UTC days',()=>{
 const code=`import importlib.util,tempfile,pathlib,json
s=importlib.util.spec_from_file_location('ev','scripts/evaluate-cloudflare-free.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
import types,os
os.environ['WRANGLER_WRITE_LOGS']='true'
def fake_run(args,**kwargs):
 assert args[-3:]==['auth','token','--json']
 assert kwargs['capture_output'] is True
 assert kwargs['env']['WRANGLER_WRITE_LOGS']=='false'
 assert kwargs['env']['WRANGLER_SEND_METRICS']=='false'
 return types.SimpleNamespace(stdout=json.dumps({'type':'oauth','token':'fictional-only'}))
m.subprocess.run=fake_run
assert m.read_auth()['token']=='fictional-only'
with tempfile.TemporaryDirectory() as tmp:
 p=pathlib.Path(tmp)/'free-test';p.mkdir()
 a={'case':'SEM01','reserved':200,'utc':'2026-10-13T12:00:00+00:00'}
 (p/'reservations.json').write_text(json.dumps({'attempts':[a]}))
 assert m.budget_used(p.parent,'2026-10-13')==200
 # A client timeout from yesterday is still potentially executing; retain its full reservation.
 assert m.budget_used(p.parent,'2026-10-14')==200
 response={'http_status':200,'envelope':{'result':{'model':m.BASE_MODEL,'usage':{'prompt_tokens':1000,'completion_tokens':100,'neurons':10}}}}
 (p/'SEM01.json').write_text(json.dumps(response))
 assert m.budget_used(p.parent,'2026-10-13')==11
 assert m.budget_used(p.parent,'2026-10-14')==0
 response['envelope']['result']['usage']['neurons']=300
 (p/'SEM01.json').write_text(json.dumps(response));assert m.budget_used(p.parent,'2026-10-13')==301
 response['envelope']['result']['usage']['neurons']=-1
 (p/'SEM01.json').write_text(json.dumps(response));assert m.budget_used(p.parent,'2026-10-13')==200
 print('budget invariants passed')`;
 assert.match(execFileSync('python3',['-c',code],{cwd:new URL('..',import.meta.url),encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}}),/budget invariants passed/);
});
