// Catalogo strumenti letto dal backend. Sostituisce test-administrations.ts:
// gli item vivono nel DB, non in una seconda copia dentro il bundle.
import { apiFetch } from './auth';

export interface InstrumentSummary {
    code: string;
    name_i18n: Record<string, string>;
    status: string;
    report_scale_type: string;
    item_count: number;
    locales: Record<string, string>;        // lingua -> stato di certificazione
    available_locales: string[];            // le lingue somministrabili
}

export interface InstrumentRuleFactor {
    code: string;
    dimension: string | null;
    orientation: string;
    is_interpretation_inverted: boolean;
    label: string;
    item_numbers: number[];
    reverse_item_numbers: number[];
}

export interface InstrumentRuleItem {
    item_number: number;
    factor_code: string | null;
    reverse_scoring: boolean;
    active: boolean;
    text: string | null;
}

export interface InstrumentRules {
    instrument: {
        code: string;
        name: string;
        response_scale_min: number;
        response_scale_max: number;
        response_labels: string[] | null;
        report_scale_type: string;
        status: string;
    };
    uses_validated_norms: boolean;
    locale_status: string;
    available_locales: string[];
    factors: InstrumentRuleFactor[];
    items: InstrumentRuleItem[];
}

export interface RulesUnavailable {
    unavailable: true;
    status: string;
    availableLocales: string[];
}

export async function fetchInstruments(): Promise<InstrumentSummary[]> {
    const res = await apiFetch('/api/instruments');
    if (!res.ok) throw new Error(`GET /api/instruments: ${res.status}`);
    return res.json();
}

// 409 non e' un errore di rete: e' la risposta "non ancora in questa lingua",
// con lo stato e le lingue che invece funzionano.
export async function fetchRules(
    code: string,
    locale: string,
): Promise<InstrumentRules | RulesUnavailable> {
    const res = await apiFetch(`/api/instruments/${code}/rules?locale=${locale}`);
    if (res.status === 409) {
        const body = await res.json().catch(() => null);
        const detail = body?.detail ?? {};
        return {
            unavailable: true,
            status: detail.status ?? 'draft',
            availableLocales: detail.available_locales ?? [],
        };
    }
    if (!res.ok) throw new Error(`GET /api/instruments/${code}/rules: ${res.status}`);
    return res.json();
}

export function instrumentName(summary: InstrumentSummary, lang: string): string {
    return summary.name_i18n[lang] ?? summary.name_i18n.en ?? summary.code;
}
