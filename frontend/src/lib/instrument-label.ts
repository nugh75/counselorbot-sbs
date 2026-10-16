// Short instrument name in the UI language (`q.<code>.name`). Instruments with
// no translated short name keep their catalogue name; dynamic instruments,
// absent from the static catalogue, show their code.
export function instrumentLabel(code: string, catalogueName: string | undefined, translate: (key: string, fallback: string) => string): string {
    return translate(`q.${code}.name`, catalogueName ?? code);
}
