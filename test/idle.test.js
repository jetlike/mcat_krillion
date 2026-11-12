import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {RoomStore} from '../rooms.js';
const MIN=60000;
test('rooms expire at 10 minutes across phases; views and reconnects do not keep them alive',()=>{
 for(const phase of ['lobby','playing','review','finished']){
  let now=0;const s=new RoomStore(()=>now),{room:r,player:p}=s.create('Alice');
  if(phase!=='lobby'){s.join(r.code,'Bob');s.action(r.code,p.token,{action:'start',topics:['atomic'],duration:30,lives:3});s.action(r.code,p.token,{action:'pause'});r.phase=phase;}
  now=9*MIN;s.auth(r,p.token);s.view(r);assert.deepEqual(s.sweep(),[]);
  now=10*MIN;assert.throws(()=>s.get(r.code));assert.deepEqual(s.sweep(),[r.code]);assert.equal(s.rooms.size,0);
 }
});
test('automatic game expiration does not refresh activity, but player actions and joins do',()=>{
 let now=0;const s=new RoomStore(()=>now),{room:r,player:p}=s.create('Alice');
 now=MIN;s.join(r.code,'Bob');assert.equal(r.lastActivity,MIN);
 s.action(r.code,p.token,{action:'start',topics:['atomic'],duration:30,lives:3});
 now+=30000;s.expire(r);assert.equal(r.lastActivity,MIN);
 now=9*MIN;r.warned=true;s.action(r.code,p.token,{action:'stay'});assert.equal(r.warned,false);assert.equal(r.lastActivity,now);
 now=11*MIN;assert.deepEqual(s.sweep(),[]);
 now=19*MIN;assert.throws(()=>s.action(r.code,p.token,{action:'stay'}));assert.deepEqual(s.sweep(),[r.code]);
});
test('unauthenticated keepalive does not refresh activity',()=>{
 let now=0;const s=new RoomStore(()=>now),{room:r}=s.create('Alice');now=5*MIN;assert.throws(()=>s.action(r.code,'invalid',{action:'stay'}));assert.equal(r.lastActivity,0);
});
test('HTTP streams warn, keepalive extends expiry, closure ends every stream, stale reconnects stop with 204',{timeout:15000},async()=>{
 const dataDir=mkdtempSync(join(tmpdir(),'reaction-idle-'));const cookies=new Map();
 const child=spawn(process.execPath,['server.js'],{cwd:new URL('..',import.meta.url),env:{...process.env,DATA_DIR:dataDir,PORT:'0',ROOM_IDLE_TIMEOUT_MS:'1800'},stdio:['ignore','pipe','pipe']});
 const abort=new AbortController();
 try{
  const text=await new Promise((resolve,reject)=>{child.stdout.once('data',b=>resolve(b.toString()));child.once('error',reject);child.once('exit',()=>reject(Error('Server exited before listening')))});
  const port=text.match(/port (\d+)/)?.[1];assert(port);const origin='http://127.0.0.1:'+port;
  const post=async(path,data,token)=>{const res=await fetch(origin+'/api/'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token,Cookie:cookies.get(token)}:{})},body:JSON.stringify(data)});assert.equal(res.status,200);const result=await res.json();if(result.token)cookies.set(result.token,res.headers.get('set-cookie').split(';')[0]);return result};
  const a=await post('create',{name:'Alice'}),b=await post('join',{code:a.code,name:'Bob'});
  async function stream(user){const res=await fetch(`${origin}/api/events?code=${a.code}&token=${user.token}`,{signal:abort.signal,headers:{Cookie:cookies.get(user.token)}});const reader=res.body.getReader();return {reader,text:'',async until(value){while(!this.text.includes(value)){const {value:chunk,done}=await reader.read();assert(!done,'stream ended before '+value);this.text+=new TextDecoder().decode(chunk)}},async end(){while(true){const {value,done}=await reader.read();if(done)return;this.text+=new TextDecoder().decode(value)}}};}
  const first=await stream(a),second=await stream(b);await first.until('idle-warning');
  await post('action',{code:a.code,action:'stay'},a.token);
  const stayTime=Date.now();await first.until('room-closed');assert(Date.now()-stayTime>=1700,'keepalive must extend the room');await first.end();await second.end();assert(second.text.includes('room-closed'));
  const missing=await fetch(`${origin}/api/events?code=${a.code}&token=${a.token}`);assert.equal(missing.status,204);
  const closed=await fetch(origin+'/api/action',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+a.token},body:JSON.stringify({code:a.code,action:'stay'})});assert.equal(closed.status,400);
 }finally{abort.abort();child.kill();await once(child,'exit');rmSync(dataDir,{recursive:true,force:true});}
});
