"""Freeze disjoint real-company samples, excluding every recorded local research job."""
import argparse, gzip, hashlib, json, random, sqlite3
from pathlib import Path
parser=argparse.ArgumentParser()
parser.add_argument('--output',required=True)
parser.add_argument('--seed',type=int,default=2026101603)
args=parser.parse_args()
root=Path(__file__).resolve().parents[1];destination=(root/args.output).resolve()
if destination.exists():raise SystemExit('Refusing an existing benchmark directory')
seen=set();excluded_sources=[]
for db in sorted(set((root/'data').glob('*.sqlite')) | set((root/'out').rglob('store.sqlite'))):
    # Closed WAL-mode historical copies may lack sidecars; immutable reads are safe only without a WAL.
    query='?mode=ro' if Path(str(db)+'-wal').exists() else '?mode=ro&immutable=1'
    with sqlite3.connect(db.as_uri()+query,uri=True) as connection:
        tables={r[0] for r in connection.execute("select name from sqlite_master where type='table'")}
        if 'jobs' in tables:
            ids={r[0] for r in connection.execute('select distinct org from jobs')}
            seen.update(ids);excluded_sources.append({'path':str(db.relative_to(root)),'companies':len(ids)})
for path in sorted((root/'out').rglob('*.jsonl')):
    if any(x in path.parts for x in ('cache','sources','receipts','node_modules')):continue
    for line in path.open():
        if not line.strip():continue
        try:
            item=json.loads(line);org=item if isinstance(item,str) else item.get('organisation_number',item.get('orgnr')) if isinstance(item,dict) else None
            if isinstance(org,str) and len(org)==9 and org.isdigit():seen.add(org)
        except (json.JSONDecodeError,AttributeError):pass
universe=root/'benchmark/universe.jsonl.gz'
with gzip.open(universe,'rt') as f:rows=[json.loads(line) for line in f if line.strip()]
eligible=[r for r in rows if r['organisation_number'] not in seen]
rng=random.Random(args.seed);chosen=rng.sample(eligible,1100)
destination.mkdir(parents=True)
manifest={'seed':args.seed,'selected_at':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),'universe_sha256':hashlib.sha256(universe.read_bytes()).hexdigest(),'universe_count':len(rows),'previously_seen_companies_excluded':len(seen),'prior_databases':excluded_sources,'company_overlap_between_batches':0,'prior_company_overlap':0,'selection':'Random 1,100 unseen organisation numbers split into disjoint 100 and 1,000; no URL/name enrichment passed to runner','host_overlap':'Measured after discovery; unknown hosts cannot be guaranteed disjoint from bare identifiers','batches':{}}
for size,subset in [(100,chosen[:100]),(1000,chosen[100:])]:
    text=''.join(json.dumps(r['organisation_number'])+'\n' for r in subset)
    path=destination/f'companies-{size}.jsonl';path.write_text(text)
    manifest['batches'][str(size)]={'path':str(path.relative_to(root)),'sha256':hashlib.sha256(text.encode()).hexdigest(),'count':size,'unique':len({r['organisation_number'] for r in subset})}
(destination/'selection-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'output':str(destination),'excluded':len(seen),'selected':1100,'overlap':0}))
