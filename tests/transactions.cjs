const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {PGlite} = require('@electric-sql/pglite');
let db;
before(async()=>{
 db = new PGlite();
 await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
 await db.exec(fs.readFileSync('supabase/schema.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/transactions.sql','utf8'));
});
after(async()=>db?.close());
const future = () => new Date(Date.now()+3600000).toISOString();
function mandate(id,parent=null) {
 return {mandate_id:id,parent_mandate_id:parent,version:parent?2:1,superseded_by:null,principal:'operator',agent_id:'agent',instruction:'monitor under $300',intent:{},constraints:{max_amount:300,currency:'USD'},created_at:new Date().toISOString(),expires_at:future()};
}
async function insert(m) {await db.query('insert into mandates select (jsonb_populate_record(null::mandates,$1)).*',[m]);}
function auth(id,m,status='AUTHORIZED') {return {authorization_id:id,mandate_id:m,agent_id:'agent',transaction:{amount:200,currency:'USD'},provenance:[],result:{},status,created_at:new Date().toISOString(),resolved_at:null,approval:null};}
function cap(id,a,m) {return {capability_id:id,authorization_id:a,mandate_id:m,agent_id:'agent',expires_at:new Date(Date.now()+300000).toISOString()};}
async function rpc(operation,data) {return (await db.query('select deadbolt_transition($1,$2) as result',[operation,data])).rows[0].result;}
async function count(table) {return Number((await db.query(`select count(*) as n from ${table}`)).rows[0].n);}
test('revision and supersession commit atomically; losing revision leaves no orphan', async()=>{
 const m=mandate('root1');await insert(m);
 const child=mandate('child1','root1'); await rpc('revise',{mandate_id:m.mandate_id,mandate:child});
 assert.equal((await db.query("select superseded_by from mandates where mandate_id='root1'")).rows[0].superseded_by,'child1');
 await assert.rejects(rpc('revise',{mandate_id:'root1',mandate:mandate('loser','root1')}),/superseded/);
 assert.equal((await db.query("select * from mandates where mandate_id='loser'")).rows.length,0);
});
test('authorization and approval roll back if capability insertion fails',async()=>{
 await insert(mandate('root2'));
 const before=await count('authorizations');
 await assert.rejects(rpc('authorize',{mandate_id:'root2',authorization:auth('bad','root2'),capability:cap('c-bad','bad','wrong')}),/scope/);
 assert.equal(await count('authorizations'),before);
 await rpc('authorize',{mandate_id:'root2',authorization:auth('pending','root2','PENDING_APPROVAL')});
 await assert.rejects(rpc('approve',{authorization_id:'pending',status:'APPROVED',approval:{decision:'approve'},capability:cap('c-pending','pending','wrong')}),/scope/);
 assert.equal((await db.query("select status from authorizations where authorization_id='pending'")).rows[0].status,'PENDING_APPROVAL');
 const c=cap('c-pending','pending','root2');
 await rpc('approve',{authorization_id:'pending',status:'APPROVED',approval:{decision:'approve'},capability:c});
 assert.equal((await db.query("select status from authorizations where authorization_id='pending'")).rows[0].status,'APPROVED');
 await assert.rejects(rpc('approve',{authorization_id:'pending',status:'APPROVED',capability:c}),/already resolved/);
});
test('reservation is idempotent; second capability and revision cannot reopen purchased task',async()=>{
 await insert(mandate('root3'));
 for (const suffix of ['a','b']) await rpc('authorize',{mandate_id:'root3',authorization:auth('auth3'+suffix,'root3'),capability:cap('cap3'+suffix,'auth3'+suffix,'root3')});
 const request={authorization_id:'auth3a',capability_id:'cap3a',agent_id:'agent',payment_id:'payment3'};
 const p=await rpc('reserve',request);
 assert.equal(Number(p.amount),200);
 assert.equal((await rpc('reserve',{...request,payment_id:'retry-id'})).payment_id,p.payment_id);
 await assert.rejects(rpc('reserve',{...request,authorization_id:'auth3b',capability_id:'cap3b',payment_id:'extra'}),/already reserved/);
 await assert.rejects(rpc('revise',{mandate_id:'root3',mandate:mandate('child3','root3')}),/already reserved/);
});
test('failed payment insertion does not consume capability',async()=>{
 await insert(mandate('root4'));
 await rpc('authorize',{mandate_id:'root4',authorization:auth('auth4','root4'),capability:cap('cap4','auth4','root4')});
 await assert.rejects(rpc('reserve',{authorization_id:'auth4',capability_id:'cap4',agent_id:'agent',payment_id:'payment3'}),/duplicate key/);
 assert.equal((await db.query("select consumed_at from capabilities where capability_id='cap4'")).rows[0].consumed_at,null);
});
test('capture checks current mandate expiry and payment state',async()=>{
 const request={authorization_id:'auth3a',capability_id:'cap3a',payment_id:'payment3'};
 await assert.rejects(rpc('capture',request),/cannot be captured/);
 await db.exec("update payments set status='APPROVAL_PENDING',paypal_order_id='sandbox-order' where payment_id='payment3'");
 assert.equal((await rpc('capture',request)).payment_id,'payment3');
 await db.exec("update mandates set expires_at=now()-interval '1 second' where mandate_id='root3'");
 await assert.rejects(rpc('capture',request),/expired/);
});
test('public roles cannot invoke authority transitions',async()=>{
 for(const role of ['anon','authenticated']) {
  await db.exec('set role '+role);
  await assert.rejects(rpc('reserve',{}),/permission denied/);
  await db.exec('reset role');
 }
});
