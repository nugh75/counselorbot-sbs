# Handoff — feature/add-student-by-email-836 (#836)

## Stato
In corso: implementazione fatta, verifiche in esecuzione.

## Fatto
- Tabella `group_invitations` (email minuscola unica per classe, `sent_at`, `accepted_at`); `create_all`, nessuna migrazione.
- Rotte docente `/admin/groups/{id}/invitations`: elenco in attesa, aggiunta, `…/{inv}/sent`, annullo. 404 con `AUTH_PROVIDER=local`.
- `accept_invitation` in `/groups/join`: chi apre il link della classe con la stessa `Remote-Email` entra con `joined_via="teacher"`; proprietario e account demo esclusi (#835).
- UI minima `ClassEmailInvitations.tsx` nella card «Invito studenti» (solo ai4auth): campo email, elenco in attesa, Invia/Invia di nuovo (`mailto:`), Annulla.
- Docs: funzionalità, CONTEXT.md.

## Decisioni
- ai4auth non ha inviti né creazione utente senza password: lo studente si registra da sé (signup o Google) e sceglie la password.
- Counselorbot non invia email: «Invia» apre il client di posta del docente; nessuna email nei test.
- Accettazione solo dal link della classe: la registrazione ai4auth con password non verifica l’email, quindi non si accetta al semplice login.
- Desktop (fornitore locale): studenti senza email, resta l’abbinamento; sezione nascosta.

## Verifiche
- `backend/tests/test_group_invitations.py` + `test_test_data_exclusion.py` (Postgres di test isolato).
- `frontend/src/lib/class-invitations.test.ts` 2/2; class-settings/groups-directory/class-council 17/17; `tsc` pulito (salvo PNG dei guide, solo per assenza di `next-env.d.ts` nel worktree).
- `make guidance-check` ok.

## Prossimi passi
Commit, push, PR verso main.

## Blocchi e rischi
- Il link della classe resta aperto a chiunque abbia il codice, come prima.
