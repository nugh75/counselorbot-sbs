'use client';

import { Card } from '@/components/ui/Card';
import { factorTranslationKey } from '@/lib/questionnaires';
import { useI18n } from '@/lib/i18n-context';
import { riasecText } from '@/lib/i18n-riasec';

export interface RiasecDimension {
    code: string;
    raw_total: number;
    max_total?: number;
}

const AREAS = ['R', 'I', 'A', 'S', 'E', 'C'] as const;
const CENTER = 150;
const RADIUS = 104;
const MAX_TOTAL = 40;

function point(index: number, ratio: number) {
    const angle = (-90 + index * 60) * (Math.PI / 180);
    return [CENTER + Math.cos(angle) * RADIUS * ratio, CENTER + Math.sin(angle) * RADIUS * ratio];
}

function ordered(dimensions: RiasecDimension[]): RiasecDimension[] {
    const byCode = new Map(dimensions.map((d) => [d.code, d]));
    return AREAS.map((code) => byCode.get(code) ?? { code, raw_total: 0, max_total: MAX_TOTAL })
        .slice()
        .sort((a, b) => {
            if (b.raw_total !== a.raw_total) return b.raw_total - a.raw_total;
            return AREAS.indexOf(a.code as (typeof AREAS)[number]) - AREAS.indexOf(b.code as (typeof AREAS)[number]);
        });
}

function HollandHexagon({ dimensions, label }: { dimensions: RiasecDimension[]; label: string }) {
    const { tf } = useI18n();
    const byCode = new Map(dimensions.map((d) => [d.code, d]));
    const values = AREAS.map((code) => {
        const value = byCode.get(code)?.raw_total ?? 0;
        return Math.max(0, Math.min(1, value / MAX_TOTAL));
    });
    const outer = AREAS.map((_, index) => point(index, 1).join(',')).join(' ');
    const valuePoints = values.map((ratio, index) => point(index, ratio).join(',')).join(' ');

    return (
        <svg viewBox="0 0 300 300" role="img" aria-label={label} className="mx-auto h-auto w-full max-w-[22rem]">
            <title>{label}</title>
            <polygon points={outer} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-line-strong" />
            {AREAS.map((code, index) => {
                const [x, y] = point(index, 1);
                const [lx, ly] = point(index, 1.17);
                return (
                    <g key={code}>
                        <line x1={CENTER} y1={CENTER} x2={x} y2={y} stroke="currentColor" strokeWidth="1" className="text-line" />
                        <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle" className="fill-ink text-[11px] font-semibold">
                            {code}
                        </text>
                        <text x={lx} y={ly + 12} textAnchor="middle" dominantBaseline="middle" className="fill-ink-muted text-[7px]">
                            {tf(factorTranslationKey('RIASEC', code, 'name'), code)}
                        </text>
                    </g>
                );
            })}
            <polygon points={valuePoints} className="fill-brand stroke-brand" strokeWidth="2" style={{ fillOpacity: 0.2 }} />
        </svg>
    );
}

function TopPaths({ dimensions }: { dimensions: RiasecDimension[] }) {
    const { lang, tf } = useI18n();
    const top = ordered(dimensions).slice(0, 3);
    return (
        <div className="space-y-3">
            <h4 className="text-sm font-semibold text-ink">{riasecText(lang, 'student.top')}</h4>
            <ul className="space-y-2">
                {top.map((dimension) => (
                    <li key={dimension.code} className="rounded-control border border-line bg-surface-sunken p-3">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-sm font-semibold text-ink">
                                {tf(factorTranslationKey('RIASEC', dimension.code, 'name'), dimension.code)}
                            </span>
                            <span className="font-mono text-xs text-ink-muted">{dimension.raw_total}/40</span>
                        </div>
                        <p className="mt-1 text-sm text-ink-body">{riasecText(lang, `student.area.${dimension.code}`)}</p>
                    </li>
                ))}
            </ul>
            <p className="text-xs leading-relaxed text-ink-muted">{riasecText(lang, 'student.note')}</p>
        </div>
    );
}

function TeacherDimensions({ dimensions, code }: { dimensions: RiasecDimension[]; code?: string | null }) {
    const { lang, tf } = useI18n();
    return (
        <div className="space-y-3">
            {code && (
                <div className="rounded-control border border-brand-line bg-brand-soft p-3">
                    <p className="text-xs font-semibold text-ink-muted">{riasecText(lang, 'teacher.code')}</p>
                    <p className="font-mono text-2xl font-semibold tracking-widest text-ink" data-holland-code>
                        {code}
                    </p>
                </div>
            )}
            <h4 className="text-sm font-semibold text-ink">{riasecText(lang, 'teacher.dimensions')}</h4>
            <ul className="space-y-1">
                {ordered(dimensions).map((dimension) => (
                    <li key={dimension.code} className="flex items-center justify-between gap-3 border-b border-line py-1 text-sm">
                        <span>
                            <span className="mr-2 font-mono font-semibold text-ink">{dimension.code}</span>
                            <span className="text-ink-body">
                                {tf(factorTranslationKey('RIASEC', dimension.code, 'name'), dimension.code)}
                            </span>
                        </span>
                        <span className="font-mono text-ink">{dimension.raw_total}/40</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export function RiasecProfile({
    dimensions,
    showCode = false,
    code = null,
}: {
    dimensions: RiasecDimension[];
    showCode?: boolean;
    code?: string | null;
}) {
    const { lang } = useI18n();
    return (
        <Card variant="flat" className="w-full space-y-4 py-4">
            <HollandHexagon dimensions={dimensions} label={riasecText(lang, showCode ? 'teacher.intro' : 'student.intro')} />
            <p className="text-sm text-ink-body">{riasecText(lang, showCode ? 'teacher.intro' : 'student.intro')}</p>
            {showCode ? <TeacherDimensions dimensions={dimensions} code={code} /> : <TopPaths dimensions={dimensions} />}
        </Card>
    );
}
