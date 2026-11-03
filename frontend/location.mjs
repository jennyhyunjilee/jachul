export function distance(a,b){const rad=x=>x*Math.PI/180;const x=rad(b.lat-a.lat),y=rad(b.lon-a.lon);return 6371000*2*Math.asin(Math.min(1,Math.sqrt(Math.sin(x/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(y/2)**2)));}
export class HomeMonitor{
 constructor(geo,onChange,clock=()=>Date.now()){this.geo=geo;this.onChange=onChange;this.clock=clock;this.watch=null;this.run=0;this.manual=null;this.hits=0;this.last=0;this.status='꺼짐';this.atHome=false;this.active=false;}
 emit(){this.onChange?.(this);}
 stop(){this.run++;if(this.watch!==null)this.geo?.clearWatch(this.watch);this.watch=null;this.active=false;this.hits=0;this.atHome=false;this.last=0;this.status='꺼짐';this.emit();}
 start(home){this.stop();if(!home||!this.geo){this.status='위치 미지원 · 수동으로 알려줘';this.emit();return;}this.active=true;this.home=home;this.manual=null;this.status='위치 확인 중';const run=this.run;this.watch=this.geo.watchPosition(p=>{if(run===this.run)this.accept(p);},()=>{if(run!==this.run)return;this.hits=0;this.atHome=false;this.status='위치 거절 또는 오류 · 수동으로 알려줘';this.emit();},{enableHighAccuracy:true,maximumAge:0,timeout:15000});this.emit();}
 accept(p){const c=p.coords;this.last=p.timestamp;const uncertain=!Number.isFinite(c.latitude)||!Number.isFinite(c.longitude)||!Number.isFinite(c.accuracy)||c.accuracy>150||this.clock()-p.timestamp>120000||p.timestamp>this.clock()+10000;
  if(uncertain){this.hits=0;this.atHome=false;this.status='위치 불확실';}
  else if(distance(this.home,{lat:c.latitude,lon:c.longitude})<=150){this.hits++;this.atHome=this.hits>=2;this.status=this.atHome?'집 근처':'집 근처 재확인 중';}else{this.hits=0;this.atHome=false;this.status='집 밖';}this.emit();}
 tick(){if(this.active&&this.last&&this.clock()-this.last>120000&&this.status!=='위치 불확실'){this.hits=0;this.atHome=false;this.status='위치 불확실';this.emit();}}
 setManual(value){this.manual=value;this.emit();}
 isHome(){return this.manual!==null?this.manual:this.atHome;}
}
