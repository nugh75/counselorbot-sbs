<!-- pdf2md {"body_sha256": "1a57a9a0bd92118c280d21943663b48bf47cb6e3b26b9c00aa8d5dabc39c4da0", "engine": "1.28.2", "pages": [1, 2, 3], "plain_text_pages": [1, 2], "pymupdf": "1.28.2", "source_sha256": "d8bc92980c6b3fc06f2e9681a2fc096f449b5917fc8031635b16e630df699912", "textless_pages": [], "version": "3"} -->

<!-- pagina 1 -->

Formulario per la Validazione e lo Scoring dei
                    Questionari


                 Progetto CounselorBot / CompetenzeStrategiche.it

                                30 Maggio 2026



1  Introduzione

Questo documento raccoglie in modo ordinato e formalizzato le formule matematiche e stati-
stiche utilizzate durante lo scoring provvisorio (fase sperimentale) e la validazione psicometrica
definitiva della versione in svedese e inglese dei questionari (QSA, QSAr, ZTPI).


2  Elaborazione delle Risposte (Scoring)

2.1  Inversione delle Risposte (Reverse Scoring)

Alcuni item sono formulati in direzione contraria rispetto al costrutto misurato.  Prima di
calcolare la media o la somma del fattore, tali risposte vanno invertite.
Dati:

   • val: Risposta data dal soggetto.

   • scale min: Valore minimo della scala Likert (es. 1).

   • scale max: Valore massimo della scala Likert (es. 4).

La formula di inversione `e:

                                valinvertito = (scale max + scale min) −val                       (1)


2.2  Formula di Conversione Lineare Sperimentale (Fallback)

In assenza di tabelle normative basate su campioni reali, il sistema mappa linearmente la media
dei punteggi (nell’intervallo [scale min, scale max]) sulla scala Stanine (da 1 a 9).
Sia average la media delle risposte agli item del fattore (dopo l’inversione degli item contrari):

                                                                8
     Staninesperimentale = round  1 + (average −scale min) ×                               (2)
                                                             scale max −scale min

Dove la funzione round(x) indica l’arrotondamento all’intero pi`u vicino:

   • Se la parte decimale di x `e inferiore a 0.5, si arrotonda per difetto (es. 6.33 →6).

   • Se la parte decimale di x `e pari o superiore a 0.5, si arrotonda per eccesso (es. 6.50 →7).





                                         1

<!-- pagina 2 -->

3  Analisi Psicometriche di Affidabilit`a

3.1  Alpha di Cronbach (α)

Valuta la coerenza interna di una scala sotto l’ipotesi che gli item abbiano lo stesso peso e la
stessa varianza di errore (modello tau-equivalente).


                          PK                     K                                                        i=1 σ2i !                       α =        1 −                                           (3)
                    K −1        σ2X

Dove:

   • K: Numero di item della scala.

   • σ2i : Varianza dell’item i-esimo.

   • σ2X: Varianza del punteggio totale della scala (somma di tutti gli item).

Nota sulla Varianza (σ2) e sulla Deviazione Standard (σ): La deviazione standard
(σ) rappresenta la misura di quanto  i punteggi singoli si disperdono (ovvero si allontanano)
in media dal valore medio del gruppo. La varianza (σ2)  `e semplicemente  il quadrato della
deviazione standard.


3.2  Omega di McDonald (ω)

Calcola la coerenza interna basandosi sui pesi fattoriali derivati dall’analisi fattoriale confirma-
toria. `E pi`u appropriato per variabili ordinali o con pesi differenti.


                                                             2
                       PK
                                                  i=1 λi
                        ω =                                                       (4)                                                       2
                    PK                                            i=1 λi  + PKi=1 θi

Dove:

   • λi: Carico fattoriale (factor loading) dell’item i-esimo sul fattore latente.

   • θi: Varianza residua (errore di misurazione) dell’item i-esimo.

Nota sul Carico Fattoriale (λi):  Il carico fattoriale indica la forza della relazione tra la
singola domanda e il fattore psicologico latente (solitamente varia tra −1 e +1). Pi`u il valore `e
vicino a 1 o −1, pi`u la domanda `e un indicatore affidabile del fattore (valori > 0.50 sono accet-
tabili, > 0.70 ottimi). Non si calcola a mano, ma viene estratto automaticamente tramite
software statistici (come R con la libreria lavaan) eseguendo l’analisi fattoriale confirmatoria.


4  Analisi Fattoriale Confirmatoria (CFA)

L’analisi fattoriale confirmatoria verifica se la struttura dei fattori ipotizzata trovi riscontro
nei dati empirici raccolti. A tal fine si confronta la matrice dei dati reali con quella teorica
attraverso indici di bont`a di adattamento (fit indices).





                                         2

<!-- pagina 3 -->

**4.1** **Root** **Mean** **Square** **Error** **of** **Approximation** **(RMSEA)**



Indice di discrepanza che misura quanto il modello teorico si discosta dai dati per grado di
libert`a.




~~�~~



RMSEA =



max




<u>�</u> _<u>χ</u>_ <sup>2</sup> _<u>−</u>_ _<u>df</u>_
0 _,_
_df_ _×_ ( _N_ _−_ 1)




<u>�</u>
(5)



Dove:


  - _χ_ <sup>2</sup> : Statistica del Chi-quadro del modello (misura la discrepanza totale tra modello e
realt`a).


  - _df_ : Gradi di libert`a (indicano la complessit`a e i vincoli del modello).


  - _N_ : Numerosit`a del campione.


**Nota** **sul** **Chi-quadro** **(** _χ_ <sup>2</sup> **):** Misura lo “sbandamento” totale tra ci`o che prevede la teoria dei
fattori e ci`o che accade nelle risposte reali degli studenti. Se la teoria descrivesse perfettamente
i dati reali senza alcun errore, il Chi-quadro sarebbe pari a 0. Pi`u i dati reali sono distanti dalla
teoria, pi`u il Chi-quadro cresce.
**Nota** **sui** **Gradi** **di** **Libert`a** **(** _df_ **):** Rappresentano il numero di informazioni indipendenti
rimaste libere di variare dopo aver applicato i vincoli del nostro modello (cio`e l’aver deciso quali
domande appartengono a quali fattori). Pi`u un modello `e semplice e vincolato, pi`u alti saranno
i gradi di libert`a, permettendoci di verificare se il modello `e solido o se si adatta ai dati solo per
puro caso.
**Nota** **sull’RMSEA:** Questo indice misura l’errore commesso se usiamo il modello a fattori per
descrivere i dati reali. Poich´e misura l’errore, **pi`u** **`e** **basso,** **meglio** **`e** . Un valore inferiore a
0 _._ 05 indica che il modello teorico descrive i dati quasi alla perfezione.


**4.2** **Comparative** **Fit** **Index** **(CFI)**


Indice di fit relativo che confronta il modello ipotizzato con un modello di indipendenza (nullo).



CFI = 1 _−_ <sup>max(0</sup> <sup>_, χ_</sup> <sup>2</sup>



(6)

<sup>2</sup> nullo <sup>_−_</sup> <sup>_df_</sup> <sup>nullo)</sup>




<sup>max(0</sup> <sup>_, χ_</sup> <u>modello</u> <sup>2</sup> <sup>_−_</sup> <sup>_df_</sup> <sup><u>modello)</u></sup>

max(0 _, χ_ <sup>2</sup> nullo <sup>_−_</sup> <sup>_df_</sup> <sup>nullo)</sup>



Soglie di accettazione: CFI _>_ 0 _._ 90 (accettabile), CFI _>_ 0 _._ 95 (ottimo).
**Nota** **sul** **CFI:** Questo indice confronta la bont`a del nostro modello a fattori con un modello
”peggiore possibile” in cui si assume che le risposte alle domande siano slegate tra loro. Un
valore di 0 _._ 95 indica che il nostro modello riduce l’errore e cattura le relazioni reali al 95%
rispetto a una struttura casuale. **Pi`u** **`e** **alto** **(fino** **a** 1 _._ 00 **),** **meglio** **`e** .


3
