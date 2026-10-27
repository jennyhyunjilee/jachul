export const DAY_CODES=['SU','MO','TU','WE','TH','FR','SA'];
export const DAY_LABELS=['일','월','화','수','목','금','토'];
export function normalizeRoutines(raw){if(!Array.isArray(raw))return [];return raw.filter(r=>r&&typeof r.from==='string'&&typeof r.to==='string'&&r.from!==r.to&&/^([01]\d|2[0-3]):[0-5]\d$/.test(r.arrive)&&Array.isArray(r.days)&&r.days.some(d=>Number.isInteger(d)&&d>=0&&d<=6)).slice(0,12).map((r,i)=>({...r,id:typeof r.id==='string'?r.id:`legacy-routine-${i}`,name:typeof r.name==='string'&&r.name.trim()?r.name.slice(0,80):'자주 가는 일정',days:[...new Set(r.days.filter(d=>Number.isInteger(d)&&d>=0&&d<=6))].sort(),...Object.fromEntries(['prep','walkTo','walkFrom','buffer'].map(k=>[k,Number.isFinite(Number(r[k]))?Math.max(0,Math.min(180,Number(r[k]))):({prep:20,walkTo:7,walkFrom:8,buffer:5}[k])]))}));}
export function seoulDate(t){return new Date(t+9*60*60*1000).toISOString().slice(0,10);}
export function nextOccurrence(r,time=Date.now()){
 const [valid]=normalizeRoutines([r]);if(!valid)return null;
 const base=new Date(seoulDate(time)+'T00:00:00Z');
 for(let i=0;i<8;i++){const d=new Date(base);d.setUTCDate(d.getUTCDate()+i);if(!valid.days.includes(d.getUTCDay()))continue;const date=d.toISOString().slice(0,10),at=Date.parse(`${date}T${valid.arrive}:00+09:00`);if(at>time)return {date,time:at};}
 return null;
}
