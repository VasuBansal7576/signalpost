import{test}from'node:test';import assert from'node:assert/strict';import{websiteLinks,htmlText}from'../src/website-links.ts';
test('navigation excludes script/runtime URLs but preserves anchors and structured company links',()=>{
 const html='<script>const fake="https://facebook.com/anothercompany"; const asset="https://cdn.example.com/run.js";</script><a href="/kontakt">Kontakt</a><script type="application/ld+json">{"@type":"Organization","legalName":"Acme Technology AS","taxID":"999111222","sameAs":["https://www.facebook.com/AcmeTechnology"]}</script>';
 const links=websiteLinks(html,'https://acme.no/');assert.deepEqual(links,['https://acme.no/kontakt','https://www.facebook.com/AcmeTechnology']);
 assert.ok(htmlText(html).includes('"taxID":"999111222"'),'legal structured data must survive extraction');
});

test('provider markdown, protocol-relative and legacy HTTP links resolve to inspectable HTTPS URLs',()=>{
 assert.deepEqual(websiteLinks('[Kontakt](/kontakt) [Careers](../careers) [Account](//www.linkedin.com/company/acme-technology) [Facebook](http://facebook.com/AcmeTechnology)','https://acme.no/en/about').sort(),['https://www.linkedin.com/company/acme-technology','https://facebook.com/AcmeTechnology','https://acme.no/kontakt','https://acme.no/careers'].sort());
});
