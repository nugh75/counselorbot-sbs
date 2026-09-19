'use client';

import { useState, type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n-context';
import { CertifiedStrategiesPanel } from '@/components/admin/CertifiedStrategiesPanel';
import { CertifiedReadingsPanel } from '@/components/admin/CertifiedReadingsPanel';

const TEXTS = {
    it: { title: 'Cataloghi', description: 'Aggiungi strategie e materiali al catalogo comune. Puoi salvare una bozza o pubblicare direttamente: i contenuti pubblicati possono essere consigliati agli studenti.', strategies: 'Strategie', readings: 'Libri, film e altri materiali' },
    en: { title: 'Catalogs', description: 'Add strategies and resources to the shared catalog. Save a draft or publish directly: published content can be recommended to students.', strategies: 'Strategies', readings: 'Books, films and other resources' },
    es: { title: 'Catálogos', description: 'Añade estrategias y materiales al catálogo común. Puedes guardar un borrador o publicar directamente: el contenido publicado puede recomendarse al alumnado.', strategies: 'Estrategias', readings: 'Libros, películas y otros materiales' },
    fr: { title: 'Catalogues', description: 'Ajoutez des stratégies et des ressources au catalogue commun. Enregistrez un brouillon ou publiez directement : les contenus publiés peuvent être recommandés aux étudiants.', strategies: 'Stratégies', readings: 'Livres, films et autres ressources' },
    de: { title: 'Kataloge', description: 'Ergänzen Sie den gemeinsamen Katalog um Strategien und Materialien. Speichern Sie einen Entwurf oder veröffentlichen Sie direkt: veröffentlichte Inhalte können Lernenden empfohlen werden.', strategies: 'Strategien', readings: 'Bücher, Filme und weitere Materialien' },
    sv: { title: 'Kataloger', description: 'Lägg till strategier och material i den gemensamma katalogen. Spara ett utkast eller publicera direkt: publicerat innehåll kan rekommenderas till studenter.', strategies: 'Strategier', readings: 'Böcker, filmer och annat material' },
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
            <CatalogSection title={texts.strategies}><CertifiedStrategiesPanel /></CatalogSection>
            <CatalogSection title={texts.readings}><CertifiedReadingsPanel /></CatalogSection>
        </section>
    );
}
