import {test} from 'node:test';import assert from 'node:assert/strict';import {htmlText,websiteLinks} from '../src/website-links.ts';
test('quoted template attributes containing > never leak JavaScript into preserved readable evidence',()=>{
 const raw=`<html><body><form @submit.prevent="() => { location.href = 'https://acme.no/search'; }"><input placeholder="Country > Other"></form><p>We supply marine safety equipment.</p><footer>Acme AS. Org.nr 999111222.</footer><a @click="() => openMenu()" href="/contact">Contact</a></body></html>`;
 const text=htmlText(raw);assert.ok(!text.includes('location.href'));assert.ok(!text.includes('openMenu()'));assert.ok(text.includes('We supply marine safety equipment.'));assert.ok(text.includes('Org.nr 999111222.'));assert.deepEqual(websiteLinks(raw,'https://acme.no/'),['https://acme.no/contact']);
});
test('real body details, footer identity and structured evidence survive while executable code and non-rendered templates do not',()=>{
 const raw=`<html><body><script>const secretTemplate = 'not publisher prose';</script><style>.x {content:'css prose'}</style><template>No current vacancies</template><p>We run an RAS nursery, then grow fish in the lake.</p><p>Monday–Friday 08:00–16:00</p><footer>Acme AS. Org.nr 999111222.</footer><script type="application/ld+json">{"@type":"Organization","name":"Acme AS"}</script></body></html>`;
 const text=htmlText(raw);assert.ok(!text.includes('secretTemplate'));assert.ok(!text.includes('css prose'));assert.ok(!text.includes('No current vacancies'));assert.ok(text.includes('RAS nursery'));assert.ok(text.includes('Monday–Friday'));assert.ok(text.includes('Org.nr 999111222.'));assert.ok(text.includes('"name":"Acme AS"'));
});
