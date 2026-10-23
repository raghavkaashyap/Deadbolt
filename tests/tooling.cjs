const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {createServer}=require('node:http');
const path=require('node:path');
const {mkdtempSync,rmSync}=require('node:fs');
const {tmpdir}=require('node:os');
const fixtures={
 NEXT_PUBLIC_SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service-role-test',ANTHROPIC_API_KEY:'anthropic-test',
 DEADBOLT_AGENT_ID:'shopping_agent',DEADBOLT_OPERATOR_API_KEY:'o'.repeat(40),DEADBOLT_AGENT_API_KEY:'a'.repeat(40),DEADBOLT_CAPABILITY_SECRET:'s'.repeat(40),
 PAYPAL_CLIENT_ID:'client-test',PAYPAL_CLIENT_SECRET:'secret-test',PAYPAL_API_BASE:'https://api-m.sandbox.paypal.com',
};
async function command(script,args=[],environment={}) {
 const dir=mkdtempSync(path.join(tmpdir(),'deadbolt-cli-'));
 const env={...process.env};for(const name of Object.keys(fixtures).concat(['NEXT_PUBLIC_APP_URL','DEADBOLT_BASE_URL']))delete env[name];
 try {return await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[path.resolve('scripts',script),...args],{cwd:dir,env:{...env,...environment}});
  let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
  child.on('error',reject);child.on('exit',code=>resolve({code,output}));
 });}finally{rmSync(dir,{recursive:true,force:true});}
}
test('configuration checks are mode-specific and never include credential values',async()=>{
 const {configurationProblems}=await import('../scripts/environment.mjs');
 assert.deepEqual(configurationProblems({},'demo'),[]);
 assert.ok(configurationProblems({},'sandbox').some(p=>p.includes('PAYPAL_CLIENT_SECRET')));
 assert.deepEqual(configurationProblems(fixtures,'sandbox'),[]);
 assert.ok(configurationProblems({...fixtures,DEADBOLT_OPERATOR_API_KEY:fixtures.DEADBOLT_AGENT_API_KEY},'sandbox').some(p=>p.includes('differ')));
 assert.ok(configurationProblems({...fixtures,PAYPAL_API_BASE:'https://api-m.paypal.com'},'sandbox').some(p=>p.includes('Sandbox')));
 const bad=await command('check-config.mjs');assert.equal(bad.code,1);assert.ok(bad.output.includes('Configuration incomplete'));
 const good=await command('check-config.mjs',[],fixtures);assert.equal(good.code,0);
 for(const value of [fixtures.DEADBOLT_AGENT_API_KEY,fixtures.PAYPAL_CLIENT_SECRET])assert.ok(!good.output.includes(value));
});
test('offline smoke traverses all scenarios over HTTP without credentials',async()=>{
 let privateCalls=0;
 const scenarios=['happy_path','prompt_injection','over_budget','price_inflation','hidden_subscription','merchant_substitution','ssd_purchase'];
 const server=createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;
  assert.equal(req.headers.authorization,undefined);
  let result;
  if(req.url==='/api/health')result={status:'ok'};
  else if(req.url==='/api/simulate'&&req.method==='GET')result=scenarios.map(id=>({id}));
  else if(req.url==='/api/simulate'){
   const input=JSON.parse(body);result={outcome:input.block_on_untrusted_influence?'gave_up':input.scenario==='price_inflation'?'awaiting_approval':'authorized',attempts:[{result:{decision:'BLOCKED'}}]};
  }else{privateCalls++;res.statusCode=404;result={};}
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {
  const result=await command('smoke.mjs',[],{DEADBOLT_BASE_URL:`http://127.0.0.1:${server.address().port}`});
  assert.equal(result.code,0,result.output);assert.ok(result.output.includes('PASS strict'));assert.equal(privateCalls,0);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
test('sandbox helper demands explicit approval and keeps credentials and tokens out of output',async()=>{
 const missing=await command('sandbox-smoke.mjs',['checkout','auth_test'],fixtures);assert.equal(missing.code,1);assert.ok(missing.output.includes('--approve'));
 const tx={merchant:'Best Buy',product:'LG 27-inch QHD Monitor',product_category:'monitor',brand:'LG',condition:'new',amount:219.99,currency:'USD',quantity:1,recurring:false,attributes:{screen_size_in:27}};
 let approvals=0;
 const server=createServer(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;
  let result;
  if(req.url==='/api/authorizations/auth_test')result={mandate:{principal:'smoke_test',agent_id:'shopping_agent',instruction:'Buy one new LG 27-inch monitor for no more than 300 USD as a one-time purchase.'},transaction:tx};
  else if(req.url==='/api/approvals/auth_test'){approvals++;assert.equal(req.headers.authorization,'Bearer '+fixtures.DEADBOLT_OPERATOR_API_KEY);result={capability:{token:'sensitive-capability'}};}
  else if(req.url==='/api/payments'){assert.equal(JSON.parse(body).capability_token,'sensitive-capability');result={payment_id:'pay_test',status:'APPROVAL_PENDING',approve_url:'https://www.sandbox.paypal.com/checkoutnow?token=ORDER'};}
  else{res.statusCode=404;result={};}
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const result=await command('sandbox-smoke.mjs',['checkout','auth_test','--approve'],{...fixtures,DEADBOLT_BASE_URL:`http://127.0.0.1:${server.address().port}`});
  assert.equal(result.code,0,result.output);assert.equal(approvals,1);assert.ok(result.output.includes('capture pay_test'));
  for(const value of ['sensitive-capability',fixtures.DEADBOLT_OPERATOR_API_KEY,fixtures.PAYPAL_CLIENT_SECRET])assert.ok(!result.output.includes(value));
 }finally{await new Promise(resolve=>server.close(resolve));}
});
