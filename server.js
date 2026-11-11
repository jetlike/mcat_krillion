import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {RoomStore} from './rooms.js';
const store=new RoomStore(),streams=new Map(),rates=new Map();
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data))}
function broadcast(r){const body=`data: ${JSON.stringify(store.view(r))}\n\n`;for(const res of streams.get(r.code)||[])res.write(body)}
async function body(req){let data='';for await(const chunk of req){data+=chunk;if(data.length>4096)throw Error('Request too large.')}return JSON.parse(data||'{}')}
const server=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');try{
res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
if(url.pathname.startsWith('/api/')){
 if(req.method==='POST'){
  if(req.headers.origin&&req.headers.origin!==`${req.headers['x-forwarded-proto']==='https'?'https':'http'}://${req.headers.host}`)return send(res,403,{error:'Cross-origin request rejected.'});
  const key=req.socket.remoteAddress,now=Date.now(),rate=rates.get(key)||{start:now,count:0};if(now-rate.start>60000){rate.start=now;rate.count=0}rates.set(key,rate);if(++rate.count>300)return send(res,429,{error:'Too many requests. Please wait a moment.'});
  const data=await body(req);let result;
  if(url.pathname==='/api/create')result=store.create(data.name);
  else if(url.pathname==='/api/join')result=store.join(data.code,data.name);
  else if(url.pathname==='/api/action'){const current=store.get(data.code);const version=current.version;try{store.action(data.code,req.headers.authorization?.replace(/^Bearer /,''),data)}finally{if(current.version!==version)broadcast(current)}return send(res,200,{ok:true})}
  else return send(res,404,{error:'Not found'});
  broadcast(result.room);return send(res,200,{code:result.room.code,id:result.player.id,token:result.player.token});
 }
 if(req.method==='GET'&&url.pathname==='/api/events'){
  const r=store.get(url.searchParams.get('code'));store.auth(r,url.searchParams.get('token'));
  let clients=streams.get(r.code);if(!clients)streams.set(r.code,clients=new Set());if(clients.size>=32)return send(res,429,{error:'Too many connections to this room.'});
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(`retry: 2000\ndata: ${JSON.stringify(store.view(r))}\n\n`);clients.add(res);req.on('close',()=>{clients.delete(res);if(!clients.size)streams.delete(r.code)});return;
 }
 return send(res,404,{error:'Not found'});
}
const name=url.pathname==='/'?'index.html':url.pathname.slice(1);if(!['index.html','style.css','app.js','online.js','questions.js'].includes(name)){res.writeHead(404);return res.end('Not found')}
const bytes=await readFile(new URL(name,import.meta.url));res.setHeader('Content-Type',({'html':'text/html','css':'text/css','js':'text/javascript'})[name.split('.').pop()]);res.end(bytes);
}catch(e){if(!res.headersSent)send(res,400,{error:e.message});else res.end()}});
const tick=setInterval(()=>{for(const r of store.rooms.values())if(store.expire(r))broadcast(r)},100);
const maintenance=setInterval(()=>{store.sweep();for(const [code,clients] of streams){if(!store.rooms.has(code)){for(const res of clients)res.end();streams.delete(code);}else for(const res of clients)res.write(': heartbeat\n\n')}for(const [key,value] of rates)if(Date.now()-value.start>60000)rates.delete(key)},15000);
server.on('close',()=>{clearInterval(tick);clearInterval(maintenance)});
server.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('Reaction Party running on port '+(process.env.PORT||3000)));
