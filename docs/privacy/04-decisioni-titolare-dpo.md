# Privacy Layer — decisioni per titolare, DPO e consulente privacy

Stato: **elenco di domande**, non di risposte (2026-10-24). Le voci marcate **[DA VALIDARE]** non hanno un valore deciso:
il codice le tratta come `undefined` e le funzioni che ne dipendono restano spente (02 §7.2).
Nessun documento di questa cartella dichiara la conformità al GDPR: le misure tecniche non bastano a ottenerla.

## Decisioni

| ID | Domanda | Perché serve | Opzioni / fatti dal codice | Valore |
|---|---|---|---|---|
| **D1** | Chi è **titolare** per ciascun profilo? | L1 (server ai4educ, Mac portable), L2 (PC del docente), futuro server di scuola | il piano desktop ipotizza «la scuola (o il docente)» (`docs/architecture/desktop-apps-plan.md` §7.1); su L2 i dati stanno sul PC del docente | **[DA VALIDARE]** |
| **D2** | **Responsabili e sub-responsabili** (art. 28) | provider AI esterni (13 in `backend/ai_service.py`), Cloudflare (tunnel, vede il traffico in chiaro), Microsoft (Edge TTS), Telegram, hosting di L1, OpenAI per il collegamento ChatGPT personale | elenco tecnico in [01 §5](01-analisi.md#5-tutte-le-uscite-verso-modelli-e-servizi-esterni) | **[DA VALIDARE]** |
| **D3** | **Base giuridica per finalità** (art. 6) | il codice abilita una finalità solo con base configurata | finalità tecniche individuate: servizio educativo (chat guidata, questionari, taccuino); orientamento; condivisione con il docente; osservazioni di classe con AI; ricerca e validazione psicometrica (`validation_responses`, codici anonimi); questionario di gradimento; sicurezza e log; collegamento Telegram | **[DA VALIDARE]** per ognuna |
| **D4** | **Dati art. 9** (salute ecc.) che lo studente scrive senza che siano chiesti | i testi liberi possono contenerne; i profili QSA/ZTPI sono profili psicologici/educativi | default tecnico proposto: blocco verso modelli esterni (02 §3.5); serve decidere se il trattamento locale è ammesso e su quale base (art. 9(2)) | **[DA VALIDARE]** |
| **D5** | **Termini di conservazione** per categoria | oggi solo `logs` (90 giorni, `backend/chat_logic.py:165`) | categorie: account, risultati, conversazioni, taccuino/portfolio, mappe dei segnaposto, eventi privacy/audit, log tecnici, backup, dati di ricerca, upload | **[DA VALIDARE]** |
| **D6** | **Ruoli e autorizzazioni**: matrice di 02 §5.2, ambito dei grant docente, chi approva il break-glass | oggi il docente vede tutti i risultati di un membro (G5) | default proposto: solo dati prodotti nella classe e nel periodo di iscrizione | **[DA VALIDARE]** |
| **D7** | **Minori**: età minima, coinvolgimento dei genitori, linguaggio | servizio usato da studenti di scuola | l'art. 2-quinquies del Codice (14 anni) riguarda il consenso ai servizi della società dell'informazione: se si applichi dipende dalla base giuridica scelta (D3); non va applicato in automatico | **[DA VALIDARE]** |
| **D8** | **Testi** delle informative (studente, docente, AI), condizioni d'uso, moduli di consenso, versioni per minori e lingue | richiesti dal brief §8 | bozze tecniche nel blocco P16, con campi evidenziati | **[DA VALIDARE]** |
| **D9** | **Immagini, audio e lettura vocale** verso servizi esterni | oggi immagini e testo TTS escono senza filtro (G1, G2) | opzioni: solo motori locali; esterni ammessi con informativa; esterni vietati | **[DA VALIDARE]** (default tecnico: vietati) |
| **D10** | **Condizioni dei provider**: conservazione, uso per addestramento, localizzazione, sub-responsabili, trasferimenti extra-UE (artt. 44-49) | il gateway può limitare i provider ammessi per finalità | OpenRouter: il codice chiede già `data_collection: deny` e `zdr: true` (`CONTEXT.md` §RAG); altri provider **non verificati** | **[DA VALIDARE]** |
| **D11** | **DPIA** (art. 35): necessaria? chi la conduce? | minori, profilazione educativa, possibili dati art. 9, nuove tecnologie | schema di DPIA nel blocco P16 | **[DA VALIDARE]** |
| **D12** | **Data breach** (artt. 33-34): contatti, ruoli, tempi interni | su L2 il «sistema» è un PC personale | procedura bozza in P16 | **[DA VALIDARE]** |
| **D13** | **Ricerca** (art. 89): separazione dal servizio educativo, pseudonimizzazione, consenso o altra base, comitato etico | oggi i codici anonimi hanno una tabella di corrispondenza in chiaro (`backend/anonymous_codes.py:20-52`) | proposta tecnica: chiave HMAC dedicata alla ricerca, custodita separatamente | **[DA VALIDARE]** |
| **D14** | **Kit di recupero delle chiavi**: chi lo custodisce, dove | una chiave persa rende illeggibili i dati cifrati (02 §9) | su L2: il docente; su L1: l'amministratore della Console o il titolare | **[DA VALIDARE]** |

## Documenti da produrre (bozze, blocco P16)

Informativa studente; informativa docente; informativa sul trattamento con AI; modulo di consenso alla condivisione con il
docente (se la base è il consenso, D3); informativa e consenso per la ricerca; politica di conservazione e cancellazione;
procedura di data breach; schema di DPIA; registro dei flussi e delle categorie di dati; descrizione delle misure tecniche e
organizzative (art. 32). Tutte con titolare, DPO, responsabili e termini come campi **[DA VALIDARE]**.

## Fonti normative e stato della verifica

Verifica eseguita il 2026-10-24 con accesso web limitato. «Verificato» = letto sulla fonte indicata in questa sessione.

| Fonte | Uso nel piano | Stato |
|---|---|---|
| Regolamento (UE) 2016/679 (GDPR), EUR-Lex `https://eur-lex.europa.eu/eli/reg/2016/679/oj` — artt. 4, 5, 6, 7, 8, 9, 12-14, 15-22, 24, 25, 26-28, 30, 32, 33-34, 35, 44-49, 89 | definizioni, basi, diritti, sicurezza | **non verificato**: la pagina EUR-Lex non ha restituito il testo allo strumento; citazioni da conoscenza generale, da controllare sul testo ufficiale |
| EDPB, *Guidelines 01/2025 on Pseudonymisation* | terminologia di 02 §2 | **parzialmente verificato**: la pagina EDPB indica il riferimento 01/2025 e la consultazione pubblica (17/01–14/03/2025); l'esistenza di una versione finale risulta solo da una ricerca, il testo non è stato letto |
| EDPB, linee guida 05/2020 sul consenso, 4/2019 su privacy by design and by default; WP29/EDPB sulla trasparenza | consensi, UI, design | **non verificato** |
| D.Lgs. 196/2003 come modificato dal D.Lgs. 101/2018, art. 2-quinquies | D7 | **verificato solo su fonti secondarie** (Agenda Digitale, Orizzonte Scuola, Il Sole 24 Ore): soglia di 14 anni per il consenso ai servizi della società dell'informazione; testo in Normattiva da controllare |
| Provvedimenti e linee guida del Garante (scuola, minori, AI) | D3, D7, D8 | **non verificato**: nessun provvedimento letto |
| OWASP ASVS, OWASP Top 10 for LLM Applications | 02 §8 | **non verificato** |

## Fonti tecniche verificate

| Componente | Fatto | Fonte |
|---|---|---|
| `urchade/gliner_multi_pii-v1` | licenza Apache-2.0; «6 languages» senza elenco; derivato da `urchade/gliner_multi-v2.1` (licenza non indicata sulla scheda) | scheda Hugging Face |
| `knowledgator/gliner-pii-base-v1.0` | Apache-2.0; ONNX FP16 330 MB, UINT8 197 MB; lingue non elencate | scheda Hugging Face |
| `onnx-community/gliner_multi_pii-v1` | file `model_int8.onnx` ~349 MB | risultato di ricerca; licenza del repository **non confermata** |
| Presidio | licenza MIT; repository spostato in `data-privacy-stack/presidio`; riconoscitori italiani `IT_FISCAL_CODE`, `IT_DRIVER_LICENSE`, `IT_VAT_CODE`, `IT_PASSPORT`, `IT_IDENTITY_CARD` | GitHub e `presidio.dataprivacystack.org/supported_entities/` |
