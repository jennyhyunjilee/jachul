import {DEFAULTS,MIN,localDate,targetTime,migrate,steps,calculate,comparison,coach,ReminderGate} from './core.mjs';
import {HomeMonitor} from './location.mjs';
import {LocalProvider} from './provider.mjs';
import {character} from './characters.mjs';
import {nextOccurrence,DAY_LABELS} from './routines.mjs';
import {createCalendar} from './calendar.mjs';
import {initVoice} from './voice.mjs';

const $=id=>document.getElementById(id),esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hh=t=>Number.isFinite(t)?new Date(t).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Seoul'}):'—';
const when=t=>(localDate(t)!==localDate(now())?localDate(t).slice(5).replace('-','/')+' ':'')+hh(t);
let storageOK=true,raw=null;
try{raw=JSON.parse(localStorage.getItem('jansori-v1'));}catch{storageOK=false;}
let real=migrate(raw),demo=null,demoTime=0,route=null,plan=null,offset=5,toastTimer,audio=null,notifyEnabled=false,loading=false,expired=false;
let routineMode=false,routineEdit=null,pendingRoutine=null,pendingVoiceGoal=null,calendarContext=null;
const state=()=>demo||real,now=()=>demo?demoTime:Date.now(),provider=new LocalProvider(),gate=new ReminderGate();
const htmlCache=new Map();
function stableHTML(id,html){if(htmlCache.get(id)===html)return;htmlCache.set(id,html);$(id).innerHTML=html;}
const monitor=new HomeMonitor(navigator.geolocation,()=>renderHome());
function save(){if(demo)return;try{localStorage.setItem('jansori-v1',JSON.stringify(real));storageOK=true;}catch{storageOK=false;}renderStorage();}
function toast(t){$('toast').textContent=t;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4500);}
function notice(t){$('notice').textContent=t;$('notice').hidden=!t;}
function renderStorage(){$('storageStatus').textContent=storageOK?'설정은 이 브라우저에만 저장해.':'저장이 차단됐어. 현재 화면에서는 사용할 수 있지만 새로고침하면 설정이 사라져.';}
function openDialog(id){$(id).showModal();}
function closeDialog(id){$(id).close();}
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>closeDialog(b.dataset.close));
for(const d of document.querySelectorAll('dialog'))d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});

function fillGoal(from=state().from,to=state().to,routine=null){
 routineMode=!!routine;routineEdit=routine;
 const s=routine?{...state(),...routine}:state();for(const k of ['prep','walkTo','walkFrom','buffer'])$(k).value=s[k];
 $('routineFields').hidden=!routineMode;$('dateLabel').hidden=routineMode;document.querySelector('.dates').hidden=routineMode;$('date').required=!routineMode;$('date').disabled=routineMode;
 $('goalTitle').textContent=routineMode?'자주 가는 일정 저장':'어디에, 몇 시까지?';
 $('goalSubmit').textContent=routineMode?'일정 저장 →':'이 목표로 안내 시작 →';
 $('routineName').value=routine?.name||'자주 가는 일정';document.querySelectorAll('[name="routineDay"]').forEach(x=>x.checked=(routine?.days||[1,2,3,4,5]).includes(Number(x.value)));
 $('from').value=from;$('to').value=to;$('date').min=localDate(now());
 $('date').value=s.date||localDate(now());$('arrive').value=s.arrive||'';$('formError').textContent='';
 openDialog('goalDialog');
}
$('newGoal').onclick=()=>fillGoal();$('editGoal').onclick=()=>fillGoal();
document.querySelectorAll('[data-date]').forEach(b=>b.onclick=()=>{$('date').value=localDate(now()+(b.dataset.date==='tomorrow'?24*60*MIN:0));});
$('goalForm').onsubmit=e=>{
 e.preventDefault();if(!provider.g){$('formError').textContent='노선 자료를 먼저 다시 확인해줘.';return;}
 const s={...state()};for(const k of ['from','to','date','arrive'])s[k]=$(k).value.trim();for(const k of ['prep','walkTo','walkFrom','buffer'])s[k]=Number($(k).value);
 if(s.from===s.to){$('formError').textContent='출발역과 도착역을 다르게 골라줘.';return;}
 if(!provider.g.names.has(s.from)||!provider.g.names.has(s.to)){$('formError').textContent='목록에 있는 역 이름을 골라줘. 서울역은 ‘서울역’으로 찾아봐.';return;}
 const nextRoute=provider.getRoute(s.from,s.to);if(!nextRoute){$('formError').textContent='로컬 노선 자료에서 연결 경로를 찾지 못했어. 다른 역을 골라줘.';return;}
 if(routineMode){
  if(demo){$('formError').textContent='데모에서는 실제 일정을 저장하지 않아.';return;}
  const days=[...document.querySelectorAll('[name="routineDay"]:checked')].map(x=>Number(x.value));if(!days.length){$('formError').textContent='반복 요일을 하나 이상 골라줘.';return;}
  if(!routineEdit?.id&&real.routines.length>=12){$('formError').textContent='일정은 12개까지 저장할 수 있어. 기존 일정을 편집하거나 삭제해줘.';return;}
  const r={id:routineEdit?.id||crypto.randomUUID(),name:$('routineName').value.trim()||'자주 가는 일정',days,...Object.fromEntries(['from','to','arrive','prep','walkTo','walkFrom','buffer'].map(k=>[k,s[k]]))};
  const i=real.routines.findIndex(x=>x.id===r.id);if(i>=0)real.routines[i]=r;else real.routines.push(r);save();closeDialog('goalDialog');renderRoutines();toast('일정을 저장했어. 다음부터 한 번 눌러 시작해.');return;
 }
 if(!Number.isFinite(targetTime(s))||targetTime(s)<=now()){$('formError').textContent='이미 지난 목표야. 도착 날짜와 시각을 직접 다시 골라줘.';return;}
 closeDialog('goalDialog');beginGoal(s);
};

function focusCurrentGoal(){$('trip').setAttribute('tabindex','-1');$('trip').focus({preventScroll:true});$('trip').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});}
function beginGoal(input,{routineId=null,summary=''}={}){
 const nextRoute=provider.getRoute(input.from,input.to);if(!nextRoute||targetTime(input)<=now()){toast('역과 도착 날짜·시각을 다시 확인해줘.');return;}
 const s={...state(),...Object.fromEntries(['from','to','date','arrive','prep','walkTo','walkFrom','buffer'].map(k=>[k,input[k]??state()[k]])),routineId,goal:true,stopped:false,step:0,stepAt:now(),missedUntil:0};
 s.recent=[{from:s.from,to:s.to},...s.recent.filter(x=>x.from!==s.from||x.to!==s.to)].slice(0,8);
 if(demo)demo=s;else real=s;route=nextRoute;monitor.manual=null;gate.key='';expired=false;save();notice(summary);render();focusCurrentGoal();
}

function rebuildRoute(){route=provider.getRoute(state().from,state().to);}
function render(){
 const s=state();if(!route&&s.from&&s.to)rebuildRoute();
 const active=!!(s.goal&&route&&Number.isFinite(targetTime(s)));$('welcome').hidden=active;$('trip').hidden=!active;$('favorite').hidden=!active;
 const ongoing=active&&steps(route)[Math.min(s.step,steps(route).length-1)]?.kind!=='arrived';
 const routinesPanel=$('routinesPanel');
 if(ongoing){if(routinesPanel.previousElementSibling!==$('trip'))$('trip').after(routinesPanel);}
 else if(routinesPanel.nextElementSibling!==$('welcome'))$('welcome').before(routinesPanel);
 $('demoBar').hidden=!demo;if(demo)$('demoClock').textContent=hh(demoTime);
 renderSaved();renderRoutines();renderStorage();renderSource();renderHome();
 if(!active){plan=null;return;}
 const list=steps(route);s.step=Math.min(s.step,list.length-1);plan=calculate(route,s,now());
 $('destination').textContent=s.to;$('targetText').textContent=`${s.date.replaceAll('-','.')} ${s.arrive} · ${s.from} 출발 · 마지막 도보 ${s.walkFrom}분 포함`;
 $('status').textContent=plan.status;$('status').className='badge'+(plan.lateness||plan.serviceGap?' urgent':'');
 $('stageLabel').textContent=plan.stage.label;
 $('coachText').textContent=coach(plan,s,now(),!demo&&monitor.isHome());
 $('stageHint').textContent='단계는 네가 알려줘. 시간이 지나도 자동으로 넘기지 않아.';
 const level=plan.serviceGap?5:plan.lateness?3:plan.status==='출발 임박'||plan.status==='지금 출발'?2:0;
 const faceKey=(route[plan.stage.leg||0]?.meta.c||'#00a84d')+':'+level;
 if(htmlCache.get('faceKey')!==faceKey){htmlCache.set('faceKey',faceKey);$('character').innerHTML=character(route[plan.stage.leg||0]?.meta.c||'#00a84d',level);}
 const moving=['walking','riding','transfer','final','arrived'].includes(plan.stage.kind);
 $('arrivalLabel').textContent=['ready','preparing'].includes(plan.stage.kind)?'지금부터 준비하면 도착':'예상 최종 도착';
 $('prepareTime').textContent=when(plan.prepare);$('leaveTime').textContent=when(plan.leave);
 $('saveRoutine').disabled=!!demo;$('openCalendar').disabled=!!demo||plan.stage.kind==='arrived';
 $('countLabel').textContent=moving?(plan.stage.kind==='arrived'?'도착 기록':'남은 예상 이동'):'출발까지';
 const mins=moving?(plan.arrival-now())/MIN:(plan.leave-now())/MIN;
 $('countdown').textContent=plan.stage.kind==='arrived'?hh(s.stepAt):`${Math.abs(Math.ceil(mins))}분${!moving&&mins<0?' 지남':''}`;
 $('arrival').textContent=when(plan.arrival);$('advance').textContent=plan.stage.action+' →';
 $('stopTrip').hidden=plan.stage.kind==='arrived';$('missed').hidden=['final','arrived'].includes(plan.stage.kind);
 $('copyArea').hidden=!plan.lateness||plan.stage.kind==='arrived';
 renderRoute();renderComparison();renderHome();
}
function renderRoute(){
 const s=state();$('routeSummary').textContent=`${route.reduce((n,l)=>n+l.stops,0)}개 역 · 환승 ${route.length-1}회`;
 stableHTML('routePreview',`<p class="route-overview">${esc(s.from)} <span aria-hidden="true">→</span> ${esc(s.to)}</p><p class="route-stations">${route.map(l=>`<span class="line-badge" style="--route-color:${esc(l.meta.c)}">${esc(l.meta.name)}</span>`).join(' ')} + 마지막 도보 ${s.walkFrom}분</p>`);
 stableHTML('routeContent',route.map((l,i)=>`<div class="route-leg" style="--route-color:${esc(l.meta.c)}"><strong>${i?'환승 · ':''}${esc(l.from)} → ${esc(l.to)}</strong><p><span class="line-badge">${esc(l.meta.name)}</span>${esc(l.toward)} 방면 · ${l.stops}개 역 · 약 ${Math.ceil(l.ride)}분</p>${i?'<p>환승 도보 4분 + 열차 대기 포함</p>':''}</div>`).join(''));
 const rows=plan.items.map(x=>`<p>${esc(x.type)}${x.leg!==undefined?' · '+esc(route[x.leg].meta.name):''} <strong>${Math.ceil((x.end-x.start)/MIN)}분</strong>${x.type==='열차 대기'?` · 예상 승차 ${when(x.end)}`:''}</p>`).join('');
 stableHTML('calculation',`<p>준비 시작 <strong>${when(plan.prepare)}</strong></p><p>늦어도 출발 <strong>${when(plan.leave)}</strong></p><p>도착 여유 ${s.buffer}분을 확보하는 마지막 출발 추정이야.</p><hr><p><strong>지금 단계부터 남은 계산</strong></p>${rows}<p>최종 도착 ${when(plan.arrival)}</p>`);
}
function renderComparison(){
 if(!route||!plan)return;const s=state(),c=comparison(route,s,now(),offset),done=plan.stage.kind==='arrived';
 $('dialValue').textContent=offset;$('delay').value=offset;$('dial').setAttribute('aria-valuenow',offset);$('dial').setAttribute('aria-valuetext',`${offset}분 뒤 출발`);$('dial').style.background=`conic-gradient(var(--violet) ${offset*6}deg,#efeee7 0)`;
 $('compareMinutes').textContent=offset;$('compareNow').textContent=when(c.now);$('compareLater').textContent=when(c.later);
 const diff=Math.ceil((c.later-c.now)/MIN);$('compareResult').textContent=done?'이미 도착했어. 다음 목표에서 비교해봐.':`도착 ${diff}분 차이${c.later>plan.target?' · 지각 예상':' · 목표 안에 도착 예상'}`;
}
function setOffset(v){offset=Math.round(Math.max(0,Math.min(60,Number(v)||0)));renderComparison();}
$('delay').oninput=e=>setOffset(e.target.value);$('minus').onclick=()=>setOffset(offset-1);$('plus').onclick=()=>setOffset(offset+1);$('fiveMore').onclick=()=>{setOffset(5);toast('지금과 5분 뒤 출발을 비교했어. 목표는 그대로야.');};
function point(e){const r=$('dial').getBoundingClientRect();let a=Math.atan2(e.clientX-r.left-r.width/2,-(e.clientY-r.top-r.height/2));if(a<0)a+=Math.PI*2;setOffset(a/(Math.PI*2)*60);}
$('dial').onpointerdown=e=>{e.preventDefault();$('dial').setPointerCapture(e.pointerId);point(e);};$('dial').onpointermove=e=>{if($('dial').hasPointerCapture(e.pointerId))point(e);};$('dial').onkeydown=e=>{if(['ArrowLeft','ArrowDown','ArrowRight','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();setOffset(e.key==='Home'?0:e.key==='End'?60:offset+(['ArrowRight','ArrowUp'].includes(e.key)?1:-1));}};

function changeStep(index){
 const s=state(),list=steps(route);s.step=Math.max(0,Math.min(index,list.length-1));s.stepAt=now();s.missedUntil=0;
 if(!demo){if(s.step>=2)monitor.setManual(false);else monitor.manual=null;if(list[s.step].kind==='arrived'){monitor.stop();s.homeEnabled=false;}}
 save();render();
}
$('advance').onclick=()=>{if(!plan)return;if(plan.stage.kind==='arrived'){fillGoal();return;}changeStep(state().step+1);};
$('correctStep').onclick=()=>{if(!route)return;$('stepChoices').innerHTML=steps(route).map((x,i)=>`<button data-step="${i}" aria-current="${i===state().step}">${i+1}. ${esc(x.label)}</button>`).join('');openDialog('stepDialog');};
$('stepChoices').onclick=e=>{const b=e.target.closest('[data-step]');if(b){changeStep(Number(b.dataset.step));closeDialog('stepDialog');}};
$('stopTrip').onclick=()=>{state().goal=false;state().stopped=true;if(!demo){real.homeEnabled=false;monitor.stop();}save();notice('안내를 중지했어. 마지막 설정은 목표 입력에서 다시 쓸 수 있어.');render();};
$('missed').onclick=()=>{
 if(!plan)return;const s=state(),list=steps(route);let i=s.step;
 if(plan.stage.kind==='riding')i--;if(i<2)i=2;const stage=list[i];
 const base=provider.estimateJourney(route,s,now(),{step:i,stepAt:now()-((stage.kind==='walking'?s.walkTo:4)*MIN),missedUntil:s.missedUntil});
 const wait=base.items.find(x=>x.type==='열차 대기');if(!wait)return;
 s.step=i;s.stepAt=now()-((stage.kind==='walking'?s.walkTo:4)*MIN);s.missedUntil=wait.end+1000;
 if(!demo)monitor.setManual(false);save();render();toast('놓친 열차를 제외하고 다음 열차로 다시 계산했어.');
};
$('copyLate').onclick=async()=>{const text=`미안해, ${state().to} 이후 목적지에 ${when(plan.arrival)}쯤 도착할 것 같아. 약 ${plan.lateness}분 늦을 것 같아. 도착하면 바로 알려줄게.`;try{await navigator.clipboard.writeText(text);toast('알릴 문구를 복사했어.');}catch{$('lateMessage').value=text;openDialog('copyDialog');$('lateMessage').select();}};

function renderSaved(){
 const s=state();let out='';for(const [key,title]of [['favorites','즐겨찾기'],['recent','최근 경로']])if(s[key].length){out+=`<p class="saved-label">${title}</p>`+s[key].map((r,i)=>`<div class="saved-row"><button class="saved-route" data-saved="${key}" data-index="${i}">${key==='favorites'?'★':'↗'} ${esc(r.from)} → ${esc(r.to)}</button>${key==='favorites'?`<button class="small" data-delete-fav="${i}" aria-label="${esc(r.to)} 즐겨찾기 삭제">삭제</button>`:''}</div>`).join('');}
 stableHTML('savedRoutes',out||'<p>아직 저장한 길이 없어. 목표를 정하면 최근 경로가 여기에 생겨.</p>');
}
$('favorite').onclick=()=>{const s=state();if(s.favorites.some(x=>x.from===s.from&&x.to===s.to)){toast('이미 즐겨찾기에 있어.');return;}s.favorites.push({from:s.from,to:s.to});s.favorites=s.favorites.slice(-12);save();renderSaved();toast('자주 가는 길에 저장했어.');};
$('savedRoutes').onclick=e=>{const del=e.target.closest('[data-delete-fav]');if(del){state().favorites.splice(Number(del.dataset.deleteFav),1);save();renderSaved();return;}const b=e.target.closest('[data-saved]');if(b){const r=state()[b.dataset.saved][Number(b.dataset.index)];fillGoal(r.from,r.to);}};

function renderRoutines(){
 const routines=demo?[]:real.routines;$('routinesPanel').hidden=!routines.length;
 stableHTML('routineCards',routines.map(r=>{const next=nextOccurrence(r,Date.now());return `<article class="routine-card"><div><h3>${esc(r.name)}</h3><p>${esc(r.from)} → ${esc(r.to)} · ${r.days.map(d=>DAY_LABELS[d]).join('·')} ${esc(r.arrive)}</p><p>다음 일정 <strong>${next?`${next.date} ${r.arrive}`:'다음 날짜를 확인해줘'}</strong></p></div><button class="routine-start" data-routine-start="${esc(r.id)}">오늘도 ${esc(r.name)} →</button><div class="chips"><button data-routine-edit="${esc(r.id)}">편집</button><button data-routine-calendar="${esc(r.id)}">캘린더 알람</button><button data-routine-delete="${esc(r.id)}">삭제</button></div></article>`;}).join(''));
}
function activateRoutine(r){
 const next=nextOccurrence(r,Date.now());if(!next){toast('일정의 요일과 시각을 다시 확인해줘.');return;}
 const nextRoute=provider.getRoute(r.from,r.to);if(!nextRoute){toast('이 일정의 연결 경로를 찾지 못했어. 일정을 편집해줘.');return;}
 beginGoal({...r,date:next.date},{routineId:r.id,summary:'저장한 일정으로 시작했어. '+next.date+' '+r.arrive+'까지 가자.'});
}
$('saveRoutine').onclick=()=>{if(demo)return;fillGoal(state().from,state().to,{});};
$('routineCards').onclick=e=>{
 const b=e.target.closest('button');if(!b||demo)return;
 const id=b.dataset.routineStart||b.dataset.routineEdit||b.dataset.routineDelete||b.dataset.routineCalendar,r=real.routines.find(x=>x.id===id);if(!r)return;
 if(b.dataset.routineDelete){real.routines=real.routines.filter(x=>x.id!==id);save();renderRoutines();toast('일정을 삭제했어. 이미 가져온 캘린더 일정은 캘린더에서 따로 지워줘.');}
 else if(b.dataset.routineEdit)fillGoal(r.from,r.to,r);
 else if(b.dataset.routineCalendar)openCalendar(r);
 else if(real.goal&&plan?.stage.kind!=='arrived'){pendingVoiceGoal=null;pendingRoutine=r;openDialog('replaceDialog');}
 else activateRoutine(r);
};
$('confirmReplace').onclick=()=>{closeDialog('replaceDialog');if(pendingVoiceGoal)beginGoal(pendingVoiceGoal.goal,{summary:pendingVoiceGoal.summary});else if(pendingRoutine)activateRoutine(pendingRoutine);pendingRoutine=null;pendingVoiceGoal=null;};
initVoice({getState:()=>real,provider,isDemo:()=>!!demo,toast,startGoal:(goal,summary)=>{if(real.goal&&plan?.stage.kind!=='arrived'){pendingRoutine=null;pendingVoiceGoal={goal,summary};openDialog('replaceDialog');}else beginGoal(goal,{summary});}});
function calendarPayload(){if(!calendarContext)return null;const repeat=!!calendarContext.routine&&document.querySelector('[name="exportRepeat"]:checked')?.value==='weekly';return createCalendar({...calendarContext,repeat,now:Date.now()});}
function calendarPreview(){try{const x=calendarPayload();$('calendarPreview').textContent=`준비 ${when(calendarContext.plan.prepare)} · 출발 ${when(calendarContext.plan.leave)} · 알람 ${x.alarmCount}개`+(x.omitted.length?` · 이미 지난 ${x.omitted.join('·')} 알람은 제외했어.`:'')+(x.pastForFirst.length?` · 이번 ${x.pastForFirst.join('·')} 알람은 이미 지나 울리지 않아. 다음 주부터는 두 알람을 유지해.`:'');}catch(e){$('calendarPreview').textContent=e.message;}}
function openCalendar(routine=null){
 if(demo){toast('데모에서는 실제 캘린더 일정을 만들지 않아.');return;}
 let goal=real,p=plan;
 if(routine){const next=nextOccurrence(routine,Date.now());if(!next){toast('일정의 다음 날짜를 확인해줘.');return;}goal={...real,...routine,date:next.date,step:0,stepAt:Date.now()};const r=provider.getRoute(goal.from,goal.to);if(!r){toast('일정 경로를 찾지 못했어.');return;}p=calculate(r,goal,Date.now());}
 else routine=real.routines.find(x=>x.id===real.routineId)||null;
 calendarContext={goal,plan:p,routine};$('repeatOptions').hidden=!routine;document.querySelector('[name="exportRepeat"][value="weekly"]').checked=true;
 $('calendarGoal').textContent=`${routine?.name||goal.to+' 도착 목표'} · ${goal.date} ${goal.arrive} (한국 시각)`;$('calendarResult').textContent='';calendarPreview();openDialog('calendarDialog');
}
$('openCalendar').onclick=()=>openCalendar();
document.querySelectorAll('[name="exportRepeat"]').forEach(x=>x.onchange=calendarPreview);
$('downloadCalendar').onclick=()=>{
 if(demo)return;try{const x=calendarPayload();const blob=new Blob([x.text],{type:'text/calendar;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=x.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
 $('calendarResult').textContent=`파일을 만들었어. 캘린더에서 가져오기를 선택하고 알람 ${x.alarmCount}개를 확인해줘.`+(x.omitted.length?` 이미 지난 ${x.omitted.join('·')} 알람은 제외했어.`:'')+(x.pastForFirst.length?` 이번 ${x.pastForFirst.join('·')} 시각은 이미 지났어. 이후 반복 일정에는 두 알람이 유지돼.`:'');
 }catch(e){$('calendarResult').textContent=e.message;}
};

function settings(){const s=state();$('tone').value=s.tone;$('sound').textContent=s.sound?'소리 끄기':'소리 켜기';$('sound').setAttribute('aria-pressed',!!s.sound);$('notificationStatus').textContent=notifyEnabled?'이 페이지의 브라우저 알림을 켰어.':'버튼을 누른 뒤 허용해야 켜져. 화면이 닫히면 알림은 멈춰.';renderHome();renderStorage();openDialog('settingsDialog');}
$('settings').onclick=settings;$('homeSettings').onclick=settings;
$('tone').onchange=e=>{state().tone=e.target.value;save();render();};
function beep(){if(!state().sound||!audio)return;try{const o=audio.createOscillator(),v=audio.createGain();o.connect(v);v.connect(audio.destination);o.frequency.value=660;v.gain.value=.05;o.start();o.stop(audio.currentTime+.15);}catch{}}
$('sound').onclick=async()=>{const s=state();s.sound=!s.sound;if(s.sound){try{audio||=new(window.AudioContext||window.webkitAudioContext)();await audio.resume();beep();}catch{s.sound=false;toast('이 브라우저에서는 소리를 켜지 못했어.');}}save();$('sound').textContent=s.sound?'소리 끄기':'소리 켜기';$('sound').setAttribute('aria-pressed',s.sound);};
$('notification').onclick=async()=>{if(demo){toast('예시 체험에서는 실제 알림 권한을 요청하지 않아.');return;}if(!('Notification'in window)){toast('이 브라우저는 알림을 지원하지 않아.');return;}if(notifyEnabled){notifyEnabled=false;$('notificationStatus').textContent='이 페이지의 브라우저 알림을 껐어.';return;}try{notifyEnabled=await Notification.requestPermission()==='granted';$('notificationStatus').textContent=notifyEnabled?'허용됐어. 이 페이지가 열려 있는 동안 알려줄게.':'허용되지 않았어. 화면 안내는 계속 사용할 수 있어.';}catch{toast('알림을 켜지 못했어. 화면 안내를 확인해줘.');}};
function renderHome(){
 const s=state(),manual=monitor.manual===true?'수동 확인: 아직 집이야':monitor.manual===false?'수동 확인: 집 밖이야':'';
 const status=demo?'예시 체험 · 실제 GPS 꺼짐':manual||monitor.status;
 $('homeStatus').textContent=status;$('gpsDetail').textContent=(real.home?'집 등록됨 · 좌표는 이 브라우저에만 저장':'등록한 집 없음')+' · '+status;
 $('toggleHome').textContent=monitor.active?'집에 있으면 재촉 끄기':'집에 있으면 재촉 켜기';$('toggleHome').setAttribute('aria-pressed',monitor.active);
 $('registerHome').disabled=loading;
}
$('registerHome').onclick=()=>{
 if(demo){toast('데모를 종료하면 실제 집을 등록할 수 있어.');return;}
 if(!window.isSecureContext||!navigator.geolocation){toast('위치를 사용할 수 없어. HTTPS 또는 localhost에서 열고 수동 상태를 사용해줘.');return;}
 loading=true;renderHome();navigator.geolocation.getCurrentPosition(p=>{loading=false;
  if(p.coords.accuracy>150||Date.now()-p.timestamp>120000){toast('위치가 불확실해서 집을 등록하지 않았어. 다시 시도해줘.');renderHome();return;}
  real.home={lat:p.coords.latitude,lon:p.coords.longitude};save();if(monitor.active)monitor.start(real.home);renderHome();toast('여기를 집으로 등록했어. 자동 재촉은 별도로 켜줘.');
 },()=>{loading=false;renderHome();toast('위치 권한이 거절됐거나 확인하지 못했어. 수동 집 상태를 써줘.');},{enableHighAccuracy:true,maximumAge:0,timeout:15000});
};
$('toggleHome').onclick=()=>{if(demo){toast('데모에서는 GPS를 켜지 않아.');return;}if(monitor.active){monitor.stop();real.homeEnabled=false;save();return;}if(!real.home){toast('여기를 집으로 먼저 등록해줘.');return;}if(!window.isSecureContext){toast('HTTPS 또는 localhost에서 위치를 켜줘.');return;}if(plan?.stage.kind==='arrived'||real.stopped){toast('다음 목표를 시작한 뒤 켜줘.');return;}real.homeEnabled=true;monitor.start(real.home);save();renderHome();};
$('deleteHome').onclick=()=>{if(demo){toast('실제 집 설정은 데모에서 변경하지 않아.');return;}monitor.stop();monitor.manual=null;real.home=null;real.homeEnabled=false;save();renderHome();toast('집 좌표를 삭제했어.');};
$('manualHome').onclick=()=>{if(!demo){monitor.setManual(true);render();}else toast('예시 체험에서는 실제 집 상태를 바꾸지 않아.');};
$('manualOut').onclick=()=>{if(!demo){monitor.setManual(false);render();}};
async function resumeLocation(){
 if(demo||document.hidden||!real.homeEnabled||!real.home||!real.goal||real.stopped||plan?.stage.kind==='arrived')return;
 try{const p=await navigator.permissions?.query({name:'geolocation'});if(p?.state==='granted'&&!demo&&!document.hidden&&real.homeEnabled&&real.goal&&!real.stopped&&plan?.stage.kind!=='arrived'){const manual=monitor.manual;monitor.start(real.home);monitor.manual=manual;monitor.emit();}else{monitor.status='집 재촉 설정 유지 · 켜기 버튼을 눌러줘';renderHome();}}
 catch{monitor.status='집 재촉 설정 유지 · 켜기 버튼을 눌러줘';renderHome();}
}
document.addEventListener('visibilitychange',()=>{if(document.hidden){monitor.stop();}else{render();resumeLocation();}});
window.addEventListener('pagehide',()=>monitor.stop());

function demoCase(kind){
 demo=migrate({...DEFAULTS,from:'홍대입구',to:'이대',date:localDate(),arrive:'12:00',goal:true});demoTime=new Date(`${demo.date}T10:00:00+09:00`).getTime();route=provider.getRoute(demo.from,demo.to);if(!route){toast('노선 자료를 먼저 확인해줘.');demo=null;return;}
 let p=calculate(route,demo,demoTime);if(kind==='soon')demoTime=p.leave-3*MIN;if(kind==='late')demoTime=p.target-4*MIN;if(kind==='closed'){demoTime=new Date(`${demo.date}T02:30:00+09:00`).getTime();demo.arrive='03:00';}if(kind==='missed'){demoTime=p.leave;demo.step=2;demo.stepAt=demoTime-demo.walkTo*MIN;const q=calculate(route,demo,demoTime);demo.missedUntil=q.items.find(x=>x.type==='열차 대기').end+1000;}
 demo.stepAt||=demoTime;monitor.stop();notice('예시 체험 중이야. 실제 목표와 저장한 설정은 바뀌지 않아.');render();
}
$('tryDemo').onclick=()=>demoCase('safe');$('demoCases').onclick=e=>{const b=e.target.closest('[data-case]');if(b)demoCase(b.dataset.case);};
$('exitDemo').onclick=()=>{demo=null;route=null;notice(expired?'저장된 목표가 만료됐어. 날짜와 시각을 다시 골라줘.':'예시 체험을 종료했어. 실제 설정으로 돌아왔어.');render();resumeLocation();};

function renderSource(){const p=provider.status;$('sourceStatus').textContent=p.error?`${p.error} · ${p.lastSuccess?'이전 자료로 계산 중':'다시 확인해줘'}`:`로컬 노선 마지막 확인 ${p.lastSuccess?hh(p.lastSuccess):'없음'} · ${p.stale?'오래된 자료 · 재확인 필요':'60분마다 로컬 자료 재확인'} · 공식 시간표 미연결`;$('retrySource').disabled=loading;}
async function refresh(){loading=true;renderSource();const ok=await provider.refresh();loading=false;if(ok){$('stations').innerHTML=[...provider.g.names.keys()].sort((a,b)=>a.localeCompare(b,'ko')).map(n=>`<option value="${esc(n)}"></option>`).join('');rebuildRoute();}render();return ok;}
$('retrySource').onclick=async()=>{await refresh();toast(provider.error||'로컬 노선 자료를 확인했어. 공식 시간표는 미연결이야.');};

function reminders(){
 if(!plan||demo||document.hidden||plan.stage.kind==='arrived')return;
 const s=state(),t=now(),pre=['ready','preparing'].includes(plan.stage.kind);let key='';
 if(plan.lateness)key='late:'+s.step;else if(pre&&t>=plan.leave)key='leave:'+s.step;else if(pre&&t>=plan.leave-5*MIN)key='soon:'+s.step;else if(plan.stage.kind==='ready'&&t>=plan.prepare)key='prepare';
 const urgent=!!(plan.lateness||pre&&t>=plan.leave);
 if(gate.take(key,t,urgent)){
  const text=coach(plan,s,t,monitor.isHome());toast(text);beep();if(notifyEnabled&&'Notification'in window&&Notification.permission==='granted')try{new Notification('쟈철 · '+plan.status,{body:text,tag:'jac-reminder'});}catch{}
 }
}
async function init(){
 $('welcomeCharacter').innerHTML=character('#7e55c7',0);
 const success=await refresh();
 if(real.goal){if(!Number.isFinite(targetTime(real))||targetTime(real)<=Date.now()&&steps(route||[])[real.step]?.kind!=='arrived'){
  real.goal=false;expired=true;save();notice('저장된 목표가 만료됐거나 날짜가 잘못됐어. 역과 준비 시간은 보존했으니 날짜와 시각을 직접 다시 골라줘.');
 }else if(!route){real.goal=false;save();notice('저장된 경로를 찾지 못했어. 역을 다시 골라줘.');}}
 if(raw&&raw.version!==2&&!real.date)notice('기존 역과 설정은 보존했어. 도착 날짜와 시각을 다시 정해줘.');
 if(real.step>=2)monitor.setManual(false);save();render();await resumeLocation();
 if(expired&&success)fillGoal();
 setInterval(()=>{if(demo)demoTime+=1000;monitor.tick();if(provider.due&&!loading)refresh();if(!document.querySelector('dialog[open]')){if(plan){const s=state();plan=calculate(route,s,now());$('coachText').textContent=coach(plan,s,now(),!demo&&monitor.isHome());}render();}reminders();},1000);
}
init();
