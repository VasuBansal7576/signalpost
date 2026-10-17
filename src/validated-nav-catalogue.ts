import {navCatalogueSchema,type NavCatalogue} from './nav-feed.ts';
import {canonical,hash} from './domain.ts';
type SealedCatalogue=Readonly<{sha256:string;catalogue:NavCatalogue}>;
const validated=new WeakMap<object,SealedCatalogue>();
function freeze(value:unknown,seen=new WeakSet<object>()){
 if(!value||typeof value!=='object'||seen.has(value))return;
 seen.add(value);for(const child of Object.values(value))freeze(child,seen);Object.freeze(value);
}
/** Validate and hash once, then make both input and published view immutable. */
export function sealNavCatalogue(input:unknown):SealedCatalogue{
 if(input&&typeof input==='object'){const prior=validated.get(input);if(prior)return prior;}
 const catalogue=navCatalogueSchema.parse(input),sha256=hash(canonical(catalogue));
 freeze(input);freeze(catalogue);const sealed=Object.freeze({sha256,catalogue});
 if(input&&typeof input==='object')validated.set(input,sealed);validated.set(catalogue,sealed);return sealed;
}
