import { createReadStream } from 'node:fs';
import { readFile, open } from 'node:fs/promises';
import { createGunzip } from 'node:zlib';
import { parse } from 'csv-parse';
import { z } from 'zod';
import { organisationSchema } from './domain.ts';

export async function readOrganisations(path: string): Promise<string[]> {
  const content = (await isGzip(path) ? await readCompressed(path) : await readFile(path, 'utf8')).replace(/^\uFEFF/,'');
  return content.split(/\r?\n/).filter(line => line.trim()).map((line, index) => {
    let raw: unknown;
    try { raw = JSON.parse(line); } catch { raw = line.trim(); }
    if (raw !== null && typeof raw === 'object') {
      const record = z.record(z.unknown()).parse(raw);
      raw = record.organisation_number ?? record.organisasjonsnummer ?? record.orgnr;
    }
    const result = organisationSchema.safeParse(typeof raw === 'number' ? String(raw) : raw);
    if (!result.success) throw new Error(`Invalid organisation number at input line ${index + 1}`);
    return result.data;
  });
}
async function readCompressed(path: string): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of createReadStream(path).pipe(createGunzip())) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}
export async function readBulk(path: string, wanted: Set<string>): Promise<Map<string, Record<string, unknown>>> {
  const input = createReadStream(path);
  const stream = await isGzip(path) ? input.pipe(createGunzip()) : input;
  const rows = stream.pipe(parse({ columns: true, bom: true, skip_empty_lines: true }));
  const result = new Map<string, Record<string, unknown>>();
  for await (const row of rows) {
    const org = typeof row?.organisasjonsnummer==='string'?row.organisasjonsnummer:undefined;
    if (org && wanted.has(org)) result.set(org, z.record(z.string()).parse(row));
  }
  return result;
}
async function isGzip(path:string){const file=await open(path,'r');try{const bytes=Buffer.alloc(2);await file.read(bytes,0,2,0);return bytes[0]===0x1f&&bytes[1]===0x8b;}finally{await file.close();}}
