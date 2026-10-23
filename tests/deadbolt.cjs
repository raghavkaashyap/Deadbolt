const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  const source = require('fs').readFileSync(filename, 'utf8');
  module._compile(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText, filename);
};
const test = require('node:test');
const assert = require('node:assert/strict');
const {makeDemoMandate, SCENARIOS, runShoppingAgent} = require('../src/lib/deadbolt/agent/simulator.ts');
const {createLocalAuthorizer} = require('../src/lib/deadbolt/agent/localAuthorizer.ts');
const {CATALOG} = require('../src/lib/deadbolt/agent/catalog.ts');
const {evaluatePolicy} = require('../src/lib/deadbolt/policyEngine.ts');
const {decide} = require('../src/lib/deadbolt/decision.ts');
const {analyzeProvenance} = require('../src/lib/deadbolt/provenance.ts');
const {issueCapability, verifyCapability} = require('../src/lib/deadbolt/capability.ts');
const mandate = makeDemoMandate('monitor');
const tx = CATALOG.lg_27_monitor.listing;
test('all seven scenarios retain expected outcomes', async () => {
 for (const [id,s] of Object.entries(SCENARIOS)) {
  const m=makeDemoMandate(s.mandate);
  const result=await runShoppingAgent({scenario:id,mandate:m,authorize:createLocalAuthorizer(m)});
  assert.equal(result.outcome,id==='price_inflation'?'awaiting_approval':'authorized', id);
 }
});
test('missing provenance cannot auto-authorize at perfect semantic confidence', () => {
 const result=decide({mandate,transaction:tx,checks:evaluatePolicy(mandate,tx),findings:analyzeProvenance([]),semantic:{intent_match:1,violations:[],reason:'match'}});
 assert.equal(result.decision,'REQUIRES_APPROVAL');
});
test('category substring and invalid quantity cannot pass hard policy', () => {
 for(const change of [{product_category:'monitor gift card'},{quantity:0},{quantity:-1},{quantity:1.5}]) {
  assert.ok(evaluatePolicy(mandate,{...tx,...change}).some(c=>!c.passed&&c.severity==='block'));
 }
});
test('capabilities bind every purchase field and expire with mandate', () => {
 process.env.DEADBOLT_CAPABILITY_SECRET='test-only-secret-abcdefghijklmnopqrstuvwxyz';
 const {token,payload}=issueCapability('test',mandate,tx);
 assert.ok(Date.parse(payload.expires_at)<=Date.parse(mandate.expires_at));
 assert.ok(verifyCapability(token,mandate.agent_id,tx).ok);
 for(const change of [{amount:1},{brand:'other'},{condition:'used'},{product_category:'gift card'},{attributes:{screen_size_in:24}},{recipient:'attacker'}]) {
  assert.equal(verifyCapability(token,mandate.agent_id,{...tx,...change}).ok,false);
 }
 assert.equal(verifyCapability(token+'.extra',mandate.agent_id,tx).ok,false);
});
