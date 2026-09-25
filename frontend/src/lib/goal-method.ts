import type { MethodItem, MethodRef, PersonalStrategy } from './goals';

type OwnRef = MethodRef & { kind: 'own' };
type CertifiedRef = MethodRef & { kind: 'certified' };

/** Riferimenti del metodo senza i testi risolti, come li vuole il backend. */
export function methodRefs(items: MethodItem[]): MethodRef[] {
    return items.map((item): MethodRef => item.kind === 'own'
        ? { kind: 'own', id: (item satisfies OwnRef).id }
        : { kind: 'certified', slug: (item satisfies CertifiedRef).slug });
}

/** Due riferimenti coincidono quando kind e chiave coincidono. */
export function sameRef(a: MethodRef, b: MethodRef): boolean {
    if (a.kind !== b.kind) return false;
    return a.kind === 'own'
        ? (a as OwnRef).id === (b as OwnRef).id
        : (a as CertifiedRef).slug === (b as CertifiedRef).slug;
}

/** Opzioni del selettore: le proprie prima, senza quelle già scelte. */
export function pickerOptions(own: PersonalStrategy[], certified: { slug: string; name: string }[], chosen: MethodRef[]) {
    const taken = new Set(chosen.map(ref => ref.kind === 'own' ? `o:${ref.kind === 'own' && ref.id}` : `c:${ref.kind === 'certified' && ref.slug}`));
    return {
        own: own.filter(s => !taken.has(`o:${s.id}`)),
        certified: certified.filter(s => !taken.has(`c:${s.slug}`)),
    };
}
