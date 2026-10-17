import {test} from 'node:test';
import assert from 'node:assert/strict';
import {locationContext,descriptionRepresentationProblem} from '../src/semantic-context.ts';
import {knownAccessRestriction} from '../src/source-access-policy.ts';

// Actual source passages adjudicated in the second source-context review.
const workshop='Guitarish holder til på Bryggen i Bergen , hvor vi har verksted og jobber med gitarer, bass og annet utstyr.';
const plant='Anlegget vårt på Notodden har 5.000m2 med moderne og ryddige produksjonslokaler hvor vi utfører kjemiske prosesser, tynnfilm, epoxy maling og militære malingssystemer, samt kombinasjonssystemer.';
test('explicit own workshop and production premises retain their operating role and self-reported basis',()=>{
 const w=locationContext(workshop,workshop,workshop),p=locationContext(plant,plant,plant);
 assert.equal(w.location_kind,'company_reported_workshop');assert.equal(w.operating_location_established,true);
 assert.equal(p.location_kind,'company_reported_production_plant');assert.equal(p.operating_location_established,true);
 assert.equal(w.independent_site_visit,false);assert.equal(p.independent_site_visit,false);
});
test('workshop context does not convert a territory, postal address or event into an operating site',()=>{
 const area='Vi leverer til kunder i region Bergen og omegn.';
 assert.equal(locationContext('Vi har verksted.\n'+area,area,area).location_kind,'service_area');
 assert.equal(locationContext('Verksted\nPostadresse: Postboks 12','Postboks 12','Postboks 12').location_kind,'postal_contact');
 assert.notEqual(locationContext('Verksted\nKonferansen arrangeres på Bergen','Bergen','Bergen').operating_location_established,true);
 assert.notEqual(locationContext('Kundens verksted i Bergen','Kundens verksted i Bergen','Kundens verksted i Bergen').operating_location_established,true);
});
test('reviewed job aggregator restrictions apply to subdomains and reject suffix lookalikes',()=>{
 for(const host of ['jobbsafari.no','www.jobbsafari.no','lonna.no','www.lonna.no'])assert.ok(knownAccessRestriction('https://'+host+'/job/example'));
 assert.equal(knownAccessRestriction('https://jobbsafari.no.example.org/job'),undefined);
 assert.equal(knownAccessRestriction('https://notlonna.no/job'),undefined);
});
test('the actual Myre geographic sentence is not a substantive business description',()=>{
 assert.match(descriptionRepresentationProblem('Myre Borettslag ligger \r\npå \r\nÅssiden i Drammen kommune.')??'',/location-only/);
 assert.equal(descriptionRepresentationProblem('Vi holder til i Bergen og tilbyr reparasjon av gitarer.'),undefined);
});
