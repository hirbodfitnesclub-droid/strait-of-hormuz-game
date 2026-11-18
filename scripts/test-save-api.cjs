// Request-handler/CAS contract with an isolated transactional adapter.
// This does not certify a real PostgreSQL deployment or authentication.
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const rows=new Map();let queue=Promise.resolve();
const db={select(){let key;return{from(){return this},where(eq){key=eq.value;return this},async limit(){return rows.has(key)?[rows.get(key)]:[]}}},insert(){return{values(row){this.row=row;return this},async onConflictDoUpdate(){rows.set(this.row.id,this.row)}}},delete(){return{async where(eq){rows.delete(eq.value)}}},async execute(){},transaction(fn){const task=queue.then(()=>fn(db));queue=task.catch(()=>{});return task}};
const compiled=ts.transpileModule(fs.readFileSync('src/app/api/save/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};const deps={'@/db':{db},'@/db/schema':{gameSaves:{id:'id'}},'drizzle-orm':{eq:(_,value)=>({value}),sql:(parts,...values)=>({parts,values})}};
new Function('require','module','exports',compiled)(name=>{if(!deps[name])throw Error(name);return deps[name]},mod,mod.exports);
const api=mod.exports,id='test-save-0001';
const post=(baseVersion,state={cash:10})=>api.POST(new Request('https://test.local/api/save',{method:'POST',body:JSON.stringify({id,baseVersion,state})}));
const get=()=>api.GET(new Request('https://test.local/api/save?id='+id));
(async()=>{
 for(const v of [undefined,-1,NaN,1.5,'0'])assert.equal((await post(v)).status,400);
 assert.equal((await (await get()).json()).version,0);
 assert.equal((await post(0)).status,200);
 for(const v of [0,2,999])assert.equal((await post(v,{cash:999})).status,409);
 assert.equal((await (await get()).json()).state.cash,10);
 assert.deepEqual((await Promise.all([post(1,{cash:20}),post(1,{cash:30})])).map(r=>r.status),[200,409]);
 assert.equal((await (await get()).json()).version,2);
 assert.equal((await post(2,{text:'x'.repeat(200001)})).status,413);
 rows.set(id,{id,state:{cash:7},updatedAt:new Date()});assert.equal((await (await get()).json()).version,0);assert.equal((await post(0)).status,200);
 assert.equal((await api.DELETE(new Request('https://test.local/api/save?id='+id))).status,200);assert.equal((await (await get()).json()).state,null);
 console.log('PASS API invalid/missing/future/stale revisions, concurrent same-version writes, size limit, legacy envelope migration and delete; transactional adapter only');
})().catch(e=>{console.error(e);process.exit(1)});
