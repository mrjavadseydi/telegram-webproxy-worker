// Bridge page loaded by the Telegram app's WebView. Carrier: websocket-lanes (one WebSocket per stream).
// Frame: type:u8 | stream_id:u24 | length:u32 | payload. OPEN=1 DATA=2 CLOSE=3 WINDOW=4.
// ponytail: no uplink queue cap; per-stream WINDOW credit (4 MiB) already bounds what the app sends.
const SCRIPT = `(()=>{'use strict';
const boot=__BOOT__,base=location.origin+'/';
const nonce=/^#android=([A-Za-z0-9_-]{43})$/.exec(location.hash)?.[1]||'';
history.replaceState(null,'',location.pathname);
let port=null,session='',closed=false,started=false;
const waiting=[],lanes=new Map(),dead=new Set();
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const status=state=>{if(port&&!closed)port.postMessage({t:'status',state})};
const deliver=buf=>{if(port&&!closed)port.postMessage(buf,[buf])};
const api=(method,token,body)=>fetch(base+'api/v1/session',{method,body,keepalive:method==='DELETE',mode:'same-origin',credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',
 headers:Object.assign({Authorization:'Bearer '+token},body?{'Content-Type':'application/octet-stream'}:{})});
function frames(buf){
 const v=new DataView(buf),out=[];let off=0;
 while(off<buf.byteLength){
  if(buf.byteLength-off<8||out.length>=4096)throw new Error('bad batch');
  const type=v.getUint8(off),id=v.getUint32(off)&0xffffff,end=off+8+v.getUint32(off+4);
  if(end>buf.byteLength||end-off-8>1048576)throw new Error('bad frame');
  out.push({type,id,data:buf.slice(off,end)});off=end;
 }
 if(!out.length)throw new Error('empty batch');
 return out;
}
function closeFrame(id){const b=new ArrayBuffer(8);new DataView(b).setUint32(0,(3<<24|id)>>>0);return b}
function shutdown(notify){
 if(closed)return;closed=true;
 for(const l of lanes.values())try{l.ws.close()}catch(e){}
 if(notify&&session)api('DELETE',session).catch(()=>{});
 if(port)port.close();
}
function fail(){if(closed)return;status('failed');if(port)port.postMessage({t:'close'});shutdown(true)}
async function create(hello){
 try{
  status('connecting');
  let r;
  for(let i=0;;i++){
   try{r=await api('POST',boot,hello);break}catch(e){if(closed||i===5)throw e}
   status('reconnecting');await pause(500<<i);
  }
  if(r.status!==200||r.headers.get('X-Carrier-Mode')!=='websocket-lanes')throw new Error('session rejected');
  session=r.headers.get('X-Session-Token')||'';
  if(!session)throw new Error('no session');
  const welcome=await r.arrayBuffer();
  if(closed){api('DELETE',session).catch(()=>{});return}
  deliver(welcome);status('connected');
  for(const d of waiting.splice(0))route(d);
 }catch(e){fail()}
}
function finish(lane,notify){
 if(lane.done)return;lane.done=true;lanes.delete(lane.id);
 dead.add(lane.id);if(dead.size>4096)dead.delete(dead.values().next().value);
 try{lane.ws.close()}catch(e){}
 if(notify)deliver(closeFrame(lane.id));
}
function openLane(id){
 const lane={id,queue:[],open:false,done:false,localClosed:false,remoteClosed:false};
 const ws=lane.ws=new WebSocket(base.replace(/^https:/,'wss:')+'api/v1/ws','tproxy-lane-v1.'+session+'.'+id);
 ws.binaryType='arraybuffer';
 ws.onopen=()=>{if(closed||lane.done){ws.close();return}lane.open=true;for(const d of lane.queue.splice(0))ws.send(d);status('connected')};
 ws.onmessage=e=>{
  if(!(e.data instanceof ArrayBuffer)||!e.data.byteLength){fail();return}
  let fs;try{fs=frames(e.data)}catch(err){fail();return}
  if(fs.some(f=>f.id!==id)){fail();return}
  if(fs.some(f=>f.type===3))lane.remoteClosed=true;
  deliver(e.data);
 };
 ws.onclose=()=>{if(closed||lane.done)return;if(!lane.open){fail();return}finish(lane,!lane.localClosed&&!lane.remoteClosed)};
 lanes.set(id,lane);
 return lane;
}
function route(buf){
 for(const f of frames(buf)){
  let lane=lanes.get(f.id);
  if(!lane){
   if(f.id&&f.type>=2&&f.type<=4)continue;
   if(!f.id||f.type!==1||dead.has(f.id))throw new Error('bad open');
   lane=openLane(f.id);
  }
  if(f.type===3){lane.localClosed=true;if(!lane.open){finish(lane,false);continue}}
  if(lane.open)lane.ws.send(f.data);else lane.queue.push(f.data);
 }
}
function activate(p){
 port=p;
 p.onmessage=m=>{
  const d=m.data;
  if(d instanceof ArrayBuffer){
   if(!started){started=true;create(d)}
   else if(!session)waiting.push(d);
   else try{route(d)}catch(e){fail()}
  }else if(d&&d.t==='close')shutdown(true);
 };
 p.start();status('connecting');
}
addEventListener('message',e=>{
 if(port||e.source!==parent||!e.data||typeof e.data!=='object')return;
 if(Object.keys(e.data).sort().join()!=='t,v'||e.data.t!=='tproxy-init'||e.data.v!==1||e.ports.length!==1)return;
 let o;try{o=new URL(e.origin)}catch(err){return}
 if(o.protocol!=='http:'||o.hostname!=='127.0.0.1'||!o.port||o.origin!==e.origin)return;
 activate(e.ports[0]);
});
const native=globalThis.TelegramWebProxy;
if(!port&&nonce&&native&&typeof native.postMessage==='function'){
 const p={onmessage:null,start(){},close(){native.onmessage=null},postMessage(v){
  if(!(v instanceof ArrayBuffer)){native.postMessage(JSON.stringify(v));return}
  let fs;try{fs=frames(v)}catch(e){fail();return}
  for(const f of fs)native.postMessage(f.data);
 }};
 native.onmessage=e=>{let d=e.data;if(typeof d==='string'){try{d=JSON.parse(d)}catch(err){return}}if(p.onmessage)p.onmessage({data:d})};
 activate(p);
 native.postMessage(JSON.stringify({t:'tproxy-android-init',v:1,nonce}));
}
addEventListener('pagehide',()=>shutdown(true),{once:true});
})();`;

export const bridgeHtml = (nonce, boot) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connection</title></head>
<body><script nonce="${nonce}">${SCRIPT.replace('__BOOT__', JSON.stringify(boot))}</script></body></html>`;

export const bridgeHeaders = (nonce, host) => ({
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': [
    "default-src 'none'", "base-uri 'none'", "child-src 'none'", `connect-src 'self' wss://${host}`,
    "font-src 'none'", "form-action 'none'", 'frame-ancestors http://127.0.0.1:*', "frame-src 'none'",
    "img-src 'none'", "manifest-src 'none'", "media-src 'none'", "object-src 'none'",
    `script-src 'nonce-${nonce}'`, "style-src 'none'", "worker-src 'none'", 'sandbox allow-same-origin allow-scripts',
  ].join('; '),
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-DNS-Prefetch-Control': 'off',
  'Permissions-Policy': 'accelerometer=(), autoplay=(), camera=(), clipboard-read=(), clipboard-write=(), display-capture=(), encrypted-media=(), fullscreen=(), geolocation=(), gyroscope=(), hid=(), idle-detection=(), magnetometer=(), microphone=(), midi=(), payment=(), picture-in-picture=(), publickey-credentials-create=(), publickey-credentials-get=(), screen-wake-lock=(), serial=(), usb=(), web-share=(), xr-spatial-tracking=()',
});
