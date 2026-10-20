const copy = {
    it: { open: 'Approfondisci un tema', title: 'Tema da approfondire', start: 'Apri approfondimento', cancel: 'Annulla', branch: 'Approfondimento', from: 'Dal passo', back: 'Torna al percorso', agreement: 'Accetta il patto iniziale per scegliere gli altri passi.', visited: 'Visitato', completed: 'Completato', resume: 'Riapri approfondimento' },
    en: { open: 'Explore a topic', title: 'Topic to explore', start: 'Open exploration', cancel: 'Cancel', branch: 'Exploration', from: 'From step', back: 'Return to the path', agreement: 'Accept the initial agreement to select other steps.', visited: 'Visited', completed: 'Completed', resume: 'Reopen exploration' },
    es: { open: 'Profundizar en un tema', title: 'Tema para profundizar', start: 'Abrir profundización', cancel: 'Cancelar', branch: 'Profundización', from: 'Desde el paso', back: 'Volver al recorrido', agreement: 'Acepta el acuerdo inicial para elegir otros pasos.', visited: 'Visitado', completed: 'Completado', resume: 'Reabrir profundización' },
    fr: { open: 'Approfondir un sujet', title: 'Sujet à approfondir', start: 'Ouvrir un approfondissement', cancel: 'Annuler', branch: 'Approfondissement', from: 'Depuis l’étape', back: 'Revenir au parcours', agreement: 'Acceptez l’accord initial pour choisir les autres étapes.', visited: 'Visité', completed: 'Terminé', resume: 'Rouvrir l’approfondissement' },
    de: { open: 'Ein Thema vertiefen', title: 'Thema zur Vertiefung', start: 'Vertiefung öffnen', cancel: 'Abbrechen', branch: 'Vertiefung', from: 'Aus Schritt', back: 'Zum Ablauf zurückkehren', agreement: 'Akzeptiere die anfängliche Vereinbarung, um andere Schritte zu wählen.', visited: 'Besucht', completed: 'Abgeschlossen', resume: 'Vertiefung erneut öffnen' },
    sv: { open: 'Fördjupa ett ämne', title: 'Ämne att fördjupa', start: 'Öppna fördjupning', cancel: 'Avbryt', branch: 'Fördjupning', from: 'Från steg', back: 'Tillbaka till flödet', agreement: 'Godkänn den inledande överenskommelsen för att välja andra steg.', visited: 'Besökt', completed: 'Slutfört', resume: 'Öppna fördjupningen igen' },
};

export function navigationCopy(locale: string) {
    return copy[locale as keyof typeof copy] ?? copy.it;
}
