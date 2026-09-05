const labels: Record<string, Record<string, string>> = {
    it: { panel: 'Pannello', panelTitle: 'Percorso e risorse', show: 'Mostra pannello', hide: 'Nascondi pannello', narrow: 'Riduci larghezza del pannello', widen: 'Aumenta larghezza del pannello', resize: 'Larghezza del pannello: usa le frecce per regolarla', resources: 'Risorse disponibili', step: 'Passo', navigation: 'Avanzamento del percorso' },
    en: { panel: 'Panel', panelTitle: 'Path and resources', show: 'Show panel', hide: 'Hide panel', narrow: 'Narrow the panel', widen: 'Widen the panel', resize: 'Panel width: use arrow keys to adjust', resources: 'Available resources', step: 'Step', navigation: 'Path navigation' },
    es: { panel: 'Panel', panelTitle: 'Recorrido y recursos', show: 'Mostrar panel', hide: 'Ocultar panel', narrow: 'Reducir el ancho del panel', widen: 'Aumentar el ancho del panel', resize: 'Ancho del panel: usa las flechas para ajustarlo', resources: 'Recursos disponibles', step: 'Paso', navigation: 'Avance del recorrido' },
    fr: { panel: 'Panneau', panelTitle: 'Parcours et ressources', show: 'Afficher le panneau', hide: 'Masquer le panneau', narrow: 'Réduire la largeur du panneau', widen: 'Augmenter la largeur du panneau', resize: 'Largeur du panneau : utilisez les flèches pour ajuster', resources: 'Ressources disponibles', step: 'Étape', navigation: 'Avancement du parcours' },
    de: { panel: 'Seitenleiste', panelTitle: 'Verlauf und Ressourcen', show: 'Seitenleiste anzeigen', hide: 'Seitenleiste ausblenden', narrow: 'Seitenleiste schmaler machen', widen: 'Seitenleiste breiter machen', resize: 'Breite der Seitenleiste: mit Pfeiltasten anpassen', resources: 'Verfügbare Ressourcen', step: 'Schritt', navigation: 'Navigation durch den Verlauf' },
    sv: { panel: 'Panel', panelTitle: 'Steg och resurser', show: 'Visa panelen', hide: 'Dölj panelen', narrow: 'Gör panelen smalare', widen: 'Gör panelen bredare', resize: 'Panelens bredd: justera med piltangenterna', resources: 'Tillgängliga resurser', step: 'Steg', navigation: 'Navigering mellan steg' },
};

export function chatLayoutLabel(locale: string, key: string): string {
    return (labels[locale.slice(0, 2)] ?? labels.en)[key] ?? labels.en[key] ?? key;
}
