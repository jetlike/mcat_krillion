import {DatabaseSync} from 'node:sqlite';
import {randomUUID,createHash,randomBytes} from 'node:crypto';
import {mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
export class HistoryStore {
 constructor(filename=path.join(process.env.DATA_DIR||process.env.RAILWAY_VOLUME_MOUNT_PATH||'data','learning.sqlite')){
  if(filename!==':memory:')mkdirSync(path.dirname(filename),{recursive:true});const existed=filename!==':memory:'&&existsSync(filename);this.db=new DatabaseSync(filename);this.filename=filename;this.db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  const version=this.db.prepare("SELECT name FROM sqlite_master WHERE name='rp_migrations'").get();
  if(!version){if(existed)this.db.exec("VACUUM INTO '"+(filename+'.before-mcat-v1-'+Date.now()+'.sqlite').replaceAll("'","''")+"'");this.db.exec(`BEGIN;
 CREATE TABLE rp_migrations(version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL);
 CREATE TABLE rp_users(id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, created_at INTEGER NOT NULL);
 CREATE TABLE rp_actors(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES rp_users(id), name TEXT NOT NULL, UNIQUE(owner_id,name));
 CREATE TABLE rp_sessions(id TEXT PRIMARY KEY, room TEXT NOT NULL, mode TEXT NOT NULL, started_at INTEGER NOT NULL, ended_at INTEGER, reason TEXT, bank_version TEXT NOT NULL, review_json TEXT);
 CREATE TABLE rp_members(session_id TEXT NOT NULL REFERENCES rp_sessions(id), actor_id TEXT NOT NULL REFERENCES rp_actors(id), PRIMARY KEY(session_id,actor_id));
 CREATE TABLE rp_opportunities(id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES rp_sessions(id), actor_id TEXT NOT NULL REFERENCES rp_actors(id), prompt_id TEXT NOT NULL, started_at INTEGER NOT NULL, assisted INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE rp_attempts(id TEXT PRIMARY KEY, opportunity_id TEXT REFERENCES rp_opportunities(id), session_id TEXT NOT NULL REFERENCES rp_sessions(id), actor_id TEXT NOT NULL REFERENCES rp_actors(id), player_name TEXT NOT NULL, prompt_id TEXT NOT NULL, answer_id TEXT, submitted TEXT NOT NULL, outcome TEXT NOT NULL, at INTEGER NOT NULL, response_ms REAL NOT NULL, rarity REAL NOT NULL, bonus_seconds REAL NOT NULL, extra_lives INTEGER NOT NULL, assisted INTEGER NOT NULL, topics_json TEXT NOT NULL, answer_label TEXT);
 CREATE INDEX rp_attempts_actor_time ON rp_attempts(actor_id,at);
 CREATE TABLE rp_suggestions(id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES rp_users(id), prompt_id TEXT NOT NULL, submitted TEXT NOT NULL, evidence TEXT NOT NULL, at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending');
 INSERT INTO rp_migrations VALUES(1,unixepoch()*1000); COMMIT;`);}
  if(filename!==':memory:')this.db.exec('PRAGMA journal_mode=WAL');
 }
 identity(raw){const token=typeof raw==='string'&&/^[a-f0-9]{64}$/.test(raw)?raw:randomBytes(32).toString('hex');const digest=createHash('sha256').update(token).digest('hex');let user=this.db.prepare('SELECT id,created_at FROM rp_users WHERE token_hash=?').get(digest);if(!user){user={id:randomUUID(),created_at:Date.now()};this.db.prepare('INSERT INTO rp_users VALUES(?,?,?)').run(user.id,digest,user.created_at);}const actor=this.actor(user.id,'You');return {...user,token,actorId:actor.id};}
 actor(owner,name){let actor=this.db.prepare('SELECT * FROM rp_actors WHERE owner_id=? AND name=?').get(owner,name);if(!actor){actor={id:randomUUID(),owner_id:owner,name};this.db.prepare('INSERT INTO rp_actors VALUES(?,?,?)').run(actor.id,owner,name);}return actor;}
 start(r){this.db.prepare('INSERT INTO rp_sessions(id,room,mode,started_at,bank_version) VALUES(?,?,?,?,?)').run(r.matchId,r.code,r.mode,r.startedAt,r.bankVersion);const add=this.db.prepare('INSERT OR IGNORE INTO rp_members VALUES(?,?)');for(const p of r.players)if(p.actorId)add.run(r.matchId,p.actorId);}
 opportunity(r,p){if(!p.actorId)return;this.db.prepare('INSERT INTO rp_opportunities VALUES(?,?,?,?,?,?)').run(r.opportunityId,r.matchId,p.actorId,r.q.id,r.turnStartedAt,Number(r.assisted.has(p.id+':'+r.q.id)));}
 assist(r,p,promptId){if(p.actorId)this.db.prepare('UPDATE rp_opportunities SET assisted=1 WHERE id=? AND actor_id=? AND prompt_id=?').run(r.opportunityId,p.actorId,promptId);}
 attempt(r,p,event){if(!p.actorId)return;this.db.prepare('INSERT INTO rp_attempts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(event.id,r.opportunityId,r.matchId,p.actorId,p.name,r.q.id,event.answerId||null,event.submitted,event.outcome,event.at,event.responseMs,event.rarity||0,event.bonus||0,event.extraLives||0,Number(event.assisted),JSON.stringify(r.q.topics),event.answer||null);}
 save(r,snapshot){if(!r.matchId)return;this.db.prepare('UPDATE rp_sessions SET review_json=?,ended_at=?,reason=? WHERE id=?').run(JSON.stringify(snapshot),r.phase==='finished'?r.endedAt:null,r.result||null,r.matchId);}
 suggestion(owner,data){if(typeof data.promptId!=='string'||typeof data.answer!=='string'||!data.answer.trim()||data.answer.length>180||typeof data.evidence!=='string'||data.evidence.length>2000)throw Error('Provide an answer and optional source (maximum 2,000 characters).');const id=randomUUID();this.db.prepare('INSERT INTO rp_suggestions(id,owner_id,prompt_id,submitted,evidence,at) VALUES(?,?,?,?,?,?)').run(id,owner,data.promptId,data.answer.trim(),data.evidence,Date.now());return id;}
 data(owner){const actors=this.db.prepare('SELECT id,name FROM rp_actors WHERE owner_id=? ORDER BY name').all(owner);const attempts=this.db.prepare('SELECT a.* FROM rp_attempts a JOIN rp_actors p ON p.id=a.actor_id WHERE p.owner_id=? ORDER BY a.at DESC,a.rowid DESC').all(owner).map(a=>({...a,topics:JSON.parse(a.topics_json),assisted:Boolean(a.assisted)}));const opportunities=this.db.prepare('SELECT o.* FROM rp_opportunities o JOIN rp_actors p ON p.id=o.actor_id WHERE p.owner_id=?').all(owner);const sessions=this.db.prepare('SELECT DISTINCT s.* FROM rp_sessions s JOIN rp_members m ON m.session_id=s.id JOIN rp_actors a ON a.id=m.actor_id WHERE a.owner_id=? ORDER BY started_at DESC').all(owner).map(s=>({...s,review:s.review_json?JSON.parse(s.review_json):null,review_json:undefined}));return {actors,attempts,opportunities,sessions,storage:'server SQLite; anonymous browser profile',durableVolumeRequired:true};}
 close(){this.db.close();}
}
