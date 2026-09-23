// Replace only the generated instrument prefix. Keep user titles and phase
// wording intact, including snapshots saved in another language.
export function resumeLabel(instrument: string, label: string | null | undefined, translate: (key: string, fallback: string) => string): string {
    const name = translate(`q.${instrument}.name`, instrument);
    if (!label || label === instrument) return name;
    if (label.startsWith(`${instrument} — `) || label.startsWith(`${instrument} - `)) {
        return name + label.slice(instrument.length);
    }
    return label;
}
