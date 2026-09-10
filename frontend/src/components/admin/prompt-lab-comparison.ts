export interface ComparisonMetric {
    language?: string; preset_id: number; variant_id: string; split: string;
    passed: number; total: number; errors: number;
}

// Keep model/language/split strata separate. Counts are repeated responses,
// not independent learners or a claim of educational efficacy.
export function compareCandidate(metrics: ComparisonMetric[], candidateId: string) {
    const baseline = metrics.filter((m) => m.variant_id === 'baseline' && ['validation', 'final'].includes(m.split));
    const candidate = metrics.filter((m) => m.variant_id === candidateId && ['validation', 'final'].includes(m.split));
    const pairs = candidate.flatMap((after) => {
        const before = baseline.find((m) => m.preset_id === after.preset_id && m.language === after.language && m.split === after.split);
        if (!before || before.total <= 0 || before.total !== after.total) return [];
        const delta = after.passed - before.passed;
        const direction = before.errors || after.errors ? 'incomplete' : delta > 0 ? 'pro' : delta < 0 ? 'con' : 'neutral';
        return [{ before, after, direction }];
    });
    return { pairs, incomplete: !pairs.length || pairs.length !== baseline.length || pairs.length !== candidate.length || pairs.some((p) => p.direction === 'incomplete') };
}
