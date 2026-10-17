"""Freeze fresh cohort IDs and a bounded, auditable prior-research inventory. No network."""
import argparse
import datetime
import gzip
import hashlib
import json
import sqlite3
from urllib.parse import urlparse
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True)
parser.add_argument('--count', type=int, choices=[12, 100, 1000], default=12)
parser.add_argument('--seed', default='quality-20261017-v1')
parser.add_argument('--inventory-only', action='store_true')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
destination = (root / args.output).resolve()
if not args.inventory_only and destination.exists():
    raise SystemExit('Refusing an existing cohort; evaluated companies cannot be repaired into a fresh holdout')
seen, hosts, receipts = set(), set(), []
history_hosts = root / 'out/research-history/prior-hosts.json'
if history_hosts.exists():
    hosts.update(json.loads(history_hosts.read_text()))
    receipts.append({'path': str(history_hosts.relative_to(root)), 'company_hosts': len(hosts),
                     'scope': 'Prior-research exclusions retained after deleting obsolete run databases'})
databases = sorted(set((root / 'data').glob('*.sqlite')) | set((root / 'out').rglob('store.sqlite')))
for db in databases:
    # Never hash/scan multi-GB snapshot bodies just to select twelve identifiers.
    query = '?mode=ro' if Path(str(db) + '-wal').exists() else '?mode=ro&immutable=1'
    with sqlite3.connect(db.as_uri() + query, uri=True, timeout=2) as connection:
        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        ids = {row[0] for row in connection.execute('SELECT DISTINCT org FROM jobs')} if 'jobs' in tables else set()
        company_hosts = {row[0].lower().removeprefix('www.') for row in connection.execute('SELECT DISTINCT host FROM verified_hosts')} if 'verified_hosts' in tables else set()
        # Registry-listed domains can be admitted without a verified_hosts row.
        # Include every published website rather than silently missing those hosts.
        if 'profiles' in tables:
            for (value,) in connection.execute("SELECT json_extract(c.value,'$.value') FROM profiles p,json_each(p.body,'$.claims') c WHERE json_extract(c.value,'$.field') IN ('official_website','registered_website') AND json_extract(c.value,'$.availability')='available'"):
                if isinstance(value, str):
                    host = urlparse(value if '://' in value else 'https://' + value).hostname
                    if host:
                        company_hosts.add(host.lower().removeprefix('www.'))
        seen.update(ids)
        hosts.update(company_hosts)
        receipts.append({'path': str(db.relative_to(root)), 'companies': len(ids), 'company_hosts': len(company_hosts)})
for pattern in ['*/companies-*.jsonl', 'quality-*/companies.jsonl']:
    for path in (root / 'out').glob(pattern):
        if args.inventory_only and path.parent == destination:
            continue
        for line in path.read_text().splitlines():
            value = json.loads(line)
            seen.add(value if isinstance(value, str) else value['organisation_number'])
now = datetime.datetime.now(datetime.timezone.utc).isoformat()
freshness = {'captured_at': now, 'excluded_company_ids': sorted(seen), 'company_hosts': sorted(hosts),
             'scope': 'All discovered local jobs databases and frozen selection IDs; company hosts from verified_hosts and every published official_website/registered_website claim. Unlogged assistant reading and unpublished candidate-page hosts are not represented.',
             'prior_databases': receipts}
if args.inventory_only:
    chosen = [json.loads(line) for line in (destination / 'companies.jsonl').read_text().splitlines()]
    if set(chosen) & seen:
        raise SystemExit('Selected companies already appear in historical research')
else:
    universe = root / 'benchmark/universe.jsonl.gz'
    with gzip.open(universe, 'rt') as source:
        rows = [json.loads(line) for line in source if line.strip()]
    eligible = [row for row in rows if row['organisation_number'] not in seen]
    rank = lambda row: hashlib.sha256((args.seed + ':' + row['organisation_number']).encode()).hexdigest()
    if args.count == 12:
        strata = [('manufacturing', range(10, 34), 2), ('construction', range(41, 44), 2),
                  ('retail', range(45, 48), 2), ('professional', range(69, 76), 2),
                  ('hospitality', range(55, 57), 2), ('care_education', range(85, 89), 1),
                  ('transport', range(49, 54), 1)]
        selected = []
        for label, codes, count in strata:
            pool = [row for row in eligible if row['industry_code'][:2].isdigit()
                    and int(row['industry_code'][:2]) in codes and (row.get('employees') or 0) >= 5
                    and not row['bankrupt'] and not row['liquidating']]
            if len(pool) < count:
                raise SystemExit('Insufficient fresh companies for ' + label)
            selected.extend([{**row, 'stratum': label} for row in sorted(pool, key=rank)[:count]])
        method = '12 unseen active companies, >=5 registered employees, hash selection within seven industry strata; diagnostic cohort, not population-representative'
    else:
        selected = sorted(eligible, key=rank)[:args.count]
        method = 'Hash-ranked fresh universe sample; unknown employees/websites and legal statuses are retained'
    if len(selected) != args.count:
        raise SystemExit('Insufficient eligible companies')
    destination.mkdir(parents=True)
    text = ''.join(json.dumps(row['organisation_number']) + '\n' for row in selected)
    (destination / 'companies.jsonl').write_text(text)
    manifest = {'version': 1, 'selected_at': now, 'seed': args.seed, 'selection': method,
                'input_sha256': hashlib.sha256(text.encode()).hexdigest(),
                'universe_sha256': hashlib.sha256(universe.read_bytes()).hexdigest(),
                'excluded_company_count': len(seen), 'company_overlap': 0,
                'host_overlap': 'Measured from saved company sources after acquisition; cannot assume freshness from bare IDs',
                'companies': selected}
    (destination / 'selection.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
with (destination / 'freshness.json').open('x') as output:
    json.dump(freshness, output, ensure_ascii=False, indent=2)
    output.write('\n')
print(json.dumps({'directory': str(destination), 'excluded_companies': len(seen), 'recorded_company_hosts': len(hosts)}))
