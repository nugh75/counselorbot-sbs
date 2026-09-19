'use client';

import { useState, type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { CertifiedStrategiesPanel } from '@/components/admin/CertifiedStrategiesPanel';
import { CertifiedReadingsPanel } from '@/components/admin/CertifiedReadingsPanel';
import { GoalCatalogEditor } from '@/components/goals/GoalCatalogEditor';
import { goalText } from '@/lib/i18n-goals';

const TEXTS = {
    it: { title: 'Cataloghi', description: 'Crea e aggiorna obiettivi, strategie e materiali. Dai contenuti pubblicati scegli cosa assegnare a una persona, un gruppo o una classe.', strategies: 'Strategie', readings: 'Libri, film e altri materiali' },
    en: { title: 'Catalogs', description: 'Create and update goals, strategies and resources. Assign published content to a person, group or class.', strategies: 'Strategies', readings: 'Books, films and other resources' },
    es: { title: 'Catálogos', description: 'Crea y actualiza objetivos, estrategias y materiales. Asigna contenidos publicados a una persona, un grupo o una clase.', strategies: 'Estrategias', readings: 'Libros, películas y otros materiales' },
    fr: { title: 'Catalogues', description: 'Créez et mettez à jour des objectifs, des stratégies et des ressources. Attribuez les contenus publiés à une personne, un groupe ou une classe.', strategies: 'Stratégies', readings: 'Livres, films et autres ressources' },
    de: { title: 'Kataloge', description: 'Erstellen und bearbeiten Sie Ziele, Strategien und Materialien. Weisen Sie veröffentlichte Inhalte einer Person, Gruppe oder Klasse zu.', strategies: 'Strategien', readings: 'Bücher, Filme und weitere Materialien' },
    sv: { title: 'Kataloger', description: 'Skapa och uppdatera mål, strategier och material. Tilldela publicerat innehåll till en person, grupp eller klass.', strategies: 'Strategier', readings: 'Böcker, filmer och annat material' },
};

function CatalogSection({ title, children }: { title: string; children: ReactNode }) {
    const [loaded, setLoaded] = useState(false);
    return (
        <details className="min-w-0 rounded-xl border border-slate-200 bg-white"
            onToggle={(event) => { if (event.currentTarget.open) setLoaded(true); }}>
            <summary className="cursor-pointer rounded-xl p-4 font-semibold text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">{title}</summary>
            <div className="min-w-0 border-t border-slate-200 p-3 sm:p-4">
                {loaded && children}
            </div>
        </details>
    );
}

export function TeacherCatalogs() {
    const { lang } = useI18n();
    const texts = TEXTS[lang];
    return (
        <section aria-labelledby="teacher-catalogs-title" className="mt-10 min-w-0 space-y-4">
            <div>
                <h2 id="teacher-catalogs-title" className="text-xl font-bold text-slate-800">{texts.title}</h2>
                <p className="mt-1 text-sm text-slate-600">{texts.description}</p>
            </div>
            <CatalogSection title={goalText(lang, 'catalog')}><GoalCatalogEditor /></CatalogSection>
            <CatalogSection title={texts.strategies}><CertifiedStrategiesPanel /></CatalogSection>
            <CatalogSection title={texts.readings}><CertifiedReadingsPanel /></CatalogSection>
        </section>
    );
}
