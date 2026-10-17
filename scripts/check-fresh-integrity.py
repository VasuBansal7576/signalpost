"""Independent read-only check of selected inputs against the recorded prior-state inventory."""
import argparse,gzip,hashlib,json,sqlite3
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--directory',required=True);args=p.parse_args();root=Path.cwd();directory=Path(args.directory).resolve();manifest=json.loads((directory/'selection-manifest.json').read_text());prior=set();databases=[]
for entry in manifest['prior_databases']:
 path=(root/entry['path']).resolve();query='?mode=ro' if Path(str(path)+'-wal').exists() else '?mode=ro&immutable=1'
 with sqlite3.connect(path.as_uri()+query,uri=True) as db:ids={r[0] for r in db.execute('select distinct org from jobs')}
 prior.update(ids);databases.append({'path':entry['path'],'recorded_count':entry['companies'],'observed_count':len(ids),'inventory_count_unchanged':len(ids)==entry['companies']})
inputs={};failures=[]
for size in ['100','1000']:
 path=root/manifest['batches'][size]['path'];raw=path.read_bytes();rows=[json.loads(line) for line in raw.decode().splitlines() if line.strip()];inputs[size]=set(rows)
 if len(rows)!=int(size) or len(set(rows))!=int(size):failures.append(size+': count or uniqueness failed')
 if hashlib.sha256(raw).hexdigest()!=manifest['batches'][size]['sha256']:failures.append(size+': input hash changed')
 if set(rows)&prior:failures.append(size+': overlaps previously researched identifiers')
overlap=inputs['100']&inputs['1000']
if overlap:failures.append('Cross-batch identifiers overlap')
with gzip.open(root/'benchmark/universe.jsonl.gz','rt') as f:universe={json.loads(line)['organisation_number'] for line in f if line.strip()}
if (inputs['100']|inputs['1000'])-universe:failures.append('Selected identifiers outside frozen company universe')
if not all(d['inventory_count_unchanged'] for d in databases):failures.append('Prior database inventory changed; historical-state comparison needs review')
report={'created_at':__import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),'selected_counts':{k:len(v) for k,v in inputs.items()},'cross_batch_overlap':len(overlap),'prior_research_db_overlap':{k:len(v&prior) for k,v in inputs.items()},'prior_databases':databases,'input_universe_verified':True,'failures':failures,'passed':not failures,'scope':'Independently recomputed from frozen input hashes and prior database inventory; selector additionally excluded prior JSONL inputs/results. Does not prove provider live-crawl freshness.'}
(directory/'freshness-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:v for k,v in report.items() if k!='prior_databases'}));raise SystemExit(1 if failures else 0)
