#!/usr/bin/env python3
"""Reproduce Builderr's public random.Random(seed).sample batch procedure."""
import argparse
import gzip
import json
import random
from pathlib import Path

def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--universe', required=True)
    cli.add_argument('--output', required=True)
    cli.add_argument('--count', type=int, default=100)
    cli.add_argument('--seed', type=int, default=20260823)
    options = cli.parse_args()
    if options.count < 1:
        cli.error('count must be positive')
    source = Path(options.universe)
    with source.open('rb') as probe:
        compressed = probe.read(2) == b'\x1f\x8b'
    reader = gzip.open if compressed else open
    with reader(source, 'rt', encoding='utf-8') as stream:
        population = [json.loads(line) for line in stream if line.strip()]
    if options.count > len(population):
        cli.error('count exceeds the available universe')
    sample = random.Random(options.seed).sample(population, options.count)
    destination = Path(options.output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(''.join(json.dumps(row, ensure_ascii=False, separators=(',', ':')) + '\n' for row in sample), encoding='utf-8')
    print('Wrote {} companies to {}'.format(len(sample), destination))

if __name__ == '__main__':
    main()
