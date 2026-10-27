import {graph,getRoute,estimateJourney} from './core.mjs';
export class LocalProvider{
 constructor({fetcher=globalThis.fetch.bind(globalThis),clock=()=>Date.now()}={}){this.fetcher=fetcher;this.clock=clock;this.interval=60*60*1000;this.lastSuccess=null;this.lastAttempt=null;this.error=null;this.g=null;this.liveConnected=false;}
 async refresh(){this.lastAttempt=this.clock();try{const r=await this.fetcher('./data/network.json',{cache:'no-cache'});if(!r.ok)throw new Error('local network');const net=await r.json();if(!net.nodes||!net.edges||!net.lines)throw new Error('invalid network');this.g=graph(net);this.lastSuccess=this.clock();this.error=null;return true;}catch{this.error='로컬 노선 자료를 읽지 못했어';return false;}}
 get stale(){return this.lastSuccess===null||this.clock()-this.lastSuccess>this.interval;}
 get due(){return this.lastAttempt===null||this.clock()-this.lastAttempt>=this.interval;}
 getRoute(from,to){return this.g?getRoute(this.g,from,to):null;}
 estimateJourney(...args){return estimateJourney(...args);}
 get status(){return {mode:'estimated',liveConnected:false,intervalMinutes:60,lastSuccess:this.lastSuccess,lastAttempt:this.lastAttempt,stale:this.stale,error:this.error};}
}
