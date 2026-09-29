import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import {emptyState,now,uid} from '../lib/model.ts';
const require=createRequire(import.meta.url);const wranglerRequire=createRequire(require.resolve('wrangler/package.json'));const {Miniflare}=wranglerRequire('miniflare');
test('API y D1: identidad, aislamiento, guardado, conflicto, versiones, validación, CSRF y borrado',async()=>{
 const root=new URL('../dist/server/',import.meta.url).pathname;const js=(await readdir(root,{recursive:true})).filter(f=>f.endsWith('.js')&&f!=='index.js');
 const mf=new Miniflare({modulesRoot:root,modules:['index.js',...js].map(f=>({type:'ESModule',path:root+f})),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB']});
 try{
 const db=await mf.getD1Database('DB');await db.exec((await readFile(new URL('../drizzle/0000_old_obadiah_stane.sql',import.meta.url),'utf8')).replace(/\n/g,' '));
 const request=(owner,method='GET',body,extra={})=>mf.dispatchFetch('https://trader.test/api/state',{method,headers:{...(owner?{'oai-authenticated-user-id':owner}:{}),...(method!=='GET'?{'Origin':'https://trader.test','Content-Type':'application/json'}:{}),...extra},...(body?{body:JSON.stringify(body)}:{})});
 assert.equal((await request(null)).status,401,'producción falla cerrada sin identidad');
 const first=await (await request('qa-a')).json();assert.deepEqual(first.state,emptyState());assert.equal(first.preview,false);
 const p={id:uid(),version:1,market:'NQ / MNQ',mode:'simulation',entry:'Entrada de prueba',risk:'Riesgo de prueba',limit:'Límite de prueba',focus:'DEMO DATA',createdAt:now()};
 const state={...emptyState(),consentAt:now(),plans:[p]};
 const save=await request('qa-a','PUT',{state,revision:first.revision});assert.equal(save.status,200);const saved=await save.json();
 assert.deepEqual((await (await request('qa-a')).json()).state,state,'persistencia');
 const exported=await mf.dispatchFetch('https://trader.test/api/state?download=1',{headers:{'oai-authenticated-user-id':'qa-a'}});assert.equal(exported.status,200);assert.match(exported.headers.get('content-disposition'),/attachment/);assert.deepEqual((await exported.json()).data,state,'exportación completa');
 assert.equal((await (await request('qa-b')).json()).state.plans.length,0,'aislamiento por identidad');
 assert.equal((await request('qa-a','PUT',{state,revision:first.revision})).status,409,'conflicto evita sobreescritura');
 assert.equal((await request('qa-a','PUT',{state,revision:saved.revision},{Origin:'https://outside.test'})).status,403,'CSRF');
 assert.equal((await request('qa-a','PUT',{state:{...state,consentAt:''},revision:saved.revision})).status,422,'permiso requerido');
 const changed=structuredClone(state);changed.plans[0].risk='Cambio silencioso';assert.equal((await request('qa-a','PUT',{state:changed,revision:saved.revision})).status,422,'historia inmutable');
 const versioned={...state,plans:[...state.plans,{...p,id:uid(),version:2}]};const versionRes=await request('qa-a','PUT',{state:versioned,revision:saved.revision});assert.equal(versionRes.status,200);const version=await versionRes.json();
 assert.equal((await request('qa-a','DELETE',undefined,{'If-Match':version.revision})).status,200);
 const deleted=await(await request('qa-a')).json();assert.deepEqual(deleted.state,emptyState());
 assert.equal((await request('qa-a','PUT',{state:versioned,revision:version.revision})).status,409,'no resucita datos eliminados con revisión vieja');
 }finally{await mf.dispose();}
});
