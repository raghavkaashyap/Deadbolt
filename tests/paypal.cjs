const ts=require('typescript');
const fs=require('node:fs');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);
const {test,beforeEach,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const originalFetch=global.fetch;
const envNames=['PAYPAL_API_BASE','PAYPAL_CLIENT_ID','PAYPAL_CLIENT_SECRET','NEXT_PUBLIC_APP_URL'];
let saved;
beforeEach(()=>{
 saved=Object.fromEntries(envNames.map(name=>[name,process.env[name]]));
 process.env.PAYPAL_CLIENT_ID='dummy-client-id';process.env.PAYPAL_CLIENT_SECRET='dummy-secret';
 process.env.NEXT_PUBLIC_APP_URL='http://localhost:3000';delete process.env.PAYPAL_API_BASE;
 delete require.cache[require.resolve('../src/lib/deadbolt/paypal.ts')];
});
afterEach(()=>{global.fetch=originalFetch;for(const name of envNames){if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}});
const reply=(data,status=200)=>Response.json(data,{status});
const args={paymentId:'pay-test',amount:12.50,currency:'USD',description:'Test purchase'};
const token=()=>reply({access_token:'dummy-token',expires_in:3600});
const order=(id='ORDER123')=>({id,status:'CREATED',links:[{rel:'approve',href:'https://www.sandbox.paypal.com/checkoutnow?token='+id}]});
test('concurrent orders share OAuth token, keep stable request IDs and serialize cents',async()=>{
 const calls=[];global.fetch=async(url,init)=>{calls.push({url,init});return url.endsWith('/token')?token():reply(order());};
 const {createOrder,captureOrder}=require('../src/lib/deadbolt/paypal.ts');
 await Promise.all([createOrder(args),createOrder({...args,paymentId:'pay-two'})]);
 assert.equal(calls.filter(c=>c.url.endsWith('/token')).length,1);
 const creates=calls.filter(c=>c.url.endsWith('/orders'));assert.equal(creates[0].init.headers['PayPal-Request-Id'],'pay-test');
 assert.equal(JSON.parse(creates[0].init.body).purchase_units[0].amount.value,'12.50');
 assert.ok(creates[0].init.signal instanceof AbortSignal);assert.equal(creates[0].init.redirect,'error');
 global.fetch=async(url,init)=>{calls.push({url,init});return reply({id:'ORDER123',status:'COMPLETED'});};
 await captureOrder('ORDER123');await captureOrder('ORDER123');
 assert.ok(calls.slice(-2).every(c=>c.init.headers['PayPal-Request-Id']==='capture_ORDER123'));
});
test('live hosts, invalid currency, fractional cents and unsafe return origins make no requests',async()=>{
 let calls=0;global.fetch=async()=>{calls++;return token();};
 const {createOrder}=require('../src/lib/deadbolt/paypal.ts');
 process.env.PAYPAL_API_BASE='https://api-m.paypal.com';await assert.rejects(createOrder(args),/Only PayPal Sandbox/);
 delete process.env.PAYPAL_API_BASE;
 await assert.rejects(createOrder({...args,currency:'EUR'}),/USD/);
 await assert.rejects(createOrder({...args,amount:1.001}),/cents/);
 process.env.NEXT_PUBLIC_APP_URL='http://user:password@localhost:3000/path';await assert.rejects(createOrder(args),/origin/);
 assert.equal(calls,0);
});
test('malformed token or order responses fail closed',async()=>{
 const {createOrder}=require('../src/lib/deadbolt/paypal.ts');
 global.fetch=async()=>reply({access_token:'',expires_in:-1});await assert.rejects(createOrder(args),/invalid access token/);
 global.fetch=async url=>url.endsWith('/token')?token():reply({status:'COMPLETED'});await assert.rejects(createOrder(args),/invalid order/);
});
test('provider errors expose only safe correlation fields, never response bodies',async()=>{
 global.fetch=async url=>url.endsWith('/token')?token():reply({debug_id:'debug123',details:[{issue:'INTERNAL_SERVER_ERROR'}],message:'sensitive-provider-body dummy-token dummy-secret'},503);
 const {createOrder,PayPalError}=require('../src/lib/deadbolt/paypal.ts');
 await assert.rejects(createOrder(args),e=>e instanceof PayPalError&&e.status===503&&e.debugId==='debug123'&&!/sensitive|dummy/.test(e.message));
});
test('401 discards cached OAuth token for a caller-controlled retry',async()=>{
 let oauth=0,orders=0;
 global.fetch=async url=>{if(url.endsWith('/token')){oauth++;return token();}orders++;return orders===1?reply({},401):reply(order());};
 const {createOrder}=require('../src/lib/deadbolt/paypal.ts');
 await assert.rejects(createOrder(args),/HTTP 401/);assert.equal(orders,1);
 await createOrder(args);assert.equal(oauth,2);assert.equal(orders,2);
});
test('network failure and invalid JSON do not automatically repeat financial POSTs',async()=>{
 let posts=0;global.fetch=async url=>{if(url.endsWith('/token'))return token();posts++;throw new DOMException('internal secret details','TimeoutError');};
 const {createOrder}=require('../src/lib/deadbolt/paypal.ts');
 await assert.rejects(createOrder(args),/outcome may be uncertain/);assert.equal(posts,1);
 global.fetch=async()=>new Response('not json');await assert.rejects(createOrder(args),/invalid JSON/);
});
test('external and missing approval links are rejected',async()=>{
 const {createOrder}=require('../src/lib/deadbolt/paypal.ts');
 global.fetch=async url=>url.endsWith('/token')?token():reply({...order(),links:[{rel:'approve',href:'https://paypal.com.attacker.example/checkout'}]});
 await assert.rejects(createOrder(args),/unexpected approval URL/);
 global.fetch=async()=>reply({id:'ORDER123',status:'CREATED'});await assert.rejects(createOrder(args),/no buyer approval URL/);
});
test('capture rejects path injection and an unrelated returned order',async()=>{
 const {captureOrder}=require('../src/lib/deadbolt/paypal.ts');let calls=0;
 global.fetch=async url=>{calls++;return url.endsWith('/token')?token():reply({id:'OTHER123',status:'COMPLETED'});};
 await assert.rejects(captureOrder('../wrong'),/Invalid PayPal order ID/);assert.equal(calls,0);
 await assert.rejects(captureOrder('ORDER123'),/different order/);
});
