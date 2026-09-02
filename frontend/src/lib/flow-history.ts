// Cronologia del percorso guidato. I passi vivono in `useState` e non toccavano
// `history`: il pulsante Indietro del browser — e la gesture di ritorno, che su
// Android è il gesto di navigazione principale — usciva dall'app invece di
// riportare al passo precedente.
//
// Qui sta solo il cammino percorso. Le chiamate a `history.pushState` e
// l'ascolto di `popstate` restano nella pagina, perché toccano il documento.
// Il modello è quello del browser: un passo nuovo taglia ciò che stava avanti,
// mentre indietro e avanti si limitano a spostare la profondità. Serve
// entrambe le direzioni: dedurre il ritorno da una mappa di passi non regge i
// percorsi che ne saltano uno (counselor già scelto, profilo caricato da PDF).

export interface Trail<S> {
    // Il cammino, dal primo passo in poi.
    steps: S[];
    // Posizione corrente lungo il cammino, contata da 1.
    depth: number;
}

export function startTrail<S>(step: S): Trail<S> {
    return { steps: [step], depth: 1 };
}

export function enterStep<S>(trail: Trail<S>, step: S): Trail<S> {
    if (trail.steps[trail.depth - 1] === step) return trail;
    const steps = [...trail.steps.slice(0, trail.depth), step];
    return { steps, depth: steps.length };
}

// Indietro o avanti: la profondità arriva dall'entrata di cronologia. Fuori
// dal cammino noto — succede rientrando nella pagina da un'altra rotta, dove
// il cammino riparte da zero — non si sposta nulla.
export function stepAtDepth<S>(trail: Trail<S>, depth: number): { trail: Trail<S>; step: S | null } {
    if (!Number.isInteger(depth) || depth < 1 || depth > trail.steps.length) {
        return { trail, step: null };
    }
    return { trail: { ...trail, depth }, step: trail.steps[depth - 1] };
}
