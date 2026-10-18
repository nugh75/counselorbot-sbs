// Traduzioni per il pannello Riserva di sistema (quando l'utente non ha ChatGPT o chiave personale)
import type { Lang } from './i18n';

export type SystemAIKey =
    | 'title'
    | 'orderHelp'
    | 'sectionHelp'
    | 'noFallbackWarning'
    | 'noProviderSelected'
    | 'provider'
    | 'model'
    | 'modelEmpty'
    | 'configured'
    | 'notConfigured'
    | 'testButton'
    | 'testingButton'
    | 'testSuccessTitle'
    | 'testFailureTitle'
    | 'testResultsIntro'
    | 'primaryRole'
    | 'fallbackRole'
    | 'advancedTitle'
    | 'advancedHelp'
    | 'targetsLabel'
    | 'timeoutLabel'
    | 'errorAuth'
    | 'errorModelNotFound'
    | 'errorQuota'
    | 'errorNetwork'
    | 'errorTimeout'
    | 'errorRateLimit'
    | 'errorInvalidRequest'
    | 'errorNotConfigured'
    | 'errorUnknown'
    | 'effectiveModelLabel'
    | 'latencyLabel'
    | 'toastSuccess'
    | 'toastFailed'
    | 'toastNotConfigured'
    | 'toastNetworkError';

const TEXTS: Record<SystemAIKey, [string, string, string, string, string, string]> = {
    title: [
        "Riserva di sistema (quando l'utente non ha ChatGPT o una chiave personale)",
        "System AI fallback (when the user has no ChatGPT or personal key)",
        "Reserva de IA del sistema (cuando el usuario no tiene ChatGPT o clave personal)",
        "Solution de repli système (lorsque l'utilisateur n'a pas ChatGPT ou de clé personnelle)",
        "System-KI-Reserve (wenn Nutzende weder ChatGPT noch einen persönlichen Schlüssel haben)",
        "Systemets AI-reserv (när användaren saknar ChatGPT eller personlig nyckel)",
    ],
    orderHelp: [
        "Ordine di selezione dell'IA: 1) abbonamento ChatGPT dell'utente, 2) connessione API personale o condivisa, 3) riserva di sistema configurata qui per chi non ha 1 o 2.",
        "AI selection order: 1) user's ChatGPT subscription, 2) personal or shared API connection, 3) system fallback configured here for users without 1 or 2.",
        "Orden de selección de IA: 1) suscripción a ChatGPT del usuario, 2) conexión API personal o compartida, 3) reserva del sistema configurada aquí para quienes no tienen 1 o 2.",
        "Ordre de sélection de l'IA : 1) abonnement ChatGPT de l'utilisateur, 2) connexion API personnelle ou partagée, 3) solution de repli système configurée ici pour ceux sans 1 ou 2.",
        "Reihenfolge der KI-Auswahl: 1) ChatGPT-Abonnement des Nutzers, 2) persönliche oder geteilte API-Verbindung, 3) hier konfigurierte Systemreserve für Nutzer ohne 1 oder 2.",
        "AI-valordning: 1) användarens ChatGPT-prenumeration, 2) personlig eller delad API-anslutning, 3) systemreserv som konfigureras här för användare utan 1 eller 2.",
    ],
    sectionHelp: [
        "Questa configurazione interviene solo per gli utenti sprovvisti di abbonamento ChatGPT e di una chiave personale o condivisa.",
        "This configuration only applies to users without a ChatGPT subscription or a personal/shared key.",
        "Esta configuración solo se aplica a los usuarios sin suscripción a ChatGPT ni clave personal o compartida.",
        "Cette configuration ne s'applique qu'aux utilisateurs sans abonnement ChatGPT ni clé personnelle ou partagée.",
        "Diese Konfiguration gilt nur für Nutzende ohne ChatGPT-Abonnement oder persönlichen/geteilten Schlüssel.",
        "Denna konfiguration gäller endast användare utan ChatGPT-prenumeration eller personlig/delad nyckel.",
    ],
    noFallbackWarning: [
        "Nessuna riserva di sistema configurata: gli utenti senza ChatGPT o chiave personale non possono chattare.",
        "No system AI fallback configured: users without ChatGPT or a personal key cannot chat.",
        "Ninguna reserva de sistema configurada: los usuarios sin ChatGPT o clave personal no pueden chatear.",
        "Aucune solution de repli système configurée : les utilisateurs sans ChatGPT ou clé personnelle ne peuvent pas discuter.",
        "Keine System-KI-Reserve konfiguriert: Nutzende ohne ChatGPT oder persönlichen Schlüssel können nicht chatten.",
        "Ingen systemreserv för AI konfigurerad: användare utan ChatGPT eller personlig nyckel kan inte chatta.",
    ],
    noProviderSelected: [
        "(Nessun provider selezionato)",
        "(No provider selected)",
        "(Ningún proveedor seleccionado)",
        "(Aucun fournisseur sélectionné)",
        "(Kein Anbieter ausgewählt)",
        "(Ingen leverantör vald)",
    ],
    provider: [
        "Provider",
        "Provider",
        "Proveedor",
        "Fournisseur",
        "Anbieter",
        "Leverantör",
    ],
    model: [
        "Modello",
        "Model",
        "Modelo",
        "Modèle",
        "Modell",
        "Modell",
    ],
    modelEmpty: [
        "(Nessun modello)",
        "(No model)",
        "(Sin modelo)",
        "(Aucun modèle)",
        "(Kein Modell)",
        "(Ingen modell)",
    ],
    configured: [
        "Configurata",
        "Configured",
        "Configurada",
        "Configurée",
        "Konfiguriert",
        "Konfigurerad",
    ],
    notConfigured: [
        "Non configurata",
        "Not configured",
        "No configurada",
        "Non configurée",
        "Nicht konfiguriert",
        "Inte konfigurerad",
    ],
    testButton: [
        "Prova",
        "Test",
        "Probar",
        "Tester",
        "Testen",
        "Testa",
    ],
    testingButton: [
        "Verifica in corso…",
        "Testing…",
        "Comprobando…",
        "Vérification en cours…",
        "Wird geprüft…",
        "Testar…",
    ],
    testSuccessTitle: [
        "Verifica completata con successo",
        "Check completed successfully",
        "Comprobación completada con éxito",
        "Vérification terminée avec succès",
        "Prüfung erfolgreich abgeschlossen",
        "Kontrollen slutfördes utan fel",
    ],
    testFailureTitle: [
        "Verifica completata con errori",
        "Check completed with errors",
        "Comprobación completada con errores",
        "Vérification terminée avec des erreurs",
        "Prüfung mit Fehlern abgeschlossen",
        "Kontrollen slutfördes med fel",
    ],
    testResultsIntro: [
        "Esito della prova per il modello primario e ciascun ripiego:",
        "Probe results for the primary fallback and each ordered fallback:",
        "Resultados de la prueba para el modelo principal y cada alternativa:",
        "Résultats du test pour le modèle principal et chaque solution de repli :",
        "Testergebnisse für die Hauptreserve und jedes Ersatzmodell:",
        "Testresultat för huvudreserven och varje reservmodell:",
    ],
    primaryRole: [
        "Riserva principale",
        "Primary fallback",
        "Reserva principal",
        "Repli principal",
        "Hauptreserve",
        "Huvudreserv",
    ],
    fallbackRole: [
        "Ripiego {n}",
        "Fallback {n}",
        "Alternativa {n}",
        "Solution {n}",
        "Ersatzmodell {n}",
        "Reserv {n}",
    ],
    advancedTitle: [
        "Impostazioni avanzate (ripieghi e timeout)",
        "Advanced settings (fallbacks and timeout)",
        "Configuración avanzada (alternativas y tiempo de espera)",
        "Paramètres avancés (solutions de repli et délai)",
        "Erweiterte Einstellungen (Ersatzmodelle und Zeitlimit)",
        "Avancerade inställningar (reserver och tidsgräns)",
    ],
    advancedHelp: [
        "I ripieghi JSON vengono tentati in ordine se la riserva principale non risponde o fallisce.",
        "JSON fallbacks are attempted in order if the primary fallback fails or is unavailable.",
        "Las alternativas JSON se prueban en orden si la reserva principal falla o no está disponible.",
        "Les solutions de repli JSON sont essayées dans l'ordre si le repli principal échoue.",
        "Die JSON-Ersatzmodelle werden der Reihe nach versucht, wenn die Hauptreserve fehlschlägt.",
        "JSON-reserver provas i ordning om huvudreserven misslyckas eller är otillgänglig.",
    ],
    targetsLabel: [
        "Ripieghi ordinati (JSON)",
        "Ordered fallbacks (JSON)",
        "Alternativas ordenadas (JSON)",
        "Solutions de repli ordonnées (JSON)",
        "Geordnete Ersatzmodelle (JSON)",
        "Reservmodeller i ordning (JSON)",
    ],
    timeoutLabel: [
        "Timeout per tentativo (secondi)",
        "Timeout per attempt (seconds)",
        "Tiempo de espera por intento (segundos)",
        "Délai par tentative (secondes)",
        "Zeitlimit je Versuch (Sekunden)",
        "Tidsgräns per försök (sekunder)",
    ],
    errorAuth: [
        "Autenticazione non valida o chiave mancante",
        "Invalid authentication or missing key",
        "Autenticación no válida o clave ausente",
        "Authentification invalide ou clé manquante",
        "Ungültige Authentifizierung oder fehlender Schlüssel",
        "Ogiltig autentisering eller saknad nyckel",
    ],
    errorModelNotFound: [
        "Modello inesistente o non disponibile",
        "Model not found or unavailable",
        "Modelo inexistente o no disponible",
        "Modèle introuvable ou indisponible",
        "Modell nicht gefunden oder nicht verfügbar",
        "Modellen hittades inte eller är inte tillgänglig",
    ],
    errorQuota: [
        "Quota esaurita o credito insufficiente",
        "Quota exceeded or insufficient credit",
        "Cuota agotada o crédito insuficiente",
        "Quota dépassé ou crédit insuffisant",
        "Quota überschritten oder unzureichendes Guthaben",
        "Kvot överskriden eller otillräcklig kredit",
    ],
    errorNetwork: [
        "Errore di rete o provider non raggiungibile",
        "Network error or provider unreachable",
        "Error de red o proveedor no alcanzable",
        "Erreur réseau ou fournisseur inaccessible",
        "Netzwerkfehler oder Anbieter nicht erreichbar",
        "Nätverksfel eller leverantören kan inte nås",
    ],
    errorTimeout: [
        "Tempo limite scaduto",
        "Request timed out",
        "Tiempo de espera agotado",
        "Délai d'attente dépassé",
        "Zeitlimit überschritten",
        "Tidsgränsen överskreds",
    ],
    errorRateLimit: [
        "Limite di frequenza superato",
        "Rate limit exceeded",
        "Límite de frecuencia superado",
        "Limite de requêtes dépassée",
        "Ratenlimit überschritten",
        "Hastighetsgräns överskriden",
    ],
    errorInvalidRequest: [
        "Richiesta non valida",
        "Invalid request",
        "Solicitud no válida",
        "Requête invalide",
        "Ungültige Anfrage",
        "Ogiltig förfrågan",
    ],
    errorNotConfigured: [
        "Nessun provider o modello impostato",
        "No provider or model configured",
        "Ningún proveedor o modelo configurado",
        "Aucun fournisseur ou modèle configuré",
        "Kein Anbieter oder Modell konfiguriert",
        "Ingen leverantör eller modell konfigurerad",
    ],
    errorUnknown: [
        "Errore durante la chiamata di prova",
        "Error during probe call",
        "Error durante la llamada de prueba",
        "Erreur lors de l'appel de test",
        "Fehler beim Testaufruf",
        "Fel vid testanrop",
    ],
    effectiveModelLabel: [
        "modello effettivo",
        "effective model",
        "modelo efectivo",
        "modèle effectif",
        "tatsächliches Modell",
        "faktisk modell",
    ],
    latencyLabel: [
        "latenza",
        "latency",
        "latencia",
        "latence",
        "Latenz",
        "latens",
    ],
    toastSuccess: [
        "Verifica della riserva di sistema completata con successo.",
        "System AI fallback check completed successfully.",
        "Comprobación de la reserva de IA del sistema completada con éxito.",
        "Vérification du repli IA système terminée avec succès.",
        "Prüfung der System-KI-Reserve erfolgreich abgeschlossen.",
        "Kontroll av systemets AI-reserv slutfördes framgångsrikt.",
    ],
    toastFailed: [
        "La verifica della riserva di sistema ha rilevato errori.",
        "System AI fallback check detected errors.",
        "La comprobación de la reserva de IA del sistema detectó errores.",
        "La vérification du repli IA système a détecté des erreurs.",
        "Die Prüfung der System-KI-Reserve hat Fehler festgestellt.",
        "Kontrollen av systemets AI-reserv upptäckte fel.",
    ],
    toastNotConfigured: [
        "Nessuna riserva di sistema configurata da verificare.",
        "No system AI fallback configured to check.",
        "Ninguna reserva de IA del sistema configurada para comprobar.",
        "Aucune solution de repli IA système configurée à tester.",
        "Keine System-KI-Reserve zum Prüfen konfiguriert.",
        "Ingen systemreserv för AI har konfigurerats att testa.",
    ],
    toastNetworkError: [
        "Errore durante la chiamata di verifica della riserva di sistema.",
        "Error during system AI fallback verification call.",
        "Error durante la llamada de comprobación de la reserva de IA del sistema.",
        "Erreur lors de l'appel de vérification du repli IA système.",
        "Fehler beim Aufruf zur Prüfung der System-KI-Reserve.",
        "Fel vid anrop för att verifiera systemets AI-reserv.",
    ],
};

const LANG_INDEX: Record<Lang, number> = {
    it: 0,
    en: 1,
    es: 2,
    fr: 3,
    de: 4,
    sv: 5,
};

export function systemAIText(lang: Lang, key: SystemAIKey, params?: Record<string, string | number>): string {
    const idx = LANG_INDEX[lang] ?? 0;
    const entry = TEXTS[key];
    let template = entry ? entry[idx] || entry[0] : key;
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            template = template.replaceAll(`{${k}}`, String(v));
        }
    }
    return template;
}
