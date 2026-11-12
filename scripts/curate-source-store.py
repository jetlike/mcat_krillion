#!/usr/bin/env python3
"""Add a reversible Anki canonical overlay and versioned game catalog to a private store.
Does not delete or rewrite any imported notes, fields, cards, clozes, media or PDFs.
Usage: python scripts/curate-source-store.py /private/content.sqlite
"""
import collections, datetime, hashlib, html, json, pathlib, re, sqlite3, sys
file=pathlib.Path(sys.argv[1]).resolve()
if not file.is_file(): raise SystemExit('Existing private SQLite content store required')
c=sqlite3.connect(file); c.row_factory=sqlite3.Row
original_tables=['notes','fields','cards','clozes','tags','media','media_references','document_pages','topic_catalog','app_question_reference']
def fingerprints():
    result={}
    for table in original_tables:
        h=hashlib.sha256();n=0
        for row in c.execute('SELECT * FROM '+table+' ORDER BY rowid'):
            h.update(json.dumps(tuple(row),ensure_ascii=False).encode());n+=1
        result[table]={'rows':n,'sha256':h.hexdigest()}
    return result
before=fingerprints()
backup=file.parent/'backups'/('before-canonical-overlay-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%f')+'.sqlite')
backup.parent.mkdir(exist_ok=True)
with sqlite3.connect(backup) as dest: c.backup(dest)
notes=list(c.execute('SELECT source,note_id,primary_text FROM notes ORDER BY source,note_id'))
parent={(n['source'],n['note_id']):(n['source'],n['note_id']) for n in notes}
def root(k):
    if parent[k]!=k: parent[k]=root(parent[k])
    return parent[k]
def merge(a,b):
    x,y=sorted([root(a),root(b)]);parent[y]=x
# Full field content, cloze syntax, case, formula tags and media identities retained.
# Only cosmetic HTML and whitespace may normalize. Never merge on question text alone.
media={(r['source'],r['filename']):r['sha256'] for r in c.execute('SELECT source,filename,sha256 FROM media')}
def canonical_html(text,source):
    text=re.sub(r'(<(?:img|audio|source|video)\b[^>]*?\b(?:src|poster)=["\'])([^"\']+)',lambda m:m[1]+('sha256:'+media[(source,html.unescape(m[2]))] if (source,html.unescape(m[2])) in media else m[2]),text,flags=re.I)
    text=re.sub(r'</?(?:b|strong|i|em|u|span|font)\b[^>]*>','',text,flags=re.I)
    text=re.sub(r'</?(?:div|p|br)\b[^>]*>',' ',text,flags=re.I)
    return re.sub(r'\s+',' ',html.unescape(text)).strip()
groups=collections.defaultdict(list)
for n in notes:
    k=(n['source'],n['note_id'])
    fields=[(r['ordinal'],r['name'],canonical_html(r['html'],n['source'])) for r in c.execute('SELECT ordinal,name,html FROM fields WHERE source=? AND note_id=? ORDER BY ordinal',k)]
    groups[hashlib.sha256(json.dumps(fields,ensure_ascii=False).encode()).hexdigest()].append(k)
merges=[]
for sig,keys in groups.items():
    if len(keys)>1:
        for key in keys[1:]:merge(keys[0],key)
        merges.append({'method':'all-fields-format-normalized','notes':[f'{a}:{b}' for a,b in keys]})
# Semantic assertion equivalents reviewed individually. Notes remain separate variants:
# explanations, media, tags, original cloze targets and card scheduling are never discarded.
reviewed=[('common-fate',1560638356285,1590303087907),('secondary-deviance',1561740691281,1591869601547),('instinctive-drift',1561751516423,1591914816901),('general-adaptation-stages',1556042699204,1590827745072),('distal-stimuli',1560810564368,1590571870382),('token-economy',1561748741220,1591914160223)]
for label,a,b in reviewed:
    ka,kb=('anking',a),('pankow',b)
    if ka not in parent or kb not in parent:raise ValueError('Missing reviewed source note: '+label)
    merge(ka,kb);merges.append({'method':'reviewed-assertion-equivalence','concept':label,'notes':[f'anking:{a}',f'pankow:{b}']})
with c:
    c.executescript('''CREATE TABLE IF NOT EXISTS kc_migrations(version INTEGER PRIMARY KEY, applied_at TEXT);
CREATE TABLE IF NOT EXISTS kc_concepts(id TEXT PRIMARY KEY, preferred_source TEXT, preferred_note_id INTEGER, policy TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS kc_note_variants(source TEXT, note_id INTEGER, concept_id TEXT NOT NULL REFERENCES kc_concepts(id), PRIMARY KEY(source,note_id), FOREIGN KEY(source,note_id) REFERENCES notes(source,note_id));
CREATE TABLE IF NOT EXISTS kc_merge_audit(id TEXT PRIMARY KEY, decision_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS kc_game_catalog(version TEXT PRIMARY KEY, catalog_json TEXT NOT NULL, sha256 TEXT NOT NULL, imported_at TEXT NOT NULL);''')
    byroot=collections.defaultdict(list)
    for key in parent:byroot[root(key)].append(key)
    for canonical,variants in byroot.items():
        cid='anki:'+hashlib.sha256(json.dumps(sorted(variants)).encode()).hexdigest()[:24]
        c.execute('INSERT OR IGNORE INTO kc_concepts VALUES(?,?,?,?)',(cid,*canonical,'Variants preserve all source fields, tags, media and clozes; assertion equivalence is not card identity.'))
        for source,note_id in variants:c.execute('INSERT INTO kc_note_variants VALUES(?,?,?) ON CONFLICT(source,note_id) DO UPDATE SET concept_id=excluded.concept_id',(source,note_id,cid))
    for decision in merges:
        raw=json.dumps(decision,sort_keys=True);c.execute('INSERT OR IGNORE INTO kc_merge_audit VALUES(?,?)',(hashlib.sha256(raw.encode()).hexdigest(),raw))
    raw=(pathlib.Path(__file__).resolve().parent.parent/'content/catalog.json').read_text();catalog=json.loads(raw);sha=hashlib.sha256(raw.encode()).hexdigest()
    old=c.execute('SELECT sha256 FROM kc_game_catalog WHERE version=?',(catalog['version'],)).fetchone()
    if old and old[0]!=sha:raise ValueError('Catalog changed: assign a new catalog version before ingestion')
    c.execute('INSERT OR IGNORE INTO kc_game_catalog VALUES(?,?,?,?)',(catalog['version'],raw,sha,datetime.datetime.now(datetime.timezone.utc).isoformat()))
    c.execute('INSERT OR IGNORE INTO kc_migrations VALUES(1,?)',(datetime.datetime.now(datetime.timezone.utc).isoformat(),))
after=fingerprints()
if before!=after:raise RuntimeError('Original source tables changed')
report={'backup':str(backup),'original_tables_unchanged':before==after,'original_counts':before,'source_notes':len(notes),'canonical_assertions':len(byroot),'merged_groups':len(merges),'decisions':merges,'excluded_candidates':['inner-ear: non-equivalent scope','counterconditioning: misleading shared definition; requires content correction'],'catalog':{'version':catalog['version'],'prompts':len(catalog['prompts']),'answers':sum(len(p['answers']) for p in catalog['prompts'])}}
report_path=file.parent/'canonical-overlay-report.json';report_path.write_text(json.dumps(report,indent=2));print(json.dumps({k:v for k,v in report.items() if k not in ['original_counts','decisions']},indent=2))
c.close()
