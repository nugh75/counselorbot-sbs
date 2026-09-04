export interface ReadingRecommendation {
    slug: string;
    recommendation_type?: 'reading';
    turn_index?: number | null;
    title?: string;
    creators?: string;
    year?: string;
    publisher?: string;
    kind?: string;
    kind_label?: string;
    summary?: string;
    why?: string;
    synopsis?: string;
    languages?: string[];
    where?: string;
    audience?: string[];
    warning?: string;
}

export interface StrategyRecommendation {
    slug: string;
    recommendation_type?: 'strategy';
    turn_index?: number | null;
    name?: string;
    description?: string;
    recommended_when?: string;
}

export interface RecommendationCatalog {
    reading: ReadingRecommendation[];
    strategy: StrategyRecommendation[];
}

export const EMPTY_RECOMMENDATIONS: RecommendationCatalog = {
    reading: [],
    strategy: [],
};

function normalizeBucket<T extends { slug: string }>(value: unknown): T[] {
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    const result: T[] = [];
    for (const item of value) {
        if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
        const slug = typeof Reflect.get(item, 'slug') === 'string'
            ? Reflect.get(item, 'slug').trim()
            : '';
        if (!slug || seen.has(slug)) continue;
        seen.add(slug);
        result.push({ ...item, slug } as T);
    }
    return result;
}

export function normalizeRecommendationCatalog(value: unknown): RecommendationCatalog {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { reading: [], strategy: [] };
    }
    return {
        reading: normalizeBucket<ReadingRecommendation>(Reflect.get(value, 'reading')),
        strategy: normalizeBucket<StrategyRecommendation>(Reflect.get(value, 'strategy')),
    };
}
