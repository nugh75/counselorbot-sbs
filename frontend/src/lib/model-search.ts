/** Filtering must never change the selected model or write configuration. */
export function modelSearchOptions(models: readonly string[], selected: string, query: string, labels: Readonly<Record<string, string>> = {}) {
    const all = [...new Set([...(selected ? [selected] : []), ...models])];
    const needle = query.trim().toLocaleLowerCase();
    const matches = needle
        ? all.filter(id => `${id} ${labels[id] || ''}`.toLocaleLowerCase().includes(needle))
        : all;
    return { matches, total: all.length, selectedHidden: !!selected && !matches.includes(selected) };
}

export function validModelId(value: string): boolean {
    return !!value.trim() && !/\s/.test(value.trim());
}
