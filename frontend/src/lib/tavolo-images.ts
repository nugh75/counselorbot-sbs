// Il catalogo d'immagini del tavolo, lato tela. I file stanno sul server, in
// un set caricato in blocco dall'amministrazione con il suo CSV di nome e
// utilizzo: il selettore filtra a video quello che arriva una volta per tela,
// come per le icone del catalogo dei diagrammi.

export interface TavoloImageEntry {
    id: string;
    name: string;
    usage: string;
}

export const BUILTIN_CARD_IMAGES: TavoloImageEntry[] = [
    { id: 'card:focus_goal', name: 'Obiettivo e Focus', usage: 'Bersaglio e ago bussola per obiettivi di studio' },
    { id: 'card:time_plan', name: 'Gestione del Tempo', usage: 'Clessidra e calendario per pianificazione' },
    { id: 'card:decision_path', name: 'Bivio e Decisione', usage: 'Strada a due vie per scelte e alternative' },
    { id: 'card:unravel_blocks', name: 'Sblocco e Procrastinazione', usage: 'Filo che si distende verso il primo passo' },
    { id: 'card:emotional_calm', name: 'Calma e Regolazione Emotiva', usage: 'Onde concentriche stile loto per gestire ansia' },
    { id: 'card:strengths_resource', name: 'Punti di Forza e Risorse', usage: 'Profilo con scintilla di consapevolezza interiore' },
    { id: 'card:action_steps', name: 'Piano d\'Azione e Traguardo', usage: 'Checklist con gradini e bandierina di traguardo' },
    { id: 'card:study_group', name: 'Studio di Gruppo e Confronto', usage: 'Due profili con libro per studio collaborativo' },
    { id: 'card:active_reading', name: 'Metodo di Studio e Appunti', usage: 'Libro aperto con note ed evidenziatore' },
    { id: 'card:recharge_pause', name: 'Pausa e Benessere', usage: 'Tazza calda, luna e batteria per ricaricare energie' },
    { id: 'card:critical_puzzle', name: 'Pensiero Critico e Sintesi', usage: 'Puzzle con tessera chiave per problem solving' },
    { id: 'card:feedback_loop', name: 'Feedback e Revisione', usage: 'Frecce cicliche attorno al foglio per miglioramento' },
    { id: 'card:curiosity_explore', name: 'Esplorazione e Orizzonti', usage: 'Cannocchiale puntato verso una stella' },
    { id: 'card:motivation_spark', name: 'Motivazione e Spinta', usage: 'Torcia e fiamma calda lungo il sentiero per motivazione e perseveranza' },
    { id: 'card:exam_confidence', name: 'Sicurezza ed Esami', usage: 'Scudo e foglio d\'esame con spunta per gestire ansia da esame' },
    { id: 'card:mind_mapping', name: 'Mappe e Schemi Mentali', usage: 'Rete radiale di nodi e rami per organizzazione concettuale' },
    { id: 'card:dialogue_counselor', name: 'Dialogo e Ascolto', usage: 'Profili in dialogo empatico con ponte di ascolto' },
    { id: 'card:self_reflection', name: 'Autovalutazione e Specchio', usage: 'Lente con riflesso sereno per introspezione e consapevolezza' },
    { id: 'card:resilience_growth', name: 'Resilienza e Crescita', usage: 'Germoglio che spunta tra le pietre per costanza e superamento ostacoli' },
    { id: 'card:career_compass', name: 'Vocazione e Futuro', usage: 'Faro e bussola per orientamento e sbocchi professionali' },
    { id: 'card:workspace_order', name: 'Spazio di Studio', usage: 'Lampada e scrivania per ambiente di studio ordinato e senza distrazioni' },
    { id: 'card:ask_support', name: 'Chiedere Aiuto e Rete', usage: 'Mani accoglienti per supporto tra pari, tutor e docenti' },
    { id: 'card:priorities_matrix', name: 'Priorità e Selezione', usage: 'Imbuto e matrice di selezione per focalizzarsi sull\'essenziale' },
    { id: 'card:fresh_start', name: 'Ripartenza e Nuovo Inizio', usage: 'Spirale verso l\'alba per superare battute d\'arresto' },
    { id: 'card:deep_writing', name: 'Tesi e Scrittura Accademica', usage: 'Penna stilografica e manoscritto per stesura testi e tesi' },
    { id: 'card:energy_battery', name: 'Gestione delle Energie', usage: 'Indicatore di carica e ritmo per prevenire sovraccarico cognitivo' },
    { id: 'card:bicycle_commute', name: 'Bicicletta e Mobilità', usage: 'Bicicletta urbana per spostamenti, mobilità sostenibile e vita quotidiana' },
    { id: 'card:car_travel', name: 'Automobile e Viaggi', usage: 'Automobile per spostamenti, pendolarismo e autonomia di movimento' },
    { id: 'card:home_living', name: 'Casa e Alloggio', usage: 'Casa per vita domestica, studenti fuori sede, alloggio e famiglia' },
    { id: 'card:train_transit', name: 'Treno e Pendolarismo', usage: 'Treno su binari per lunghi tragitti, trasporti pubblici e viaggi' },
    { id: 'card:laptop_work', name: 'Computer e Lavoro Digitale', usage: 'Computer portatile aperto per studio digitale e smart working' },
    { id: 'card:workplace_job', name: 'Lavoro e Professione', usage: 'Cartella professionale e ufficio per carriera e occupazione' },
    { id: 'card:job_interview', name: 'Colloquio e Opportunità', usage: 'Stretta di mano e curriculum per selezioni e accordi professionali' },
    { id: 'card:finance_budget', name: 'Budget e Spese', usage: 'Salvadanaio e bilancio economico per gestione delle spese e autonomia' },
    { id: 'card:daily_errands', name: 'Spesa e Vita Quotidiana', usage: 'Borsa della spesa con generi alimentari per la gestione della casa' },
    { id: 'card:healthy_living', name: 'Salute e Benessere Fisico', usage: 'Scarpa sportiva e borraccia per esercizio fisico e stile di vita sano' },
    { id: 'card:campus_university', name: 'Ateneo e Campus', usage: 'Facciata universitaria per appartenenza accademica e dipartimento' },
    { id: 'card:library_hall', name: 'Biblioteca e Aula Studio', usage: 'Scaffale di libri e lampada per concentrazione e studio silenzioso' },
    { id: 'card:graduation_cap', name: 'Laurea e Traguardo', usage: 'Tocco accademico e pergamena per completamento studi e traguardo finale' },
];

export const tavoloImageUrl = (id: string): string => {
    if (id.startsWith('/')) return id;
    if (id.startsWith('card:')) return `/images/cards/${id.slice(5)}.png`;
    return `/api/tavolo-images/${encodeURIComponent(id)}/file`;
};

const plain = (text: string) =>
    text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function matchTavoloImages(images: TavoloImageEntry[], query: string): TavoloImageEntry[] {
    const needle = plain(query.trim());
    if (!needle) return images;
    return images.filter((image) =>
        plain(image.name).includes(needle) || plain(image.usage).includes(needle));
}

export async function fetchTavoloImages(): Promise<TavoloImageEntry[]> {
    try {
        const response = await fetch('/api/tavolo-images');
        if (!response.ok) return BUILTIN_CARD_IMAGES;
        const body = await response.json() as { images?: TavoloImageEntry[] };
        const serverImages = Array.isArray(body.images) ? body.images : [];
        return [...BUILTIN_CARD_IMAGES, ...serverImages];
    } catch {
        return BUILTIN_CARD_IMAGES;
    }
}
