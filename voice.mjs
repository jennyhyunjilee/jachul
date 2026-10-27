import {DEFAULTS,localDate,targetTime} from './core.mjs';
export function mergeIntent(previous={},next={},defaults={},invalid=[]){
 const merged={...previous};for(const k of ['from','to','date','arrive','prep'])if(next[k]!==null&&next[k]!==undefined)merged[k]=next[k];
 if(typeof next.time_ambiguous==='boolean')merged.time_ambiguous=next.time_ambiguous;
 for(const k of invalid)delete merged[k];
 if(!merged.from&&defaults.from&&!invalid.includes('from'))merged.from=defaults.from;
 return merged;
}
export function validateVoiceGoal(intent,defaults,provider,time=Date.now()){
 const goal={...Object.fromEntries(['prep','walkTo','walkFrom','buffer','tone'].map(k=>[k,defaults[k]??DEFAULTS[k]])),...intent};
 const resolve=n=>{if(provider.g?.names.has(n))return n;const a=[...(provider.g?.names.keys()||[])].filter(s=>s.replace(/역$/,'')===String(n).replace(/역$/,''));return a.length===1?a[0]:null;};
 if(!goal.from)return {question:'어느 역에서 출발해?'};
 if(!resolve(goal.from))return {question:'출발역을 찾지 못했어. 역 이름을 다시 알려줘.'};goal.from=resolve(goal.from);
 if(!goal.to)return {question:'어느 역까지 가야 해?'};
 if(!resolve(goal.to))return {question:'도착역을 찾지 못했어. 역 이름을 다시 알려줘.'};goal.to=resolve(goal.to);
 if(goal.from===goal.to)return {question:'출발역과 도착역이 같아. 도착역을 다시 알려줘.'};
 if(!goal.date)return {question:'오늘이야, 내일이야? 도착 날짜를 알려줘.'};
 if(!goal.arrive)return {question:'몇 시까지 도착해야 해?'};
 if(goal.time_ambiguous)return {question:'오전이야, 오후야? 도착 시각을 확인해줘.'};
 if(!Number.isFinite(targetTime(goal)))return {question:'날짜와 시각을 확인해줘. 예: 내일 오전 9시.'};
 if(targetTime(goal)<=time)return {question:'이미 지난 시각이야. 도착 날짜와 시각을 다시 알려줘.'};
 for(const k of ['prep','walkTo','walkFrom','buffer'])if(!Number.isFinite(goal[k])||goal[k]<0||goal[k]>180)return {question:'준비와 도보 시간은 0~180분으로 알려줘.'};
 if(!provider.getRoute(goal.from,goal.to))return {question:'연결된 경로를 찾지 못했어. 다른 출발역이나 도착역을 알려줘.'};
 return {goal};
}
export class IntentSession{
 constructor({fetcher=globalThis.fetch.bind(globalThis),defaults=()=>({}),clock=()=>Date.now()}={}){this.fetcher=fetcher;this.defaults=defaults;this.clock=clock;this.epoch=0;this.partial={};this.history=[];this.controller=null;}
 invalidate(){this.epoch++;this.controller?.abort();this.controller=null;}
 cancel(){this.invalidate();this.partial={};this.history=[];}
 async analyze(text){
  this.controller?.abort();const request=++this.epoch,controller=new AbortController();this.controller=controller;const timeout=setTimeout(()=>controller.abort(),30000);
  try{const r=await this.fetcher('/api/intent',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({transcript:text,date:localDate(this.clock()),defaults:this.defaults(),context:{intent:this.partial,history:this.history}})});
   if(request!==this.epoch)return null;let result;try{result=await r.json();}catch{throw new Error('AI 응답을 읽지 못했어. 직접 목표를 입력하거나 다시 시도해줘.');}
   if(request!==this.epoch)return null;if(!r.ok)throw new Error(result.error?.message||'AI에 연결하지 못했어. 직접 목표를 입력해줘.');
   if(result.source!=='openai'||!result.intent||typeof result.intent!=='object')throw new Error('AI 응답 형식을 확인하지 못했어.');
   this.partial=mergeIntent(this.partial,result.intent,this.defaults(),result.invalid_fields||[]);this.history.push(text);this.history=this.history.slice(-6);return this.partial;
  }catch(e){if(request!==this.epoch)return null;if(e.name==='AbortError')throw new Error('AI 응답이 늦어지고 있어. 다시 시도해줘.');throw e;}
  finally{clearTimeout(timeout);if(request===this.epoch)this.controller=null;}
 }
}
export function initVoice({getState,provider,startGoal,isDemo,toast}){
 const $=id=>document.getElementById(id);const defaults=()=>Object.fromEntries(['from','prep','walkTo','walkFrom','buffer'].map(k=>[k,getState()[k]]));
 const session=new IntentSession({defaults});let recognition=null,recorder=null,stream=null,timer=null,chunks=[],recording=false,generation=0,mediaController=null,configured=false,starting=false;
 const stopTracks=()=>{stream?.getTracks().forEach(t=>t.stop());stream=null;};
 function cleanup(){generation++;starting=false;session.cancel();mediaController?.abort();mediaController=null;try{recognition?.abort();}catch{}recognition=null;clearTimeout(timer);if(recorder&&recorder.state!=='inactive')try{recorder.stop();}catch{}recorder=null;recording=false;chunks=[];stopTracks();$('recordVoice').textContent='말하기 시작';$('recordVoice').disabled=false;$('parseVoice').disabled=false;}
 function close(){cleanup();if($('voiceDialog').open)$('voiceDialog').close();}
 async function open(){if(isDemo()){toast('데모를 종료하면 실제 음성 목표를 설정할 수 있어.');return;}cleanup();$('voiceText').value='';$('voiceQuestion').textContent='예: 내일 오전 9시까지 이대 가야 해. 준비는 30분.';$('voiceSummary').textContent='';$('voiceDialog').showModal();$('voiceApiStatus').textContent='AI 연결 상태 확인 중';const id=generation;
  try{const r=await fetch('/api/ai/status',{cache:'no-store'}),s=await r.json();if(id!==generation)return;configured=!!(r.ok&&s.configured);$('voiceApiStatus').textContent=configured?'OpenAI 문장 분석 준비됨 · 말한 문장으로 요청할 때 처리':'AI 미연결 · 서버 키 설정 대기. 직접 목표 입력은 계속 쓸 수 있어.';}catch{if(id!==generation)return;configured=false;$('voiceApiStatus').textContent='AI 서버에 연결할 수 없어. 직접 목표 입력을 사용해줘.';}
 }
 async function analyze(){
  const text=$('voiceText').value.trim();if(!text){$('voiceQuestion').textContent='목적지와 도착 시각을 말하거나 입력해줘.';return;}
  const id=generation;$('parseVoice').disabled=true;$('voiceQuestion').textContent='말한 내용을 확인 중…';
  try{const intent=await session.analyze(text);if(id!==generation||!intent||!$('voiceDialog').open)return;
   const result=validateVoiceGoal(intent,getState(),provider);
   $('voiceSummary').textContent=[intent.from&&'출발 '+intent.from,intent.to&&'도착 '+intent.to,intent.date,intent.arrive,intent.prep!==undefined?'준비 '+intent.prep+'분':'저장된 준비 시간 사용'].filter(Boolean).join(' · ')+(getState().from?' · 저장한 출발역과 기본 시간을 참고했어.':'');
   if(result.question){$('voiceQuestion').textContent=result.question;$('voiceText').value='';$('voiceText').focus();return;}
   const goal=result.goal,summary=$('voiceSummary').textContent;close();startGoal(goal,summary);
  }catch(e){if(id===generation)$('voiceQuestion').textContent=e.message;}
  finally{if(id===generation)$('parseVoice').disabled=false;}
 }
 async function record(){
  if(recording){if(recorder)recorder.stop();else recognition?.stop();return;}if(starting)return;starting=true;
  const id=generation,Speech=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(Speech){
   try{recognition=new Speech();recognition.lang='ko-KR';recognition.interimResults=false;recognition.continuous=false;
    recognition.onresult=e=>{if(id!==generation)return;const text=Array.from(e.results).map(r=>r[0].transcript).join(' ');$('voiceText').value=text;recording=false;$('recordVoice').textContent='말하기 시작';clearTimeout(timer);analyze();};
    recognition.onerror=e=>{if(id!==generation)return;starting=false;recording=false;$('recordVoice').textContent='말하기 시작';clearTimeout(timer);$('voiceQuestion').textContent=e.error==='not-allowed'?'마이크가 허용되지 않았어. 아래에 문장을 직접 입력해줘.':'말소리를 확인하지 못했어. 다시 말하거나 직접 문장을 입력해줘.';};
    recognition.onend=()=>{if(id!==generation)return;starting=false;recording=false;$('recordVoice').textContent='말하기 시작';};recognition.start();starting=false;recording=true;$('recordVoice').textContent='말하기 마치기';timer=setTimeout(()=>recognition?.stop(),30000);
   }catch{starting=false;recording=false;$('voiceQuestion').textContent='음성 인식을 시작하지 못했어. 문장을 직접 입력해줘.';}
   return;
  }
  if(!configured){starting=false;$('voiceQuestion').textContent='브라우저 음성 인식이 미지원이고 AI 전사는 아직 미연결이야. 직접 문장이나 목표를 입력해줘.';return;}
  if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){starting=false;$('voiceQuestion').textContent='이 브라우저는 녹음을 지원하지 않아. 문장을 직접 입력해줘.';return;}
  try{
   const acquired=await navigator.mediaDevices.getUserMedia({audio:true});if(id!==generation){acquired.getTracks().forEach(t=>t.stop());return;}stream=acquired;
   const type=['audio/webm','audio/mp4','audio/ogg'].find(t=>MediaRecorder.isTypeSupported(t));if(!type){stopTracks();throw new Error('unsupported');}
   recorder=new MediaRecorder(stream,{mimeType:type});chunks=[];let size=0,tooLarge=false;recording=true;starting=false;$('recordVoice').textContent='녹음 마치고 분석';$('voiceQuestion').textContent='녹음 중 · 최대 30초. 마치면 OpenAI로 전송해 전사할게.';
   recorder.ondataavailable=e=>{if(id!==generation)return;size+=e.data.size;if(size>4*1024*1024){tooLarge=true;recorder?.stop();return;}chunks.push(e.data);};
   recorder.onerror=()=>{if(id!==generation)return;cleanup();$('voiceQuestion').textContent='녹음 오류가 발생했어. 직접 문장을 입력해줘.';};
   recorder.onstop=async()=>{clearTimeout(timer);stopTracks();recording=false;starting=false;if(id!==generation)return;$('recordVoice').textContent='말하기 시작';if(tooLarge){chunks=[];$('voiceQuestion').textContent='녹음이 4MB를 넘었어. 더 짧게 말하거나 직접 입력해줘.';return;}const blob=new Blob(chunks,{type});chunks=[];if(!blob.size){$('voiceQuestion').textContent='말소리를 확인하지 못했어. 문장으로 입력해줘.';return;}
    mediaController=new AbortController();const controller=mediaController;const timeout=setTimeout(()=>controller.abort(),30000);$('voiceQuestion').textContent='음성을 문장으로 바꾸는 중…';
    try{const r=await fetch('/api/transcribe',{method:'POST',headers:{'Content-Type':type},body:blob,signal:controller.signal});const data=await r.json();if(id!==generation)return;if(!r.ok)throw new Error(data.error?.message||'음성 전사에 실패했어.');if(typeof data.transcript!=='string'||!data.transcript.trim())throw new Error('말소리를 찾지 못했어.');$('voiceText').value=data.transcript;await analyze();}catch(e){if(id===generation)$('voiceQuestion').textContent=e.name==='AbortError'?'전사가 지연됐어. 다시 말하거나 직접 입력해줘.':e.message;}finally{clearTimeout(timeout);if(id===generation)mediaController=null;}
   };
   recorder.start(1000);timer=setTimeout(()=>{if(recorder?.state==='recording')recorder.stop();},30000);
  }catch{if(id===generation){starting=false;recording=false;stopTracks();$('voiceQuestion').textContent='마이크를 켜지 못했어. 권한을 확인하거나 직접 문장을 입력해줘.';}}
 }
 document.querySelectorAll('[data-open-voice]').forEach(b=>b.onclick=open);
 $('voiceClose').onclick=close;$('voiceCancel').onclick=close;$('voiceDialog').addEventListener('close',cleanup);$('voiceDialog').addEventListener('cancel',cleanup);
 $('voiceManual').onclick=()=>{close();document.getElementById(getState().goal?'editGoal':'newGoal').click();};
 $('voiceForm').onsubmit=e=>{e.preventDefault();analyze();};$('recordVoice').onclick=record;
 $('voiceText').oninput=()=>{if(session.controller){session.invalidate();$('parseVoice').disabled=false;}};
 return {close,session};
}
