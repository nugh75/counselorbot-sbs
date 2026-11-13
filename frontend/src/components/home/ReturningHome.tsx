'use client';

// «Attività e percorsi»: percorso di classe e catalogo strumenti condiviso
// (InstrumentCatalog, montato anche nell'Area studente).
// Le aree personali restano nella pagina personale, non in questa home.

import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/ui/PageHeader';
import { InstrumentCatalog } from '@/components/home/InstrumentCatalog';
import { QuestionnaireConfig, QuestionnaireType } from '@/lib/questionnaires';
import { useI18n } from '@/lib/i18n-context';
import { isClassContentHidden } from '@/lib/user-access';
import { type PausedChat } from '@/lib/catalog-status';
import { useUserAccess } from '@/lib/use-user-access';
import { ClassPathHeroList } from '@/components/profile/ClassPathHeroList';
import { parseStudentClassPaths, selectCurrentClassPath, type StudentClassPath } from '@/lib/class-paths';
import { classPathText } from '@/lib/i18n-class-paths';
import { apiFetch } from '@/lib/auth';

interface Props {
    // Ultima compilazione per strumento, in ISO; assente = mai compilato.
    lastCompiledAt: Partial<Record<QuestionnaireType, string>>;
    onStartInstrument: (questionnaire: QuestionnaireConfig) => void;
    onOpenIntro: () => void;
    paths?: StudentClassPath[] | null;
    onRefreshPaths?: () => Promise<void> | void;
    // Chat appena congelata col fiocco: si atterra qui e l'avviso dice come tornarci.
    pausedChat?: PausedChat | null;
    onDismissPausedChat?: () => void;
}

export function ReturningHome({
    lastCompiledAt,
    onStartInstrument,
    onOpenIntro,
    paths,
    onRefreshPaths,
    pausedChat = null,
    onDismissPausedChat,
}: Props) {
    const { t, lang } = useI18n();
    const { access } = useUserAccess();

    const [internalPaths, setInternalPaths] = useState<StudentClassPath[] | null>(paths ?? null);

    useEffect(() => {
        if (paths !== undefined) return;
        let alive = true;
        apiFetch('/api/user/paths')
            .then((res) => (res.ok ? res.json() : []))
            .then((data) => {
                if (alive) setInternalPaths(parseStudentClassPaths(data));
            })
            .catch(() => {
                if (alive) setInternalPaths([]);
            });
        return () => { alive = false; };
    }, [paths]);

    const handleReloadPaths = async () => {
        if (onRefreshPaths) {
            await onRefreshPaths();
        } else {
            try {
                const res = await apiFetch('/api/user/paths');
                if (res.ok) {
                    const data = await res.json();
                    setInternalPaths(parseStudentClassPaths(data));
                }
            } catch {
                // ignore
            }
        }
    };

    const activePaths = useMemo(() => paths !== undefined ? paths ?? [] : internalPaths ?? [], [paths, internalPaths]);
    const currentPath = useMemo(() => selectCurrentClassPath(activePaths), [activePaths]);

    return (
        <div className="flex flex-col gap-6 py-2">
            <section>
                <PageHeader title={t('base.instruments.title')} onBack={onOpenIntro} backLabel={t('base.backToIntro')} />
            </section>

            {!isClassContentHidden(access) && currentPath && (
                <section aria-labelledby="home-class-path-title">
                    <h2 id="home-class-path-title" className="sr-only">
                        {classPathText(lang, 'yourClassPath')}
                    </h2>
                    <ClassPathHeroList paths={activePaths} onReload={handleReloadPaths} collapsed />
                </section>
            )}

            <InstrumentCatalog
                id="home-catalog-section"
                lastCompiledAt={lastCompiledAt}
                onStartInstrument={onStartInstrument}
                pausedChat={pausedChat}
                onDismissPausedChat={onDismissPausedChat}
            />
        </div>
    );
}
