const ts=require('typescript');
const Module=require('node:module');
const fs=require('node:fs');
const path=require('node:path');
const resolve=Module._resolveFilename;
Module._resolveFilename=function(name,...args){return resolve.call(this,name.startsWith('@/')?path.resolve('src',name.slice(2)):name,...args);};
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const {NextRequest}=require('next/server');
let db;
const calls=[];
let createFailures=0,createStatus="CREATED";
const storeFile=require.resolve('../src/lib/deadbolt/store.ts');
class TransitionConflict extends Error {}
function mock(file,exports){const id=require.resolve(file);require.cache[id]={id,filename:id,loaded:true,exports};}
async function one(sql,args){return (await db.query(sql,args)).rows[0]??null;}
mock('../src/lib/deadbolt/store.ts',{
 TransitionConflict,
 getMandate:async id=>one('select * from mandates where mandate_id=$1',[id]),
 getAuthorization:async id=>one('select * from authorizations where authorization_id=$1',[id]),
 getPayment:async id=>one('select * from payments where payment_id=$1',[id]),
 getCapabilityForAuthorization:async id=>(await one('select payload from capabilities where authorization_id=$1',[id]))?.payload??null,
 transition:async(operation,data)=>{
  try{return (await one('select deadbolt_transition($1,$2) as result',[operation,data])).result;}
  catch(e){if(['P0001','23505'].includes(e.code))throw new TransitionConflict(e.message);throw e;}
 },
 updatePayment:async(id,fields)=>{
  const allowed=fields.paypal_order_id?['CREATED']:['APPROVAL_PENDING'];
  const current=await one('select * from payments where payment_id=$1',[id]);
  if(!allowed.includes(current.status))return current;
  const row={...current,...fields};
  await db.query('update payments set status=$2,paypal_order_id=$3,approve_url=$4,raw=$5 where payment_id=$1',[id,row.status,row.paypal_order_id,row.approve_url,row.raw]);
  return row;
 },
});
mock('../src/lib/deadbolt/semanticCheck.ts',{evaluateIntent:async()=>({intent_match:1,violations:[],reason:'test'})});
mock('../src/lib/deadbolt/paypal.ts',{
 createOrder:async args=>{calls.push({kind:'create',...args});if(createFailures-->0)throw new Error('Simulated uncertain outcome');return {order:{id:'sandbox-'+args.paymentId,status:createStatus},approveUrl:'https://sandbox.paypal.com/approve'};},
 captureOrder:async id=>{calls.push({kind:'capture',id});return {id,status:'COMPLETED'};},
});
const authorize=require('../src/app/api/authorize/route.ts');
const approval=require('../src/app/api/approvals/[id]/route.ts');
const payment=require('../src/app/api/payments/route.ts');
const capture=require('../src/app/api/payments/[id]/capture/route.ts');
const {makeDemoMandate}=require('../src/lib/deadbolt/agent/simulator.ts');
const {CATALOG}=require('../src/lib/deadbolt/agent/catalog.ts');
const agentKey='a'.repeat(40),operatorKey='o'.repeat(40);
function request(body,key=agentKey){return new NextRequest('http://localhost/api/test',{method:'POST',headers:{'Content-Type':'application/json',...(key?{Authorization:'Bearer '+key}:{})},body:JSON.stringify(body)});}
function params(id){return {params:Promise.resolve({id})};}
before(async()=>{
 process.env.DEADBOLT_AGENT_API_KEY=agentKey;process.env.DEADBOLT_OPERATOR_API_KEY=operatorKey;
 process.env.DEADBOLT_AGENT_ID='shopping_agent';process.env.DEADBOLT_CAPABILITY_SECRET='s'.repeat(40);
 db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 await db.exec(fs.readFileSync('supabase/schema.sql','utf8'));await db.exec(fs.readFileSync('supabase/transactions.sql','utf8'));
 const m={...makeDemoMandate('monitor'),mandate_id:'api-task',agent_id:'shopping_agent'};
 await db.query('insert into mandates select (jsonb_populate_record(null::mandates,$1)).*',[m]);
});
after(async()=>db?.close());
const tx=CATALOG.lg_27_monitor.listing;
const body={agent_id:'shopping_agent',mandate_id:'api-task',transaction:tx,provenance:[]};
let authorizationId,token,paymentId;
test('API rejects missing credentials, agent self-approval and forged identity',async()=>{
 assert.equal((await authorize.POST(request(body,null))).status,401);
 assert.equal((await approval.POST(request({decision:'approve'}),params('anything'))).status,401);
 assert.equal((await authorize.POST(request({...body,agent_id:'other'}))).status,403);
 assert.equal(calls.length,0);
});
test('client-provided provenance always requires approval; hard failures remain blocked',async()=>{
 const result=await authorize.POST(request(body));assert.equal(result.status,200);
 const json=await result.json();assert.equal(json.decision,'REQUIRES_APPROVAL');assert.equal(json.capability,null);authorizationId=json.authorization_id;
 const blocked=await authorize.POST(request({...body,transaction:{...tx,amount:999}}));assert.equal((await blocked.json()).decision,'BLOCKED');
 assert.equal(calls.length,0);
});
test('approval issues a token atomically and a lost-response retry returns the same token',async()=>{
 const req=()=>request({decision:'approve'},operatorKey);
 const first=await approval.POST(req(),params(authorizationId));assert.equal(first.status,200);
 token=(await first.json()).capability.token;
 const retry=await approval.POST(req(),params(authorizationId));assert.equal(retry.status,200);assert.equal((await retry.json()).capability.token,token);
 assert.equal(Number((await one('select count(*) as n from capabilities')).n),1);
});
test('changed purchase is refused; repeated valid requests return the same reserved payment',async()=>{
 const base={agent_id:'shopping_agent',capability_token:token,transaction:tx};
 assert.equal((await payment.POST(request({...base,transaction:{...tx,attributes:{screen_size_in:24}}}))).status,403);
 assert.equal(calls.length,0);
 const first=await payment.POST(request(base));assert.equal(first.status,201);paymentId=(await first.json()).payment_id;
 const retry=await payment.POST(request(base));assert.equal(retry.status,200);assert.equal((await retry.json()).payment_id,paymentId);
 assert.equal(calls.filter(c=>c.kind==='create').length,1);
 assert.equal((await authorize.POST(request(body))).status,409);
});
test('capture requires credentials, rechecks the task and is idempotent',async()=>{
 assert.equal((await capture.POST(request({},null),params(paymentId))).status,401);
 const first=await capture.POST(request({}),params(paymentId));assert.equal(first.status,200);assert.equal((await first.json()).status,'COMPLETED');
 assert.equal((await capture.POST(request({}),params(paymentId))).status,200);
 assert.equal(calls.filter(c=>c.kind==='capture').length,1);
});

test('an uncertain order creation keeps its reservation and handles an already-completed retry',async()=>{
 const m={...makeDemoMandate('monitor'),mandate_id:'retry-task',agent_id:'shopping_agent'};
 await db.query('insert into mandates select (jsonb_populate_record(null::mandates,$1)).*',[m]);
 const result=await authorize.POST(request({...body,mandate_id:'retry-task'}));
 const id=(await result.json()).authorization_id;
 const approved=await approval.POST(request({decision:'approve'},operatorKey),params(id));
 const cap=(await approved.json()).capability.token;
 const base={agent_id:'shopping_agent',capability_token:cap,transaction:tx};
 createFailures=1;
 const logger=console.error;let failed;
 try {console.error=()=>{};failed=await payment.POST(request(base));} finally {console.error=logger;}
 assert.equal(failed.status,502);
 const reservation=await one('select * from payments where authorization_id=$1',[id]);assert.equal(reservation.status,'CREATED');
 createStatus='COMPLETED';
 const retry=await payment.POST(request(base));assert.equal(retry.status,201);
 const completed=await retry.json();assert.equal(completed.payment_id,reservation.payment_id);assert.equal(completed.status,'COMPLETED');
 const creates=calls.filter(c=>c.kind==='create'&&c.paymentId===reservation.payment_id);assert.equal(creates.length,2);
 assert.equal(Number((await one('select count(*) as n from payments where authorization_id=$1',[id])).n),1);
});
