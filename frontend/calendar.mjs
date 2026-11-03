import {DAY_CODES} from './routines.mjs';
const encoder=new TextEncoder();
export function escapeText(s){return String(s).replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g,'');}
export function foldLine(line){let out='',current='',bytes=0;for(const char of line){const n=encoder.encode(char).length;if(bytes+n>75){out+=current+'\r\n';current=' ';bytes=1;}current+=char;bytes+=n;}return out+current;}
const utc=t=>new Date(t).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
const seoul=t=>new Date(t+9*3600000).toISOString().replace(/[-:]/g,'').slice(0,15);
export function createCalendar({goal,plan,routine=null,repeat=!!routine,now=Date.now(),uid=null}){
 if(!plan||!Number.isFinite(plan.target)||plan.target<=now)throw new Error('앞으로 도착할 목표를 먼저 정해줘.');
 if(repeat&&(!routine?.days?.length))throw new Error('반복 요일을 먼저 정해줘.');
 const id=uid||`${globalThis.crypto?.randomUUID?.()||`${now}-${Math.random().toString(36).slice(2)}`}@jac.local`;
 const omitted=[],pastForFirst=[],alarms=[];
 for(const [label,at]of [['준비 시작',plan.prepare],['지금 출발',plan.leave]]){
  if(at<=now){if(repeat)pastForFirst.push(label);else{omitted.push(label);continue;}}
  const seconds=Math.max(0,Math.round((plan.target-at)/1000));
  alarms.push('BEGIN:VALARM','ACTION:DISPLAY',`DESCRIPTION:${escapeText('쟈철 · '+label+' · '+(routine?.name||goal.to))}`,`TRIGGER;RELATED=START:-PT${seconds}S`,'END:VALARM');
 }
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//JAC//Departure Coach//KO','CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VTIMEZONE','TZID:Asia/Seoul','BEGIN:STANDARD','DTSTART:19700101T000000','TZOFFSETFROM:+0900','TZOFFSETTO:+0900','TZNAME:KST','END:STANDARD','END:VTIMEZONE','BEGIN:VEVENT',`UID:${escapeText(id)}`,`DTSTAMP:${utc(now)}`,`DTSTART;TZID=Asia/Seoul:${seoul(plan.target)}`,`DTEND;TZID=Asia/Seoul:${seoul(plan.target+60000)}`,`SUMMARY:${escapeText('쟈철 · '+(routine?.name||`${goal.to} 도착 목표`))}`,`DESCRIPTION:${escapeText(`${goal.from} → ${goal.to}, 최종 도착 ${goal.arrive}. 현재 추정치로 준비·출발 알람을 저장했어. 지연과 목표 변경은 자동 갱신되지 않아. 가져온 뒤 캘린더 알림 설정을 확인해줘.`)}`];
 if(repeat)lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${[...new Set(routine.days)].sort().map(d=>DAY_CODES[d]).join(',')}`);
 lines.push(...alarms,'END:VEVENT','END:VCALENDAR');
 return {text:lines.map(foldLine).join('\r\n')+'\r\n',omitted,pastForFirst,alarmCount:alarms.length/5,filename:`jac-${goal.date}${repeat?'-weekly':''}.ics`};
}
