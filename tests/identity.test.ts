import{test}from'node:test';
import assert from'node:assert/strict';
import{identityFields}from'../src/identity.ts';
test('frozen CSV and live API identity normalize to compatible typed fields',()=>{
 const flat=identityFields({navn:'Acme AS','organisasjonsform.kode':'AS','forretningsadresse.adresse':'Street 1','forretningsadresse.postnummer':'0123','forretningsadresse.poststed':'OSLO','naeringskode1.kode':'62.100','naeringskode1.beskrivelse':'Software',antallAnsatte:'0',harRegistrertAntallAnsatte:'true'});
 const live=identityFields({navn:'Acme AS',organisasjonsform:{kode:'AS'},forretningsadresse:{adresse:['Street 1'],postnummer:'0123',poststed:'OSLO'},naeringskode1:{kode:'62.100',beskrivelse:'Software'},antallAnsatte:0,harRegistrertAntallAnsatte:true});
 assert.deepEqual(flat,live);assert.equal(flat.registered_employee_count,0);
 assert.equal(identityFields({antallAnsatte:'',harRegistrertAntallAnsatte:'true'}).registered_employee_count,undefined);
 assert.equal(identityFields({antallAnsatte:'0',harRegistrertAntallAnsatte:'false'}).registered_employee_count,undefined);
});

test('registered postal contact remains separate from the business address and never invented',()=>{const x=identityFields({forretningsadresse:{adresse:['Løkkeveien107'],postnummer:'4007',poststed:'STAVANGER'},postadresse:{adresse:['Postboks50Sentrum'],postnummer:'4001',poststed:'STAVANGER'}});assert.deepEqual(x.registered_postal_address,{adresse:['Postboks50Sentrum'],postnummer:'4001',poststed:'STAVANGER'});assert.notDeepEqual(x.registered_address,x.registered_postal_address);assert.equal(identityFields({forretningsadresse:{adresse:['Street1']}}).registered_postal_address,undefined);const y=identityFields({'postadresse.adresse':'c/oManager,POBox3','postadresse.postnummer':'0123','postadresse.poststed':'OSLO'});assert.deepEqual(y.registered_postal_address,{adresse:['c/oManager,POBox3'],postnummer:'0123',poststed:'OSLO'});assert.equal(identityFields({postadresse:{}}).registered_postal_address,undefined);});
