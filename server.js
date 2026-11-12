import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {HistoryStore} from './history.js';
import {RoomStore} from './rooms.js';
import {publicCatalog,byId,catalog} from './content.js';
export function createRuntime(options={}){
 const history=options.history||new HistoryStore(),idleMs=options.idleMs||Number(process.env.ROOM_IDLE_TIMEOUT_MS||600000),store=new RoomStore(options.now,idleMs,{history,...options.storeOptions}),streams=new Map(),rates=new Map();
 function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
 function broadcast(r){const payload=JSON.stringify(store.view(r));for(const c of streams.get(r.code)||[])c.res.write('data: '+payload+'\n\n');}
 function closeRoom(code,message='This room closed after inactivity.'){for(const c of streams.get(code)||[]){c.res.write('event: room-closed\ndata: '+JSON.stringify({message})+'\n\n');c.res.end();}streams.delete(code);}
 function identity(req,res){const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('rp_identity='))?.slice(12);const user=history.identity(token);if(token!==user.token)res.setHeader('Set-Cookie',`rp_identity=${user.token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${req.headers['x-forwarded-proto']==='https'?'; Secure':''}`);return user;}
 async function body(req){let size=0,parts=[];for await(const part of req){size+=part.length;if(size>8192)throw Error('Request too large.');parts.push(part);}return JSON.parse(Buffer.concat(parts).toString()||'{}');}
 const server=http.createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');try{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
  if(url.pathname==='/api/health')return send(res,200,{ok:true,version:'2.0.0',catalogVersion:catalog.version,prompts:catalog.prompts.length,persistence:'sqlite',persistentVolumeConfigured:Boolean(process.env.RAILWAY_VOLUME_MOUNT_PATH)});
  if(url.pathname.startsWith('/api/')){
   if(req.method==='POST'&&req.headers.origin&&req.headers.origin!==`${req.headers['x-forwarded-proto']==='https'?'https':'http'}://${req.headers.host}`)return send(res,403,{error:'Cross-origin request rejected.'});
   const user=identity(req,res);
   if(req.method==='GET'){
    if(url.pathname==='/api/catalog')return send(res,200,publicCatalog());
    if(url.pathname==='/api/profile')return send(res,200,{id:user.id,actorId:user.actorId,historyScope:'This anonymous browser profile; use the same browser to return.'});
    if(url.pathname==='/api/history')return send(res,200,history.data(user.id));
    if(url.pathname==='/api/export'){res.setHeader('Content-Disposition','attachment; filename="reaction-party-history.json"');return send(res,200,history.data(user.id));}
    if(url.pathname==='/api/events'){
     let r,p;try{r=store.get(url.searchParams.get('code'));p=store.auth(r,url.searchParams.get('token'));if(p.ownerId!==user.id)throw Error('Wrong profile');}catch{res.writeHead(204,{'Cache-Control':'no-store'});return res.end();}
     let clients=streams.get(r.code);if(!clients)streams.set(r.code,clients=new Set());if(clients.size>=32)return send(res,429,{error:'Too many connections in this room.'});
     res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write('retry: 2000\ndata: '+JSON.stringify(store.view(r))+'\n\n');const client={res,player:p.id};clients.add(client);req.on('close',()=>{clients.delete(client);if(!clients.size)streams.delete(r.code);});return;
    }
    return send(res,404,{error:'Not found'});
   }
   if(req.method!=='POST')return send(res,405,{error:'Method not allowed'});
   const now=Date.now(),rate=rates.get(user.id)||{start:now,count:0};if(now-rate.start>60000){rate.start=now;rate.count=0;}rates.set(user.id,rate);if(++rate.count>180)return send(res,429,{error:'Too many requests. Wait a moment.'});
   const data=await body(req);
   if(url.pathname==='/api/suggestion'){if(!byId.has(data.promptId))throw Error('Unknown prompt');return send(res,200,{id:history.suggestion(user.id,{...data,evidence:data.evidence||''}),message:'Saved for content review. Scores and rewards stay unchanged in this match.'});}
   if(url.pathname==='/api/create'){
    const names=Array.isArray(data.names)?data.names:[data.name];if(names.length<1||names.length>8||new Set(names.map(n=>String(n).trim().toLowerCase())).size!==names.length)throw Error('Add 1–8 unique nicknames.');
    const players=[];let first;
    for(const [i,name] of names.entries()){const actor=names.length===1?{id:user.actorId}:history.actor(user.id,store.name(name));const result=i===0?store.create(name,{ownerId:user.id,actorId:actor.id}):store.join(first.room.code,name,{ownerId:user.id,actorId:actor.id});if(i===0)first=result;players.push({id:result.player.id,token:result.player.token});}
    return send(res,200,{code:first.room.code,id:first.player.id,token:first.player.token,players});
   }
   if(url.pathname==='/api/join'){const result=store.join(data.code,data.name,{ownerId:user.id,actorId:user.actorId});broadcast(result.room);return send(res,200,{code:result.room.code,id:result.player.id,token:result.player.token,players:[{id:result.player.id,token:result.player.token}]});}
   if(url.pathname==='/api/action'){
    const r=store.get(data.code),p=store.auth(r,req.headers.authorization?.replace(/^Bearer /,''));if(p.ownerId!==user.id)return send(res,403,{error:'This room seat belongs to another browser profile.'});const version=r.version;try{store.action(r.code,p.token,data);}finally{if(r.version!==version)broadcast(r);}
    if(!store.rooms.has(r.code))closeRoom(r.code,'Everyone left the room.');return send(res,200,{ok:true,result:r.actionResult});
   }
   return send(res,404,{error:'Not found'});
  }
  const name=url.pathname==='/'?'index.html':url.pathname.slice(1);if(!['index.html','style.css','app.js','online.js','taxonomy.js','analytics.js'].includes(name)){res.writeHead(404);return res.end('Not found');}
  const data=await readFile(new URL(name,import.meta.url));res.setHeader('Cache-Control','no-cache');res.setHeader('Content-Type',{'html':'text/html; charset=utf-8','css':'text/css','js':'text/javascript'}[name.split('.').pop()]);res.end(data);
 }catch(e){if(!res.headersSent)send(res,400,{error:e.message});else res.end();}});
 const tick=setInterval(()=>{for(const r of store.rooms.values())if(store.expire(r))broadcast(r);},100);tick.unref();
 const maintenance=setInterval(()=>{store.sweep();for(const [code,clients] of streams){const r=store.rooms.get(code);if(!r){closeRoom(code);continue;}const remaining=r.lastActivity+store.idleMs-store.now();if(!r.warned&&remaining<=Math.min(120000,store.idleMs/5)){r.warned=true;for(const c of clients)c.res.write('event: idle-warning\ndata: '+JSON.stringify({expiresAt:r.lastActivity+store.idleMs,serverNow:store.now()})+'\n\n');}for(const c of clients)c.res.write(': heartbeat\n\n');}for(const [key,value] of rates)if(Date.now()-value.start>60000)rates.delete(key);},Math.min(15000,Math.max(100,idleMs/10)));maintenance.unref();
 server.on('close',()=>{clearInterval(tick);clearInterval(maintenance);history.close();});return {server,store,history,close(){for(const code of streams.keys())closeRoom(code,'Server shutting down.');return new Promise(resolve=>server.close(resolve));}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const runtime=createRuntime();runtime.server.listen(process.env.PORT||3000,'0.0.0.0',()=>console.log('Reaction Party running on port '+runtime.server.address().port));process.once('SIGTERM',()=>{runtime.close().then(()=>process.exit(0));setTimeout(()=>process.exit(0),5000).unref();});}
