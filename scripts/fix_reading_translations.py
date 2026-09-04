"""Correzioni editoriali al campo `why` delle letture certificate.

Il pannello mostra `why` come "Perche' puo' esserti utile": e' la frase che lo
studente legge davvero, e l'unica di cui questo file si occupa. `summary` e
`synopsis` restano come li ha prodotti la macchina.

La ritraduzione con qwen3.8 e il contesto di catalogo ha risolto la maggior
parte degli imperativi, non tutti. Restano tre famiglie di errore, tutte qui:

  modo verbale   una descrizione dell'opera resa come ordine al lettore
                 ("Presentez la classe...", "Ge en vokabular...");
  parola sbagliata  "studio" letto come studio di registrazione (fr, de) o
                 studio medico (es, fr, de); "riservatezza" come privacy;
                 "mestiere" come professione; "a tavolino" come a un tavolo;
  svedese rotto  parole inesistenti ("gymnasiebanden", "hjalpresrelation",
                 "ovalt kursprogram"), generi e concordanze sbagliate.

Lo svedese resta la lingua piu' fragile del catalogo: qui sono corretti gli
errori evidenti, non e' passata una persona di madrelingua.

L'immagine del backend non contiene `scripts/`: si esegue dall'host, con
`DATABASE_URL` puntato alla porta pubblicata da Postgres (5435).

    DATABASE_URL=postgresql://USER:PASS@127.0.0.1:5435/DB \
        python3 -m scripts.fix_reading_translations --dry-run
    DATABASE_URL=... python3 -m scripts.fix_reading_translations --apply
"""
from __future__ import annotations

import argparse

from backend import models
from backend.database import SessionLocal

# {slug: {lingua: testo corretto del campo why}}
FIXES: dict[str, dict[str, str]] = {
    "oakley-mind-for-numbers": {
        "es": "Ofrece una base concreta a quienes estudian mucho pero con técnicas que no funcionan, como la relectura repetida.",
        "sv": "Den ger en konkret grund för den som studerar mycket men med tekniker som inte håller, som upprepad omläsning.",
    },
    "calvino-barone-rampante": {
        "sv": "Att fundera på vad det innebär att hålla fast vid ett beslut över tid, istället för att uppleva det som ett ögonblickligt vägval.",
    },
    "weir-attimo-fuggente": {
        "sv": "Den hjälper till att fundera på konflikten mellan familjens förväntningar och det egna studievalet, utan att låtsas att konflikten är enkel.",
    },
    "anderson-ted-talks": {
        # "mestiere" e' un mestiere artigiano, non una professione.
        "de": "Es entkräftet die Vorstellung, dass öffentliches Sprechen ein Talent sei, und behandelt es als Handwerk aus Entscheidungen und Proben.",
        "sv": "Den bryter ner idén att tala inför publik är en talang: den behandlar det som ett hantverk av val och övning.",
    },
    "hooper-discorso-del-re": {
        # "fatica" e' lo sforzo, non la stanchezza; "esposizione" e' il parlare
        # in pubblico, non l'esposizione a uno stimolo.
        "fr": "Il montre l'effort physique de la prise de parole, non la rhétorique du dépassement des peurs par élan.",
        "de": "Es zeigt die körperliche Anstrengung des Vortragens, nicht die Rhetorik des Überwindens der Ängste im Schwung.",
        "sv": "Den visar den fysiska ansträngningen i att tala inför andra, inte retoriken om att övervinna rädslan i ett enda språng.",
    },
    "wenders-sale-della-terra": {
        # "a tavolino" e' in astratto, non seduti a un tavolo.
        "es": "La vocación que se construye caminando, no decidiendo sobre el papel, y el precio que exige.",
        "fr": "La vocation qui se construit en marchant, non en décidant sur le papier, et le prix qu'elle exige.",
        "de": "Die Berufung, die sich durch Gehen statt am Schreibtisch formt, und der Preis, den sie verlangt.",
        "sv": "Det kall som byggs genom att gå, inte genom att bestämma vid skrivbordet, och priset det kräver.",
    },
    "palacio-wonder": {
        "sv": "Klassen sedd av den som står i dess utkant och av dem som utesluter honom: gruppen som problem och som resurs.",
    },
    "brown-make-it-stick": {
        "sv": "Den ger ett kriterium till den som vill byta metod men inte vet vilka tekniker som är värda besväret.",
    },
    "cain-quiet": {
        # "riservatezza" e' l'essere riservati di carattere, non la privacy.
        "es": "Para quienes leen su propia reserva como un defecto por corregir en lugar de una forma de funcionar.",
        "fr": "Pour ceux qui lisent leur propre réserve comme un défaut à corriger plutôt que comme une façon de fonctionner.",
        "de": "Für diejenigen, die ihre eigene Zurückhaltung als Mangel betrachten, der korrigiert werden muss, statt als eine Art zu funktionieren.",
        "sv": "För den som ser sin egen tillbakadragenhet som ett fel som ska rättas i stället för ett sätt att fungera.",
    },
    "ejiofor-ragazzo-vento": {
        # "studio" e' lo studiare: era diventato lo studio medico.
        "es": "El acceso a los estudios como obstáculo concreto, y la curiosidad como recurso cuando falta la escuela.",
        "fr": "L'accès aux études comme obstacle concret, et la curiosité comme ressource lorsque l'école fait défaut.",
        "de": "Der Zugang zum Lernen als konkretes Hindernis und die Neugier als Ressource, wenn die Schule fehlt.",
    },
    "satrapi-persepolis": {
        "sv": "För den som studerar långt hemifrån eller mellan två kulturer och känner att hen inte helt hör hemma i någon av dem.",
    },
    "van-sant-will-hunting": {
        "sv": "Talangen som blir en börda när det innebär att ta risker att använda den: användbart för den som drar sig undan just där hen skulle kunna lyckas.",
    },
    "urban-master-procrastinator": {
        "es": "Nombra una experiencia común sin culpabilizarla, y distingue el aplazamiento con fecha límite del que no la tiene.",
        "fr": "Il nomme une expérience commune sans la culpabiliser, et distingue le report avec échéance de celui sans échéance.",
        "de": "Es benennt eine verbreitete Erfahrung, ohne sie zu beschuldigen, und unterscheidet Aufschub mit Frist von Aufschub ohne.",
        "sv": "Den ger namn åt en vanlig erfarenhet utan att skuldbelägga den, och skiljer uppskjutande med tidsfrist från uppskjutande utan.",
    },
    "darabont-ali-liberta": {
        "sv": "Uthållighet över lång tid, när resultatet uteblir och omgivningen avskräcker: användbart för den som mäter allt efter det omedelbara resultatet.",
    },
    "muccino-ricerca-felicita": {
        "sv": "Den visar den materiella kostnaden för en yrkesbana, inte bara beslutsamheten: användbart när framgång läses som ren viljestyrka.",
    },
    "cantet-la-classe": {
        "fr": "Il présente la classe comme un lieu de conflit et de négociation, et non comme un arrière-plan neutre de l'apprentissage.",
        "de": "Es zeigt die Klasse als Ort von Konflikt und Verhandlung, nicht als neutralen Hintergrund des Lernens.",
        "sv": "Den visar klassrummet som en plats för konflikt och förhandling, inte som en neutral bakgrund för studierna.",
    },
    "howard-beautiful-mind": {
        "fr": "Il sépare la valeur du travail de la condition de celui qui l'accomplit, sans transformer la maladie en condition du talent.",
        "de": "Es trennt den Wert der Arbeit von der Verfassung dessen, der sie ausführt, ohne die Krankheit zur Bedingung des Talents zu machen.",
        "sv": "Den skiljer arbetets värde från tillståndet hos den som utför det, utan att göra sjukdomen till en förutsättning för talangen.",
    },
    "lagravenese-freedom-writers": {
        "sv": "Skrivandet som verktyg för studier och ömsesidigt erkännande, i ett sammanhang som inte gynnar någotdera.",
    },
    "nakache-quasi-amici": {
        "sv": "En hjälprelation som inte går via medlidande: användbart för att prata om hur man ber om och erbjuder stöd.",
    },
    "westover-educated": {
        # "lo studio" e' lo studiare: in francese e tedesco era diventato uno
        # studio di registrazione.
        "es": "La entrada a los estudios como ruptura con el entorno de origen, y el precio que implica: útil para quien es el primero de la familia en estudiar.",
        "fr": "L'entrée dans les études comme rupture avec le milieu d'origine, et le prix que cela coûte : utile pour le premier de la famille à étudier.",
        "de": "Der Einstieg ins Studium als Bruch mit der Herkunft und der Preis dafür: nützlich für den ersten in der Familie, der studiert.",
    },
    "kahneman-pensieri": {
        "fr": "Il donne un vocabulaire aux erreurs d'évaluation sur soi et sur ses propres choix, sans les réduire à une distraction.",
        "de": "Es gibt Fehlurteilen über sich selbst und die eigenen Entscheidungen ein Vokabular, ohne sie auf bloße Ablenkung zu reduzieren.",
        "sv": "Den ger ett ordförråd åt felbedömningar om sig själv och sina egna val, utan att reducera dem till distraktion.",
    },
    "brackett-permission-to-feel": {
        "fr": "Il donne des mots à ceux qui disent seulement qu'ils vont mal ou qu'ils sont fatigués, sans savoir distinguer ce qu'ils ressentent.",
        "de": "Es gibt denen Worte, die nur sagen, dass es ihnen schlecht geht oder dass sie müde sind, ohne unterscheiden zu können, was sie fühlen.",
        "sv": "Den ger ord åt den som bara säger att hen mår dåligt eller är trött, utan att kunna skilja på vad hen känner.",
    },
    "cain-quiet-power": {
        # "gymnasiebanden" non e' una parola; il francese aveva ristretto la
        # fascia al solo collège.
        "es": "Se dirige a los estudiantes de secundaria con ejemplos escolares, allí donde el libro para adultos sigue siendo abstracto.",
        "fr": "Il s'adresse aux élèves du secondaire avec des exemples scolaires, là où le livre pour adultes reste abstrait.",
        "de": "Es spricht Schülerinnen und Schüler der Sekundarstufe mit schulischen Beispielen an, wo das Buch für Erwachsene abstrakt bleibt.",
        "sv": "Den vänder sig till elever på högstadiet och gymnasiet med skolexempel, där boken för vuxna förblir abstrakt.",
    },
    "ende-momo": {
        "fr": "Il remet en question l'idée que s'organiser signifie tout comprimer : utile à ceux qui remplissent chaque heure et se sentent pourtant en retard.",
        "de": "Es hinterfragt die Vorstellung, dass sich zu organisieren bedeutet, alles zusammenzupressen: nützlich für alle, die jede Stunde füllen und sich trotzdem im Rückstand fühlen.",
        "sv": "Den ifrågasätter idén att organisera sig innebär att pressa in allt: användbart för den som fyller varje timme och ändå känner sig efter.",
    },
    "salinger-holden": {
        "sv": "Avvisandet av skolan som språket för ett bredare obehag: användbart när avhoppet bara läses som lättja.",
    },
    "davenia-bianca-come-latte": {
        # "motivazione" non e' una motivazione scritta; "senso" e' significato;
        # "rimprovero" e' un rimprovero, non un'accusa.
        "sv": "Skolmotivationen som växer ur en relation och ur en mening, inte ur en tillrättavisning: den vänder sig direkt till gymnasieelever.",
    },
    "geda-coccodrilli": {
        # Ricomincia a studiare, in una lingua non sua: non "studia una lingua".
        "es": "Vuelve a estudiar de adulto en una lengua que no es la suya: útil para quienes se sienten fuera de tiempo o fuera de lugar en un recorrido.",
        "de": "Er nimmt das Lernen als Erwachsener in einer Sprache wieder auf, die nicht seine ist: nützlich für alle, die sich auf ihrem Weg zeitlich oder örtlich fehl am Platz fühlen.",
        "sv": "Han börjar studera igen som vuxen på ett språk som inte är hans eget: användbart för den som känner sig ute i otid eller malplacerad i sin väg.",
    },
    "williams-stoner": {
        # "ovalt kursprogram" nasce da "corso non scelto".
        "sv": "En kallelse född av en slump i en kurs han inte valt, och en vanlig karriär levd som sin egen: användbart för den som tror att den rätta vägen måste vara uppenbar.",
    },
    "saint-exupery-piccolo-principe": {
        "sv": "Den skiljer mätandet från förståelsen: användbart när studierna reduceras till siffror och meningen med det man gör försvinner.",
    },
    "burkeman-quattromila-settimane": {
        "fr": "Il déplace le problème du « faire plus » vers le choix de ce qu'il faut laisser tomber : utile à ceux qui ont déjà essayé toutes les méthodes de productivité.",
        "de": "Es verschiebt das Problem vom Mehr-Tun hin zur Wahl dessen, was man fallen lässt: nützlich für alle, die schon jede Produktivitätsmethode probiert haben.",
        "sv": "Den flyttar problemet från att göra mer till att välja vad man ska släppa: användbart för den som redan har provat alla produktivitetsmetoder.",
    },
    "draaisma-tempo-vola": {
        # Il francese aveva una doppia negazione che rovescia la frase.
        "fr": "Il donne une base à la manière dont on perçoit le temps d'étude, qui coïncide rarement avec celui de l'horloge.",
        "sv": "Den ger en grund för hur studietiden upplevs, som sällan sammanfaller med klockans.",
    },
}


def main() -> int:
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--dry-run", action="store_true", help="elenca senza scrivere")
    group.add_argument("--apply", action="store_true", help="applica le modifiche")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        changed = 0
        for slug, by_lang in FIXES.items():
            row = (
                db.query(models.CertifiedReading)
                .filter(models.CertifiedReading.slug == slug)
                .one_or_none()
            )
            if row is None:
                print(f"ASSENTE {slug}")
                continue
            current = dict(row.why_i18n or {})
            for lang, text in by_lang.items():
                if current.get(lang) == text:
                    continue
                print(f"{slug} why.{lang}")
                print(f"  - {current.get(lang)}")
                print(f"  + {text}")
                current[lang] = text
                changed += 1
            if args.apply:
                row.why_i18n = current
                db.add(row)
        if args.apply:
            db.commit()
        print(f"\n{changed} testi {'corretti' if args.apply else 'da correggere'}")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
