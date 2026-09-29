import { z } from 'zod';
const id=z.string().uuid();
const note=z.string().trim().max(3000);
const required=z.string().trim().min(1,'Completa los campos obligatorios.').max(3000);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v,'Fecha no válida');
const time=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const stamp=z.string().datetime();
export const ruleKeys=['entry','risk','limit'] as const;
export const ruleLabels={entry:'Entrada',risk:'Riesgo',limit:'Límite de sesión'};
export const statusLabels={yes:'Cumple',no:'Incumple',unknown:'No evaluable',na:'No aplica'};
export const modeLabels={own:'Cuenta propia',simulation:'Simulación',evaluation:'Evaluación de fondeo'};
export const typeLabels={trade:'Operar',wait:'Esperar',pause:'Hacer una pausa',end:'Terminar la sesión'};
export const planSchema=z.object({id,version:z.number().int().positive(),market:z.enum(['NQ / MNQ','ES / MES']),mode:z.enum(['own','simulation','evaluation']),entry:required,risk:required,limit:required,focus:required,createdAt:stamp});
const assessmentSchema=z.object({status:z.enum(['yes','no','unknown','na']),reason:note});
export const decisionSchema=z.object({id,time,type:z.enum(['trade','wait','pause','end']),fact:required,result:z.enum(['loss','gain','flat','unknown','na']),checks:z.object({entry:assessmentSchema,risk:assessmentSchema,limit:assessmentSchema})});
export const episodeSchema=z.object({id,planId:id,date,session:required,source:z.enum(['current','historical','simulation']),loss:z.enum(['yes','no','uncertain']),lossTime:z.union([time,z.literal('')]),lossNote:note,coverage:z.enum(['complete','partial','unknown']),decisions:z.array(decisionSchema).max(100),context:note,reflection:note,reviewed:z.boolean(),createdAt:stamp,updatedAt:stamp});
export const practiceSchema=z.object({id,episodeId:id,rule:z.enum(ruleKeys),action:required,when:required,active:z.boolean(),createdAt:stamp,reports:z.array(z.object({id,date,episodeId:z.union([id,z.literal('')]),result:z.enum(['applied','not_applied','no_opportunity']),note:required})).max(100)});
export const stateSchema=z.object({consentAt:z.union([stamp,z.literal('')]),plans:z.array(planSchema).max(100),episodes:z.array(episodeSchema).max(500),practices:z.array(practiceSchema).max(500)}).strict().superRefine((s,ctx)=>{
 const problem=(message:string)=>ctx.addIssue({code:z.ZodIssueCode.custom,message});
 const unique=(xs:{id:string}[])=>new Set(xs.map(x=>x.id)).size===xs.length;
 if(!unique(s.plans)||!unique(s.episodes)||!unique(s.practices))problem('Identificadores duplicados.');
 if((s.plans.length||s.episodes.length||s.practices.length)&&!s.consentAt)problem('Falta autorización de guardado.');
 if(new Set(s.plans.map(p=>p.version)).size!==s.plans.length)problem('Las versiones del plan deben ser únicas.');
 const planIds=new Set(s.plans.map(p=>p.id));const episodeIds=new Set(s.episodes.map(e=>e.id));
 for(const e of s.episodes){
   if(!planIds.has(e.planId))problem('El episodio necesita una versión de plan válida.');
   if(!unique(e.decisions))problem('Decisiones duplicadas.');
   if(e.date>today())problem('La fecha del episodio no puede ser futura.');
   if(e.loss==='yes'&&(!e.lossTime||!e.lossNote))problem('Indica la hora y el contexto de la primera pérdida.');
   if(e.loss==='yes'&&e.decisions.some(d=>d.time<=e.lossTime))problem('Las decisiones deben ser posteriores a la primera pérdida.');
   if(e.decisions.some((d,i)=>i>0&&d.time<e.decisions[i-1].time))problem('Ordena las decisiones por hora.');
   if(e.reviewed&&!e.reflection)problem('Añade una reflexión antes de cerrar la revisión.');
   if(e.reviewed&&e.decisions.some(d=>ruleKeys.some(k=>d.checks[k].status!=='unknown'&&!d.checks[k].reason)))problem('Explica cada clasificación o déjala como no evaluable.');
 }
 if(s.practices.filter(p=>p.active).length>1)problem('Mantén una sola práctica activa.');
 for(const p of s.practices){
   const source=s.episodes.find(e=>e.id===p.episodeId);
   if(!source)problem('La práctica necesita un episodio de origen.');
   if(!unique(p.reports))problem('Seguimientos duplicados.');
   const linked=p.reports.filter(r=>r.episodeId).map(r=>r.episodeId);
   if(new Set(linked).size!==linked.length)problem('La oportunidad ya tiene un seguimiento.');
   for(const r of p.reports){
     if(r.date>today())problem('El seguimiento no puede tener fecha futura.');
     if(r.result!=='no_opportunity'&&(!r.episodeId||!episodeIds.has(r.episodeId)))problem('Vincula la oportunidad con un episodio posterior.');
     if(r.episodeId){const target=s.episodes.find(e=>e.id===r.episodeId);if(!target||target.id===p.episodeId||!!source&&(target.date<source.date||target.planId!==source.planId||target.source!==source.source)||target.date!==r.date)problem('La oportunidad debe pertenecer a otro episodio posterior y tener su fecha.');}
   }
 }
});
export type Plan=z.infer<typeof planSchema>;
export type Decision=z.infer<typeof decisionSchema>;
export type Episode=z.infer<typeof episodeSchema>;
export type Practice=z.infer<typeof practiceSchema>;
export type State=z.infer<typeof stateSchema>;
export type RuleKey=typeof ruleKeys[number];
export const emptyState=():State=>({consentAt:'',plans:[],episodes:[],practices:[]});
export const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
export const uid=()=>{if(typeof crypto.randomUUID==='function')return crypto.randomUUID();const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');};
export const now=()=>new Date().toISOString();
export const latestPlan=(s:State)=>s.plans[s.plans.length-1];
export const decisionStatus=(d:Decision)=>{
 const statuses=ruleKeys.map(k=>d.checks[k].status);
 if(statuses.includes('no'))return 'no';
 if(statuses.includes('unknown')||statuses.every(v=>v==='na'))return 'unknown';
 return 'yes';
};
export function counts(episodes:Episode[]){
 const eligible=episodes.filter(e=>e.reviewed&&e.loss==='yes'&&e.coverage==='complete');
 const decisions=eligible.flatMap(e=>e.decisions.filter(d=>d.type==='trade'));
 const evaluable=decisions.filter(d=>decisionStatus(d)!=='unknown');
 const off=evaluable.filter(d=>decisionStatus(d)==='no');
 return {sessions:eligible.length,evaluable:evaluable.length,off:off.length,unknown:decisions.length-evaluable.length,nonTrading:eligible.flatMap(e=>e.decisions.filter(d=>d.type!=='trade')).length,excluded:episodes.length-eligible.length,ratio:evaluable.length?Math.round(off.length/evaluable.length*100):null};
}
export function weekKey(date:string){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);}
export const formatDate=(v:string)=>new Intl.DateTimeFormat('es',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(v+'T12:00:00Z'));
export function newDecision():Decision{return {id:uid(),time:'',type:'trade',fact:'',result:'unknown',checks:{entry:{status:'unknown',reason:''},risk:{status:'unknown',reason:''},limit:{status:'unknown',reason:''}}};}
