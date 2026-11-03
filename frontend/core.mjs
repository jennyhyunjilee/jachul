import {normalizeRoutines,seoulDate} from './routines.mjs';
export const MIN = 60000;
export const DEFAULTS = {version:2,from:'',to:'',date:'',arrive:'',prep:20,walkTo:7,walkFrom:8,buffer:5,tone:'normal',goal:false,step:0,stepAt:0,missedUntil:0,recent:[],favorites:[],routines:[],home:null,homeEnabled:false,sound:false};
export function localDate(t=Date.now()){return Number.isFinite(Number(t))?seoulDate(Number(t)):'';}
export function targetTime(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s.date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.arrive))return NaN;const t=new Date(`${s.date}T${s.arrive}:00+09:00`).getTime();return localDate(t)===s.date?t:NaN;}
export function migrate(raw){
 const r=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
 const s={...DEFAULTS,...r,version:2};
 for(const k of ['prep','walkTo','walkFrom','buffer'])s[k]=Number.isFinite(Number(s[k]))?Math.max(0,Math.min(180,Number(s[k]))):DEFAULTS[k];
 for(const k of ['from','to','date','arrive'])if(typeof s[k]!=='string')s[k]='';
 s.recent=Array.isArray(s.recent)?s.recent.filter(x=>x&&typeof x.from==='string'&&typeof x.to==='string').slice(0,8):[];
 s.favorites=Array.isArray(s.favorites)?s.favorites.filter(x=>x&&typeof x.from==='string'&&typeof x.to==='string').slice(0,12):[];
 s.routines=normalizeRoutines(s.routines);
 if(s.home&&Number.isFinite(s.home.lat)&&!Number.isFinite(s.home.lon)&&Number.isFinite(s.home.lng))s.home={...s.home,lon:s.home.lng};
 s.home=s.home&&Number.isFinite(s.home.lat)&&Number.isFinite(s.home.lon)&&Math.abs(s.home.lat)<=90&&Math.abs(s.home.lon)<=180?s.home:null;
 s.tone=['gentle','normal','firm'].includes(s.tone)?s.tone:'normal';
 s.step=Number.isInteger(s.step)&&s.step>=0?s.step:0;
 s.stepAt=Number.isFinite(s.stepAt)?s.stepAt:0;
 s.missedUntil=Number.isFinite(s.missedUntil)?s.missedUntil:0;
 if(r.version!==2)s.goal=!!(s.date&&s.arrive&&s.from&&s.to);
 return s;
}
export function graph(net){
 const adj=new Map(),names=new Map();
 for(const [id,n]of Object.entries(net.nodes)){adj.set(id,[]);const name=n.d||n.n;if(!names.has(name))names.set(name,[]);names.get(name).push(id);}
 for(const [a,b]of net.edges)if(adj.has(a)&&adj.has(b)){adj.get(a).push(b);adj.get(b).push(a);}
 return {net,adj,names};
}
export function getRoute(g,from,to){
 if(from===to||!g.names.has(from)||!g.names.has(to))return null;
 const {net,adj,names}=g,dist=new Map(),prev=new Map(),done=new Set();
 for(const id of names.get(from))dist.set(id,0);
 while(true){
  let a=null,best=Infinity;for(const [id,d]of dist)if(!done.has(id)&&d<best){a=id;best=d;}
  if(!a)return null;done.add(a);
  const n=net.nodes[a],name=n.d||n.n;
  if(name===to){const path=[];for(let k=a;k;k=prev.get(k))path.unshift(k);const legs=[];
   for(let i=0;i<path.length-1;i++){const x=path[i],y=path[i+1],line=net.nodes[x].l;if(line!==net.nodes[y].l)continue;const last=legs.at(-1);if(last&&last.ids.at(-1)===x)last.ids.push(y);else legs.push({line,ids:[x,y]});}
   return legs.map(l=>({...l,from:net.nodes[l.ids[0]].d||net.nodes[l.ids[0]].n,to:net.nodes[l.ids.at(-1)].d||net.nodes[l.ids.at(-1)].n,toward:net.nodes[l.ids[1]].d||net.nodes[l.ids[1]].n,stops:l.ids.length-1,ride:(l.ids.length-1)*net.lines[l.line].ride,...{meta:net.lines[l.line]}}));
  }
  const relax=(id,w)=>{if(!done.has(id)&&best+w<(dist.get(id)??Infinity)){dist.set(id,best+w);prev.set(id,a);}};
  for(const b of adj.get(a))relax(b,net.lines[n.l].ride);
  for(const b of names.get(name))if(b!==a)relax(b,4+net.lines[net.nodes[b].l].h/2);
 }
}
const windows={'1001':[320,1490],'1002':[330,1500],'1009':[330,1490],'1063':[320,1470],'1065':[320,1440],'1067':[310,1460],'1075':[330,1480],'1093':[330,1440],'1081':[330,1440],'1032':[330,1440]};
function midnight(t){return Date.parse(seoulDate(t)+'T00:00:00+09:00');}
function hash(s){let h=7;for(const c of s)h=(h*31+c.charCodeAt(0))>>>0;return h;}
export function nextTrain(leg,time){
 const [first,last]=windows[leg.line]||[330,1500],headway=leg.meta.h*MIN,phase=hash(leg.ids[0]+leg.toward)%leg.meta.h*MIN;
 const day=midnight(time);let best=Infinity;
 for(let k=-1;k<=2;k++){const d=day+k*24*60*MIN,start=d+first*MIN,end=d+last*MIN;const board=start+phase+Math.max(0,Math.ceil((time-start-phase)/headway))*headway;if(board>=time&&board<=end)best=Math.min(best,board);}
 return best;
}
export function steps(route){const list=[{kind:'ready',label:'시작 전',action:'준비 시작'},{kind:'preparing',label:'준비 중',action:'나왔어'},{kind:'walking',label:'출발역으로',action:'탔어',leg:0}];route.forEach((l,i)=>{if(i)list.push({kind:'transfer',label:`${l.from} 환승 중`,action:'환승했어',leg:i});list.push({kind:'riding',label:`${l.meta.name} 이동 중`,action:i<route.length-1?'환승역에 내렸어':'내렸어',leg:i});});list.push({kind:'final',label:'마지막 도보',action:'도착했어'},{kind:'arrived',label:'도착 완료',action:'새 목표 만들기'});return list;}
export function estimateJourney(route,s,time,{step=0,stepAt=time,missedUntil=0}={}){
 const list=steps(route),stage=list[Math.min(step,list.length-1)],elapsed=Math.max(0,(time-stepAt)/MIN);let cursor=time,items=[];
 const add=(type,minutes,extra={})=>{const start=cursor;cursor+=minutes*MIN;items.push({type,start,end:cursor,...extra});};
 if(stage.kind==='arrived')return {arrival:stepAt,items,stage,serviceGap:false};
 if(stage.kind==='ready')add('준비',s.prep);
 if(stage.kind==='preparing')add('준비',Math.max(0,s.prep-elapsed));
 if(['ready','preparing','walking'].includes(stage.kind))add('출발역 도보',stage.kind==='walking'?Math.max(0,s.walkTo-elapsed):s.walkTo);
 const startLeg=stage.leg??0;
 if(stage.kind!=='final')for(let i=startLeg;i<route.length;i++){
  const l=route[i];
  if(stage.kind==='riding'&&i===startLeg){add('열차 이동',Math.max(0,l.ride-elapsed),{leg:i});continue;}
  if(i>startLeg||stage.kind==='transfer')add('환승 도보',stage.kind==='transfer'&&i===startLeg?Math.max(0,4-elapsed):4,{leg:i});
  const board=nextTrain(l,Math.max(cursor,i===startLeg?missedUntil:0));add('열차 대기',(board-cursor)/MIN,{leg:i,board});add('열차 이동',l.ride,{leg:i});
 }
 add('마지막 도보',stage.kind==='final'?Math.max(0,s.walkFrom-elapsed):s.walkFrom);
 return {arrival:cursor,items,stage,serviceGap:items.some(x=>x.type==='열차 대기'&&x.end-x.start>60*MIN)};
}
export function calculate(route,s,time){
 const target=targetTime(s);if(!route?.length||!Number.isFinite(target))return null;
 let lo=target-48*60*MIN,hi=target;const departureState={...s,prep:0};
 for(let i=0;i<40;i++){const mid=(lo+hi)/2;if(estimateJourney(route,departureState,mid).arrival<=target-s.buffer*MIN)lo=mid;else hi=mid;}
 const leave=Math.floor(lo/1000)*1000,prepare=leave-s.prep*MIN;
 const current=estimateJourney(route,s,time,{step:s.step,stepAt:s.stepAt,missedUntil:s.missedUntil});
 const lateness=Math.max(0,Math.ceil((current.arrival-target)/MIN));
 const moving={walking:'이동 중',riding:'이동 중',transfer:'환승 중',final:'마지막 도보'}[current.stage.kind];
 const status=current.stage.kind==='arrived'?'도착 완료':current.serviceGap?'운행 종료 추정':moving?(moving+(lateness?' · 지각 예상':'')):lateness?'지각 예상':time>=leave?'지금 출발':leave-time<=5*MIN?'출발 임박':'여유';
 return {...current,target,leave,prepare,lateness,status};
}
export function comparison(route,s,time,delay=5){const pre=s.step<2;const opts={step:pre?2:s.step,stepAt:pre?time:s.stepAt,missedUntil:s.missedUntil};return {now:estimateJourney(route,s,time,opts).arrival,later:estimateJourney(route,s,time+delay*MIN,{...opts,stepAt:opts.stepAt+delay*MIN}).arrival};}
export function coach(p,s,time,atHome=false){
 if(p.stage.kind==='arrived')return '도착했네! 오늘도 잘 왔어.';
 if(p.serviceGap)return '운행 종료 시간대로 추정돼. 첫차까지 오래 걸려. 다른 이동 방법을 확인해.';
 let text=p.stage.kind==='ready'?(time>=p.prepare?'지금 준비 시작해.':'아직 여유 있어. 준비할 시간에 알려줄게.'):p.stage.kind==='preparing'?'챙길 것 챙기고 신발 신어.':p.stage.kind==='walking'?'역으로 가. 열차에 타면 알려줘.':p.stage.kind==='transfer'?'환승 표지 따라가. 갈아타면 알려줘.':p.stage.kind==='riding'?'이동 중이야. 내릴 역 놓치지 마.':'마지막 도보야. 목적지에 닿으면 알려줘.';
 if(time>=p.leave&&['ready','preparing'].includes(p.stage.kind))text='지금 나가. 출발할 시간이야.';
 if(atHome&&['ready','preparing'].includes(p.stage.kind)&&time>=p.prepare)text=time>=p.leave-5*MIN?'아직 집 근처야. 지금 나가.':'아직 집 근처야. 지금 준비해.';
 if(p.lateness)text=`${p.lateness}분 늦을 것 같아. `+text;
 if(s.tone==='gentle')text=text.replaceAll('지금 나가.','이제 나가자.').replaceAll('시작해.','시작하자.');
 if(s.tone==='firm'&&time>=p.leave&&['ready','preparing'].includes(p.stage.kind))text+=' 더 미루면 도착이 늦어져.';
 return text;
}
export class ReminderGate{constructor(){this.last=-Infinity;this.key='';}take(key,time,urgent=false){if(!key){this.key='';return false;}if(key!==this.key||urgent&&time-this.last>=5*MIN){this.last=time;this.key=key;return true;}return false;}}
