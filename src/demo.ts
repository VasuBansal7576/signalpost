import { evidenceFor, type Claim, type Evidence, type Proposal } from './domain.ts';
import type { Job } from './store.ts';
import type { ResearchService } from './service.ts';

export function demoResearch(service: ResearchService, job: Job, revision = 1): { baseline: { claims: Claim[]; evidence: Evidence[]; errors: [] }; proposals: Proposal[] } {
  const name = `Fictional Company ${job.organisation_number} AS`;
  const identity = { organisasjonsnummer: job.organisation_number, navn: name, hjemmeside: `https://company-${job.organisation_number}.example.org` };
  const registry = service.save(job, `https://data.brreg.no/enhetsregisteret/api/enheter/${job.organisation_number}`, JSON.stringify(identity), 'fixture');
  const support = evidenceFor(registry, JSON.stringify(name));
  const description = 'We build monitoring software for renewable energy operators.';
  const hiring = revision === 1 ? 'We are hiring a software engineer in Oslo.' : 'We are hiring a data engineer in Bergen.';
  const text = `${name}\nOrganisation number ${job.organisation_number}\n${description}\n${hiring}\nOur office is in Oslo.\nOn 2026-10-01 we released version 2.\n`;
  const source = service.save(job, `${identity.hjemmeside}/about`, text, 'fixture');
  return {
    baseline: { claims: [{ field: 'legal_name', value: name, availability: 'available', confidence: null, evidence_ids: [support.id] }], evidence: [support], errors: [] },
    proposals: [
      { field: 'business_description', value: description, quote: description, snapshot_id: source.id, effective_date: null },
      { field: 'hiring', value: hiring, quote: hiring, snapshot_id: source.id, effective_date: null },
      { field: 'locations', value: 'Oslo', quote: 'Our office is in Oslo.', snapshot_id: source.id, effective_date: null },
      { field: 'public_activity', value: 'released version 2', quote: 'On 2026-10-01 we released version 2.', snapshot_id: source.id, effective_date: '2026-10-01' },
    ],
  };
}
