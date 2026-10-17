import {test} from 'node:test';import assert from 'node:assert/strict';import {supportedDates,supportedTemporalDate,temporalDateQualifiers} from '../src/dates.ts';
test('historical source dates before2000 retain actual precision without inventing an incorporation day',()=>{
 assert.equal(supportedTemporalDate('Vi blei etablert i 1991.','1991'),true);assert.equal(supportedTemporalDate('Vi blei etablert i 1991.','1991-01-01'),false);assert.equal(temporalDateQualifiers('1991','event_date').date_precision,'year');
 assert.deepEqual(supportedDates('Oppstart 15. mars 1899. Ny fabrikk åpnet 1991-08-17.'),['1991-08-17','1899-03-15']);assert.equal(supportedTemporalDate('Et varenummer 19910 er ikke et år.','1991'),false);assert.deepEqual(supportedDates('29.02.1900'),[]);
});
