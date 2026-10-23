type Key = 'title' | 'purpose' | 'steps' | 'deepen' | 'buttonsDesktop' | 'buttonsMobile' | 'dismiss';

const labels: Record<string, Record<Key, string>> = {
    it: {
        title: 'Come funziona questo percorso',
        purpose: 'Questa conversazione ti guida passo dopo passo a riflettere su di te e a trovare un punto di partenza concreto.',
        steps: 'Il percorso è diviso in passaggi: in ognuno ti propongo un tema e tu rispondi con calma, con parole tue.',
        deepen: 'Se un passaggio ti interessa, puoi fermarti e approfondirlo: continua a scrivermi finché vuoi.',
        buttonsDesktop: 'Su computer i pulsanti sono nella barra sotto la finestra della chat, sulla destra: la freccia a sinistra torna al passaggio precedente, quella a destra passa al successivo.',
        buttonsMobile: 'Su telefono sono in una barra sotto la casella di scrittura: la freccia a sinistra torna al passaggio precedente, quella a destra passa al successivo.',
        dismiss: 'Ho capito',
    },
    en: {
        title: 'How this path works',
        purpose: 'This conversation guides you step by step to reflect on yourself and find a concrete starting point.',
        steps: 'The path is split into steps: in each one I suggest a topic and you answer calmly, in your own words.',
        deepen: 'If a step interests you, you can stop and explore it further: keep writing to me as long as you like.',
        buttonsDesktop: 'On a computer the buttons are in the bar below the chat window, on the right: the left arrow goes back to the previous step, the right arrow moves to the next one.',
        buttonsMobile: 'On a phone they are in a bar below the writing box: the left arrow goes back to the previous step, the right arrow moves to the next one.',
        dismiss: 'Got it',
    },
    es: {
        title: 'Cómo funciona este recorrido',
        purpose: 'Esta conversación te guía paso a paso para reflexionar sobre ti y encontrar un punto de partida concreto.',
        steps: 'El recorrido se divide en pasos: en cada uno te propongo un tema y tú respondes con calma, con tus palabras.',
        deepen: 'Si un paso te interesa, puedes detenerte y profundizar: sigue escribiéndome todo el tiempo que quieras.',
        buttonsDesktop: 'En el ordenador los botones están en la barra bajo la ventana del chat, a la derecha: la flecha izquierda vuelve al paso anterior y la derecha pasa al siguiente.',
        buttonsMobile: 'En el móvil están en una barra bajo el cuadro de escritura: la flecha izquierda vuelve al paso anterior y la derecha pasa al siguiente.',
        dismiss: 'Entendido',
    },
    fr: {
        title: 'Comment fonctionne ce parcours',
        purpose: 'Cette conversation te guide pas à pas pour réfléchir à toi et trouver un point de départ concret.',
        steps: 'Le parcours est divisé en étapes : dans chacune je te propose un thème et tu réponds calmement, avec tes mots.',
        deepen: 'Si une étape t’intéresse, tu peux t’arrêter et l’approfondir : continue à m’écrire aussi longtemps que tu veux.',
        buttonsDesktop: 'Sur ordinateur, les boutons sont dans la barre sous la fenêtre du chat, à droite : la flèche de gauche revient à l’étape précédente, celle de droite passe à la suivante.',
        buttonsMobile: 'Sur téléphone, ils sont dans une barre sous la zone de saisie : la flèche de gauche revient à l’étape précédente, celle de droite passe à la suivante.',
        dismiss: 'Compris',
    },
    de: {
        title: 'So funktioniert dieser Verlauf',
        purpose: 'Dieses Gespräch führt dich Schritt für Schritt dazu, über dich nachzudenken und einen konkreten Ausgangspunkt zu finden.',
        steps: 'Der Verlauf besteht aus Schritten: In jedem schlage ich ein Thema vor und du antwortest in Ruhe mit eigenen Worten.',
        deepen: 'Wenn dich ein Schritt interessiert, kannst du innehalten und ihn vertiefen: Schreib mir so lange, wie du möchtest.',
        buttonsDesktop: 'Am Computer befinden sich die Schaltflächen in der Leiste unter dem Chatfenster, rechts: Der linke Pfeil geht zum vorherigen Schritt zurück, der rechte zum nächsten.',
        buttonsMobile: 'Am Telefon befinden sie sich in einer Leiste unter dem Eingabefeld: Der linke Pfeil geht zum vorherigen Schritt zurück, der rechte zum nächsten.',
        dismiss: 'Verstanden',
    },
    sv: {
        title: 'Så fungerar det här flödet',
        purpose: 'Det här samtalet guidar dig steg för steg att reflektera över dig själv och hitta en konkret startpunkt.',
        steps: 'Flödet är indelat i steg: i varje steg föreslår jag ett tema och du svarar i lugn och ro med egna ord.',
        deepen: 'Om ett steg intresserar dig kan du stanna och fördjupa det: fortsätt skriva till mig så länge du vill.',
        buttonsDesktop: 'På dator finns knapparna i fältet under chattfönstret, till höger: vänsterpilen går tillbaka till föregående steg, högerpilen går till nästa.',
        buttonsMobile: 'På telefon finns de i ett fält under skrivrutan: vänsterpilen går tillbaka till föregående steg, högerpilen går till nästa.',
        dismiss: 'Uppfattat',
    },
};

export function guidedIntroText(locale: string, key: Key): string {
    return (labels[locale.slice(0, 2)] ?? labels.en)[key];
}
