interface LocaleAvailableInstrument {
    code: string;
    available_locales: string[];
}

export function instrumentAvailableInLocale(
    instruments: LocaleAvailableInstrument[],
    code: string,
    locale: string,
): boolean {
    const normalizedCode = code.toLowerCase();
    const normalizedLocale = locale.toLowerCase();
    return instruments.some((instrument) => (
        instrument.code.toLowerCase() === normalizedCode
        && instrument.available_locales.some((available) => available.toLowerCase() === normalizedLocale)
    ));
}
