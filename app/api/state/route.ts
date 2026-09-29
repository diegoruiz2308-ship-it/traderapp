import { database } from '@/db/store';
import { emptyState, stateSchema } from '@/lib/model';
export const dynamic='force-dynamic';
const preview=import.meta.env.DEV;
const cookieName='trader_review_session';
function identity(request:Request){
 const auth=request.headers.get('oai-authenticated-user-id');
 if(auth)return {owner:auth,cookie:''};
 if(!preview)return null;
 const match=request.headers.get('cookie')?.match(/(?:^|; )trader_review_session=([a-f0-9-]{36})(?:;|$)/);
 const token=match?.[1]||crypto.randomUUID();
 return {owner:'preview:'+token,cookie:match?'':cookieName+'='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000'};
}
function respond(value:unknown,status=200,cookie=''){const headers:Record<string,string>={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};if(cookie)headers['Set-Cookie']=cookie;return Response.json(value,{status,headers});}
function sameOrigin(request:Request){const origin=request.headers.get('origin');return !!origin&&origin===new URL(request.url).origin;}
export async function GET(request:Request){
 const user=identity(request);if(!user)return respond({error:'Inicia sesión para acceder a tu cuaderno.'},401);
 try{
  const db=database();
  await db.prepare('INSERT OR IGNORE INTO workspaces (owner_id, revision, data, updated_at) VALUES (?, ?, ?, ?)').bind(user.owner,crypto.randomUUID(),JSON.stringify(emptyState()),new Date().toISOString()).run();
  const row=await db.prepare('SELECT revision, data FROM workspaces WHERE owner_id = ?').bind(user.owner).first<{revision:string,data:string}>();
  if(!row)throw new Error('Missing workspace');
  if(new URL(request.url).searchParams.get('download')==='1'){
   const exported={version:'0.1',exportedAt:new Date().toISOString(),provenance:'Autorreporte del usuario',data:JSON.parse(row.data)};
   return new Response(JSON.stringify(exported,null,2),{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="mi-cuaderno-trader.json"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(user.cookie?{'Set-Cookie':user.cookie}:{})}});
  }
  return respond({state:JSON.parse(row.data),revision:row.revision,preview},200,user.cookie);
 }catch{console.error('workspace_read_failed');return respond({error:'No pudimos cargar tu cuaderno. Inténtalo de nuevo.'},503,user.cookie);}
}
export async function PUT(request:Request){
 const user=identity(request);if(!user)return respond({error:'Inicia sesión para guardar.'},401);
 if(!sameOrigin(request))return respond({error:'Origen no permitido.'},403);
 try{
  const raw=await request.text();if(raw.length>1500000)return respond({error:'El cuaderno supera el tamaño admitido en esta versión.'},413);
  let body;try{body=JSON.parse(raw);}catch{return respond({error:'El formato recibido no es válido.'},400);}
  if(typeof body.revision!=='string')return respond({error:'Falta la versión del cuaderno.'},400);
  const parsed=stateSchema.safeParse(body.state);if(!parsed.success)return respond({error:parsed.error.issues[0].message},422);
  const db=database();
  const previous=await db.prepare('SELECT data FROM workspaces WHERE owner_id = ? AND revision = ?').bind(user.owner,body.revision).first<{data:string}>();
  if(!previous)return respond({error:'Tu cuaderno cambió en otra pestaña. Copia tus cambios y recarga antes de guardar.'},409);
  const prior=stateSchema.parse(JSON.parse(previous.data));
  if(prior.plans.some(p=>!parsed.data.plans.some(n=>n.id===p.id&&JSON.stringify(n)===JSON.stringify(p))))return respond({error:'Conserva las versiones anteriores del plan; crea una versión nueva.'},422);
  if(parsed.data.practices.some(p=>!prior.practices.some(x=>x.id===p.id)&&!parsed.data.episodes.find(e=>e.id===p.episodeId)?.reviewed))return respond({error:'Revisa el episodio antes de crear una práctica.'},422);
  const revision=crypto.randomUUID();
  const saved=await db.prepare('UPDATE workspaces SET data = ?, revision = ?, updated_at = ? WHERE owner_id = ? AND revision = ?').bind(JSON.stringify(parsed.data),revision,new Date().toISOString(),user.owner,body.revision).run();
  if(saved.meta.changes!==1)return respond({error:'El cuaderno cambió en otra pestaña. Copia tus cambios y recarga.'},409);
  return respond({state:parsed.data,revision,preview},200,user.cookie);
 }catch{console.error('workspace_write_failed');return respond({error:'No se guardaron los cambios. Conservamos el formulario; vuelve a intentarlo.'},503);}
}
export async function DELETE(request:Request){
 const user=identity(request);if(!user)return respond({error:'Inicia sesión para borrar.'},401);
 if(!sameOrigin(request))return respond({error:'Origen no permitido.'},403);
 const revision=request.headers.get('if-match');if(!revision)return respond({error:'Falta la versión actual.'},400);
 try{
  const result=await database().prepare('DELETE FROM workspaces WHERE owner_id = ? AND revision = ?').bind(user.owner,revision).run();
  if(result.meta.changes!==1)return respond({error:'El cuaderno cambió. Recarga antes de borrar.'},409);
  return respond({deleted:true});
 }catch{console.error('workspace_delete_failed');return respond({error:'No se pudo borrar. Inténtalo de nuevo.'},503);}
}
