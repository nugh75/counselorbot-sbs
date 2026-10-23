type Key = 'title' | 'purpose' | 'duration' | 'todo' | 'buttonsDesktop' | 'buttonsMobile' | 'close' | 'openGuide' | 'fullGuide' | 'closeGuide' | 'dismiss';

const labels: Record<string, Record<Key, string>> = {
    it: {
        title: 'Come funziona questa chat',
        purpose: 'Il counselor ti accompagna un tema alla volta e ti aiuta a riflettere su di te: non ci sono risposte giuste o sbagliate.',
        duration: 'Per una prima conversazione calcola circa 20–40 minuti. La chat si salva da sola dopo ogni risposta: puoi fermarti e riprendere.',
        todo: 'Rispondi con parole tue nel campo in basso e invia con Invio. Se un tema ti interessa, continua a scrivere per approfondirlo.',
        buttonsDesktop: 'Le frecce nella barra sotto la chat, a destra, tornano al passaggio precedente o vanno al successivo.',
        buttonsMobile: 'Le frecce nella barra sotto il campo di scrittura tornano al passaggio precedente o vanno al successivo.',
        close: 'Per chiudere, concludi la sessione all’ultimo passaggio oppure apri i tre punti e scegli «Congela sessione» per riprendere più tardi.',
        openGuide: 'Apri la guida',
        fullGuide: 'Apri la guida completa in una nuova scheda',
        closeGuide: 'Chiudi la guida',
        dismiss: 'Ho capito',
    },
    en: {
        title: 'How this chat works',
        purpose: 'The counselor walks you through one topic at a time and helps you reflect on yourself: there are no right or wrong answers.',
        duration: 'Allow about 20–40 minutes for a first conversation. The chat saves itself after every reply: you can stop and resume.',
        todo: 'Answer in your own words in the box below and send with Enter. If a topic interests you, keep writing to explore it further.',
        buttonsDesktop: 'The arrows in the bar below the chat, on the right, go back to the previous step or on to the next one.',
        buttonsMobile: 'The arrows in the bar below the writing box go back to the previous step or on to the next one.',
        close: 'To finish, end the session at the last step, or open the three dots and choose “Freeze session” to resume later.',
        openGuide: 'Open the guide',
        fullGuide: 'Open the full guide in a new tab',
        closeGuide: 'Close the guide',
        dismiss: 'Got it',
    },
    es: {
        title: 'Cómo funciona este chat',
        purpose: 'El counselor te acompaña un tema cada vez y te ayuda a reflexionar sobre ti: no hay respuestas correctas o incorrectas.',
        duration: 'Para una primera conversación calcula unos 20–40 minutos. El chat se guarda solo después de cada respuesta: puedes parar y retomar.',
        todo: 'Responde con tus palabras en el cuadro de abajo y envía con Intro. Si un tema te interesa, sigue escribiendo para profundizarlo.',
        buttonsDesktop: 'Las flechas de la barra bajo el chat, a la derecha, vuelven al paso anterior o pasan al siguiente.',
        buttonsMobile: 'Las flechas de la barra bajo el cuadro de escritura vuelven al paso anterior o pasan al siguiente.',
        close: 'Para terminar, concluye la sesión en el último paso o abre los tres puntos y elige «Congelar sesión» para retomarla más tarde.',
        openGuide: 'Abrir la guía',
        fullGuide: 'Abrir la guía completa en una pestaña nueva',
        closeGuide: 'Cerrar la guía',
        dismiss: 'Entendido',
    },
    fr: {
        title: 'Comment fonctionne ce chat',
        purpose: 'Le counselor t’accompagne un thème à la fois et t’aide à réfléchir sur toi : il n’y a pas de bonnes ou de mauvaises réponses.',
        duration: 'Pour une première conversation, compte environ 20–40 minutes. Le chat s’enregistre tout seul après chaque réponse : tu peux t’arrêter et reprendre.',
        todo: 'Réponds avec tes mots dans la zone du bas et envoie avec Entrée. Si un thème t’intéresse, continue à écrire pour l’approfondir.',
        buttonsDesktop: 'Les flèches de la barre sous le chat, à droite, reviennent à l’étape précédente ou passent à la suivante.',
        buttonsMobile: 'Les flèches de la barre sous la zone de saisie reviennent à l’étape précédente ou passent à la suivante.',
        close: 'Pour terminer, conclus la session à la dernière étape ou ouvre les trois points et choisis « Geler la séance » pour reprendre plus tard.',
        openGuide: 'Ouvrir le guide',
        fullGuide: 'Ouvrir le guide complet dans un nouvel onglet',
        closeGuide: 'Fermer le guide',
        dismiss: 'Compris',
    },
    de: {
        title: 'So funktioniert dieser Chat',
        purpose: 'Der Counselor begleitet dich Thema für Thema und hilft dir, über dich nachzudenken: Es gibt keine richtigen oder falschen Antworten.',
        duration: 'Plane für ein erstes Gespräch etwa 20–40 Minuten ein. Der Chat speichert sich nach jeder Antwort selbst: Du kannst pausieren und fortfahren.',
        todo: 'Antworte mit eigenen Worten im Feld unten und sende mit Enter. Wenn dich ein Thema interessiert, schreib weiter, um es zu vertiefen.',
        buttonsDesktop: 'Die Pfeile in der Leiste unter dem Chat, rechts, führen zum vorherigen oder zum nächsten Schritt.',
        buttonsMobile: 'Die Pfeile in der Leiste unter dem Eingabefeld führen zum vorherigen oder zum nächsten Schritt.',
        close: 'Zum Beenden schließt du die Sitzung im letzten Schritt ab oder öffnest die drei Punkte und wählst „Sitzung einfrieren“, um später fortzufahren.',
        openGuide: 'Anleitung öffnen',
        fullGuide: 'Vollständige Anleitung in einem neuen Tab öffnen',
        closeGuide: 'Anleitung schließen',
        dismiss: 'Verstanden',
    },
    sv: {
        title: 'Så fungerar den här chatten',
        purpose: 'Counselorn tar dig igenom ett tema i taget och hjälper dig att reflektera över dig själv: det finns inga rätta eller felaktiga svar.',
        duration: 'Räkna med ungefär 20–40 minuter för ett första samtal. Chatten sparas automatiskt efter varje svar: du kan pausa och återuppta.',
        todo: 'Svara med egna ord i rutan nedanför och skicka med Enter. Om ett tema intresserar dig, fortsätt skriva för att fördjupa det.',
        buttonsDesktop: 'Pilarna i fältet under chatten, till höger, går tillbaka till föregående steg eller vidare till nästa.',
        buttonsMobile: 'Pilarna i fältet under skrivrutan går tillbaka till föregående steg eller vidare till nästa.',
        close: 'För att avsluta, avsluta sessionen i sista steget eller öppna de tre punkterna och välj ”Frys sessionen” för att fortsätta senare.',
        openGuide: 'Öppna guiden',
        fullGuide: 'Öppna hela guiden i en ny flik',
        closeGuide: 'Stäng guiden',
        dismiss: 'Uppfattat',
    },
};

export function guidedIntroText(locale: string, key: Key): string {
    return (labels[locale.slice(0, 2)] ?? labels.en)[key];
}

// Sezione della guida studente (/guide#guide-section-N) che descrive lo strumento.
// Le chat senza una sezione propria rimandano alla sezione generale «La chat guidata».
export function guideSectionFor(questionnaireType: string): number {
    if (questionnaireType === 'EVENTO_STUDIO') return 10;
    if (questionnaireType === 'EVENTO_PROFESSIONALE') return 11;
    if (questionnaireType === 'OBIETTIVO_STUDIO') return 12;
    return 7;
}
