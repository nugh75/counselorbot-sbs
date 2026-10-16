// Un pannello a disclosure si chiude quando il focus passa a un elemento fuori
// dal suo contenitore (Tab oltre l'ultima voce). Senza destinazione il focus
// lascia la pagina (confirm nativo, cambio finestra): il pannello resta aperto.
export function focusLeaves(container: { contains(node: Node | null): boolean } | null, next: EventTarget | null): boolean {
    return Boolean(container && next && !container.contains(next as Node));
}
