import test from 'node:test';
import assert from 'node:assert/strict';
import {counts,decisionIsEffective,reportHasTemporalCredit,decisionStatus,emptyState,newDecision,now,stateSchema,uid,weekKey} from '../lib/model.ts';
const p={id:uid(),version:1,market:'NQ / MNQ',mode:'simulation',entry:'Regla de entrada',risk:'Regla de riesgo',limit:'Límite',focus:'Proceso',createdAt:now()};
const d=(statuses=['yes','yes','yes'],type='trade',result='loss')=>({...newDecision(),time:'10:15',fact:'DEMO DATA · Decisión de prueba',type,result,checks:Object.fromEntries(['entry','risk','limit'].map((k,i)=>[k,{status:statuses[i],reason:'Evidencia de prueba'}]))});
const episode=(overrides={})=>({id:uid(),planId:p.id,date:'2026-09-28',session:'DEMO DATA · Caso',source:'simulation',loss:'yes',lossTime:'10:00',lossNote:'Primera pérdida cerrada',coverage:'complete',decisions:[d()],context:'',reflection:'Revisión de prueba',reviewed:true,createdAt:now(),updatedAt:now(),...overrides});
const state=e=>({...emptyState(),consentAt:now(),plans:[p],episodes:[e]});
test('una pérdida conforme no es indisciplina',()=>{assert.equal(decisionStatus(d()),'yes');assert.equal(counts([episode()]).off,0);});
test('una ganancia con varias infracciones cuenta una vez',()=>{const e=episode({decisions:[d(['no','no','yes'],'trade','gain')]});assert.equal(counts([e]).off,1);assert.equal(counts([e]).evaluable,1);});
test('sin decisiones evaluables la proporción no es calculable',()=>assert.equal(counts([episode({decisions:[d(['unknown','yes','yes'])]})]).ratio,null));
test('ausencia de pérdida y cobertura parcial se excluyen',()=>{const c=counts([episode({loss:'no'}),episode({coverage:'partial'}),episode({reviewed:false})]);assert.equal(c.evaluable,0);assert.equal(c.excluded,3);});
test('pausas se conservan y se cuentan aparte',()=>{const c=counts([episode({decisions:[d(['na','yes','yes'],'pause','na')]})]);assert.equal(c.nonTrading,1);assert.equal(c.ratio,null);});
test('clasificación toda no aplica no inventa cumplimiento',()=>assert.equal(decisionStatus(d(['na','na','na'])),'unknown'));
test('una infracción identificada no se oculta por otra regla desconocida',()=>assert.equal(decisionStatus(d(['no','unknown','yes'])),'no'));
test('rechaza decisiones anteriores a la pérdida',()=>{const e=episode();e.decisions[0].time='09:59';assert.equal(stateSchema.safeParse(state(e)).success,false);});
test('rechaza fechas inexistentes',()=>assert.equal(stateSchema.safeParse(state(episode({date:'2026-02-31'}))).success,false));
test('rechaza clasificación sin motivo',()=>{const e=episode();e.decisions[0].checks.entry.reason='';assert.equal(stateSchema.safeParse(state(e)).success,false);});
test('rechaza práctica sin evidencia de origen',()=>{const s=state(episode());s.practices=[{id:uid(),episodeId:uid(),rule:'entry',action:'Acción',when:'Condición',active:true,createdAt:now(),reports:[]}];assert.equal(stateSchema.safeParse(s).success,false);});
test('conserva práctica al corregir su origen, pendiente de revisión',()=>{const e=episode({reviewed:false});const s=state(e);s.practices=[{id:uid(),episodeId:e.id,rule:'entry',action:'Acción',when:'Condición',active:true,createdAt:now(),reports:[]}];assert.equal(stateSchema.safeParse(s).success,true);});
test('rechaza usar dos veces una oportunidad',()=>{const e=episode();const later=episode({date:'2026-09-29'});const s=state(e);s.episodes.push(later);s.practices=[{id:uid(),episodeId:e.id,rule:'entry',action:'Acción',when:'Condición',active:true,createdAt:now(),reports:[1,2].map(()=>({id:uid(),date:later.date,episodeId:later.id,result:'applied',note:'Evidencia'}))}];assert.equal(stateSchema.safeParse(s).success,false);});
test('una semana comienza el lunes y cruza meses correctamente',()=>{assert.equal(weekKey('2026-03-01'),'2026-02-23');assert.equal(weekKey('2026-09-29'),'2026-09-28');});
test('nueva referencia mantiene la validez histórica de cada caso',()=>{const e=episode();const s=state(e);s.plans.push({...p,id:uid(),version:2,mode:'own'});assert.equal(stateSchema.safeParse(s).success,true);assert.equal(s.episodes[0].planId,p.id);});

// A01: all dates/hours are session-local; createdAt remains a technical timestamp.
const a01=(targetDate='2026-09-09',targetTime='10:15')=>{
 const origin=episode({date:'2026-09-01',source:'historical'});
 const target=episode({date:targetDate,source:'historical',decisions:[{...d(),time:targetTime}]});
 const practice={id:uid(),episodeId:origin.id,rule:'entry',action:'Acción',when:'Condición',active:true,createdAt:now(),effectiveFrom:'2026-09-10T10:15',reports:[]};
 const report={id:uid(),date:target.date,episodeId:target.id,decisionId:target.decisions[0].id,result:'applied',note:'DEMO DATA · Evidencia'};
 const s={...state(origin),episodes:[origin,target],practices:[practice]};
 return {s,practice,report,origin,target};
};
test('A01 A: decisión del 9 no es candidata para práctica efectiva el 10',()=>{
 const {practice,target,report,s}=a01();
 assert.equal(decisionIsEffective(practice,target,target.decisions[0]),false);
 assert.equal(reportHasTemporalCredit(practice,report,s.episodes),false);
});
test('A01 B: decisión del 11 puede ser candidata y aplicación válida',()=>{
 const {s,practice,target,report}=a01('2026-09-11');practice.reports.push(report);
 assert.equal(decisionIsEffective(practice,target,target.decisions[0]),true);
 assert.equal(reportHasTemporalCredit(practice,report,s.episodes),true);
 assert.equal(stateSchema.safeParse(s).success,true);
});
test('A01 C: introducir aplicación retroactiva directamente en el estado es rechazado',()=>{
 for(const result of ['applied','not_applied']){
  const {s,practice,report}=a01();practice.reports.push({...report,result});
  const parsed=stateSchema.safeParse(s);assert.equal(parsed.success,false);
  assert.match(parsed.error.issues.map(i=>i.message).join(' '),/momento efectivo/);
 }
});
test('A01 D: origen histórico anterior sigue accesible, sin transformarse en aplicación',()=>{
 const {s,origin,practice}=a01();const parsed=stateSchema.parse(s);
 assert.deepEqual(parsed.episodes.find(e=>e.id===practice.episodeId),origin);
 assert.equal(parsed.practices[0].reports.length,0);
 assert.equal(parsed.practices[0].createdAt,practice.createdAt);
});
test('A01: dentro del mismo día se compara la hora y se admite la igualdad',()=>{
 for(const [hour,valid] of [['10:14',false],['10:15',true],['10:16',true]]){
  const {s,practice,target,report}=a01('2026-09-10',hour);practice.reports.push(report);
  assert.equal(decisionIsEffective(practice,target,target.decisions[0]),valid);
  assert.equal(stateSchema.safeParse(s).success,valid);
 }
});
test('A01: una decisión posterior no da crédito a otra anterior del mismo episodio',()=>{
 const {s,practice,target,report}=a01('2026-09-10','10:14');
 const later={...d(),time:'10:16'};target.decisions.push(later);practice.reports.push(report);
 assert.equal(stateSchema.safeParse(s).success,false);
 report.decisionId=later.id;assert.equal(stateSchema.safeParse(s).success,true);
});
test('A01: sin oportunidad exige fecha y hora suficientes posteriores al momento efectivo',()=>{
 for(const [day,hour,valid] of [['2026-09-09','12:00',false],['2026-09-10','10:14',false],['2026-09-10','10:15',true],['2026-09-11','09:00',true],['2026-09-11',undefined,false]]){
  const {s,practice}=a01();const report={id:uid(),date:day,time:hour,episodeId:'',result:'no_opportunity',note:'Sin oportunidad'};
  practice.reports.push(report);
  assert.equal(reportHasTemporalCredit(practice,report,s.episodes),valid);
  assert.equal(stateSchema.safeParse(s).success,valid);
 }
});
test('A01: no inventa vigencia para prácticas antiguas y conserva todos sus seguimientos',()=>{
 const {s,practice,report}=a01();delete practice.effectiveFrom;delete report.decisionId;
 practice.reports.push(report,{id:uid(),date:'2026-09-02',episodeId:'',result:'no_opportunity',note:'Historia'});
 const parsed=stateSchema.parse(s);assert.deepEqual(parsed,s);
 for(const r of parsed.practices[0].reports)assert.equal(reportHasTemporalCredit(parsed.practices[0],r,parsed.episodes),false);
});
test('A01: falta de decisión identificable no obtiene crédito aunque exista otra posterior',()=>{
 for(const decisionId of [undefined,uid()]){
  const {s,practice,report}=a01('2026-09-11');practice.reports.push({...report,decisionId});
  assert.equal(stateSchema.safeParse(s).success,false);
 }
});
test('A01: no admite momentos efectivos incompletos, fechas inválidas ni zonas inventadas',()=>{
 for(const effectiveFrom of ['2026-09-10','2026-02-31T10:15','2026-09-10T25:00','2026-09-10T10:15Z','2026-09-10T10:15-04:00']){
  const {s,practice}=a01();practice.effectiveFrom=effectiveFrom;
  assert.equal(stateSchema.safeParse(s).success,false);
 }
});
