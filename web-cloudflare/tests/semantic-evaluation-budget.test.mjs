import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('actual free evaluation budget settles measured calls, carries unknown outcomes and separates UTC days',()=>{
 const code=`import importlib.util,tempfile,pathlib,json
s=importlib.util.spec_from_file_location('ev','scripts/evaluate-cloudflare-free.py');m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
import types,os
os.environ['WRANGLER_WRITE_LOGS']='true'
def fake_run(args,**kwargs):
 assert kwargs['capture_output'] is True
 assert kwargs['timeout']==60
 assert kwargs['env']['WRANGLER_WRITE_LOGS']=='false'
 assert kwargs['env']['WRANGLER_SEND_METRICS']=='false'
 assert kwargs['env']['CI']=='true'
 if args[-2:]==['whoami','--json']: return types.SimpleNamespace(returncode=0,stdout='{}')
 assert args[-3:]==['auth','token','--json']
 return types.SimpleNamespace(returncode=0,stdout=json.dumps({'type':'oauth','token':'fictional-only'}))
m.subprocess.run=fake_run
assert m.read_auth()['token']=='fictional-only'
with tempfile.TemporaryDirectory() as tmp:
 p=pathlib.Path(tmp)/'free-test';p.mkdir()
 a={'case':'SEM01','reserved':200,'utc':'2026-10-13T12:00:00+00:00'}
 (p/'reservations.json').write_text(json.dumps({'attempts':[a]}))
 assert m.budget_used(p.parent,'2026-10-13')==200
 # A client timeout from yesterday is still potentially executing; retain its full reservation.
 assert m.budget_used(p.parent,'2026-10-14')==200
 response={'http_status':200,'envelope':{'success':True,'result':{'model':m.BASE_MODEL,'usage':{'prompt_tokens':1000,'completion_tokens':100,'neurons':10}}}}
 (p/'SEM01.json').write_text(json.dumps(response))
 assert m.budget_used(p.parent,'2026-10-13')==11
 assert m.budget_used(p.parent,'2026-10-14')==0
 # HTTP 200 with an unsuccessful/malformed envelope or invalid usage is still unknown.
 for bad in [
  {**response,'envelope':None},
  {**response,'envelope':{**response['envelope'],'success':False}},
  {**response,'envelope':{'result':response['envelope']['result']}},
  {**response,'envelope':{'success':True,'result':[]}},
  {**response,'envelope':{'success':True,'result':{**response['envelope']['result'],'usage':None}}},
  *[{**response,'envelope':{'success':True,'result':{**response['envelope']['result'],'usage':{**response['envelope']['result']['usage'],k:v}}}} for k,v in [('prompt_tokens',1.5),('completion_tokens',True),('neurons',float('inf')),('neurons',float('nan'))]]]:
  (p/'SEM01.json').write_text(json.dumps(bad));assert m.budget_used(p.parent,'2026-10-14')==200
 broken={'http_status':200,'stream_validation_error':'流协议无效','finished_at':'2026-10-13T12:02:00+00:00','stream_base64':'fictional-incomplete'}
 (p/'SEM01.json').write_text(json.dumps(broken));assert m.budget_used(p.parent,'2026-10-13')==200
 assert m.budget_used(p.parent,'2026-10-14')==200
 response['envelope']['result']['usage']['neurons']=300
 (p/'SEM01.json').write_text(json.dumps(response));assert m.budget_used(p.parent,'2026-10-13')==301
 response['envelope']['result']['usage']['neurons']=-1
 (p/'SEM01.json').write_text(json.dumps(response));assert m.budget_used(p.parent,'2026-10-13')==200
 denied={'http_status':401,'provider_error':{'success':False,'result':None,'errors':[{'code':10000,'message':'Authentication error'}]}}
 (p/'SEM01.json').write_text(json.dumps(denied));assert m.budget_used(p.parent,'2026-10-13')==0
 assert m.budget_used(p.parent,'2026-10-14')==0
 for bad in [{**denied,'http_status':403},{**denied,'provider_error':{}},{**denied,'provider_error':{**denied['provider_error'],'result':{'usage':{}}}}]:
  (p/'SEM01.json').write_text(json.dumps(bad));assert m.budget_used(p.parent,'2026-10-13')==200
 ended={'http_status':408,'finished_at':'2026-10-13T12:02:00+00:00','provider_error':{'success':False,'result':{},'errors':[{'code':3046,'message':'AiError: AiError: Request timeout (aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa)'}]}}
 (p/'SEM01.json').write_text(json.dumps(ended));assert m.budget_used(p.parent,'2026-10-13')==200
 assert m.budget_used(p.parent,'2026-10-14')==0
 for bad in [{**ended,'finished_at':None},{**ended,'provider_error':{}},{**ended,'http_status':200}]:
  (p/'SEM01.json').write_text(json.dumps(bad));assert m.budget_used(p.parent,'2026-10-14')==200
 calls=[]
 def unavailable(args,**kwargs):
  calls.append(args);return types.SimpleNamespace(returncode=1,stdout='private-do-not-print',stderr='private-do-not-print')
 m.subprocess.run=unavailable
 try:m.read_auth();raise AssertionError('failed login must stop')
 except RuntimeError as e:assert 'private' not in str(e)
 assert len(calls)==1 and calls[0][-2:]==['whoami','--json']
 for marker,label in [('spawn ENOEXEC','local executable failure'),('fetch failed','network failure'),('invalid_grant','existing login unavailable')]:
  def rejected(args,**kwargs):return types.SimpleNamespace(returncode=1,stdout='private-do-not-print',stderr=marker+' private-do-not-print')
  m.subprocess.run=rejected
  try:m.read_auth();raise AssertionError('preflight must stop')
  except RuntimeError as e:assert label in str(e) and 'private' not in str(e)
 for failure in [m.subprocess.TimeoutExpired('private-do-not-print',60,output='private-do-not-print'),OSError('private-do-not-print')]:
  def broken(args,**kwargs):raise failure
  m.subprocess.run=broken
  try:m.read_auth();raise AssertionError('timeout/start failure must stop')
  except RuntimeError as e:assert 'private' not in str(e) and 'no inference sent' in str(e)
 print('budget invariants passed')`;
 assert.match(execFileSync('python3',['-c',code],{cwd:new URL('..',import.meta.url),encoding:'utf8',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}}),/budget invariants passed/);
});
