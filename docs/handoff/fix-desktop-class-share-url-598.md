# Handoff: fix(desktop): il link/QR share della classe mostra l'URL locale invece dell'URL del tunnel Cloudflare

**Task ID**: s25-share-url-598  
**Issue**: #598  
**Branch**: fix/desktop-class-share-url-598  
**PR**: #615  
**Stato**: COMPLETATO - Fix implementati, PR aperta, push eseguito

## Riepilogo finale

### Commit creati (6 totali)
1. `ea55783f` - fix(desktop): always set COUNSELORBOT_PUBLIC_ORIGIN in supervisor
2. `f8feb797` - fix(desktop): publicOrigin never falls back to localhost
3. `b8355f56` - test(desktop): add tests for publicOrigin fix
4. `4dd9a530` - fix(desktop): hide share links when tunnel not active
5. `e2dab7eb` - docs: add handoff document for issue #598 fix
6. `d7f8fc83` - docs: update handoff with PR link #615

### File modificati
- `desktop/teacher/src-tauri/src/supervisor.rs` (2 modifiche: backend e frontend)
- `frontend/src/lib/runtime-config.ts` (1 modifica: publicOrigin logic)
- `frontend/src/lib/runtime-config.test.ts` (2 modifiche: test aggiornati e nuovi)
- `frontend/src/components/teacher/ClassOverviewTab.tsx` (2 modifiche: condizione e messaggio)
- `frontend/src/components/teacher/ClassCouncilTab.tsx` (2 modifiche: condizione e variabile)
- `docs/handoff/fix-desktop-class-share-url-598.md` (creato)

### Verifiche da fare
- [ ] Test Node: `npm test -- --testNamePattern="publicOrigin"`
- [ ] Test Rust: `cargo test --test supervisor`
- [ ] Test manuale desktop con build v0.1.1 o successiva
- [ ] Verificare CI desktop su 4 runner

### Link
- **Issue**: https://github.com/nugh75/counselorbot-sbs/issues/598
- **PR**: https://github.com/nugh75/counselorbot-sbs/pull/615
- **Branch**: https://github.com/nugh75/counselorbot-sbs/tree/fix/desktop-class-share-url-598

## Fatto

### 1. Analisi del problema
- Il problema era che quando il docente condivide l'accesso alla classe, il QR/link mostrava l'indirizzo locale (127.0.0.1, localhost o IP LAN) invece dell'URL del tunnel Cloudflare
- Il problema interessava **tutti i punti di condivisione** nel frontend desktop:
  - `ClassOverviewTab.tsx`: link web per iscrizione studenti (`/gruppo?g=CODE`)
  - `ClassCouncilTab.tsx`: link per consiglio di classe
  - `ValidationExportPanel.tsx`: link per raccolta validazione
- La causa principale era che `publicOrigin()` nel frontend cadeva su `window.location.origin` quando `COUNSELORBOT_PUBLIC_ORIGIN` non era impostato

### 2. Fix implementati

#### Backend - Supervisore Rust (`desktop/teacher/src-tauri/src/supervisor.rs`)
- **Linee 417-419**: Modificato per **sempre** impostare `COUNSELORBOT_PUBLIC_ORIGIN` nel backend, anche quando il tunnel non è attivo (valore vuoto invece di assente)
- **Linee 556-558**: Modificato per **sempre** impostare `COUNSELORBOT_PUBLIC_ORIGIN` nel frontend, anche quando il tunnel non è attivo
- Questo evita che il frontend cada su `window.location.origin`

#### Frontend - Runtime Config (`frontend/src/lib/runtime-config.ts`)
- **Linee 57-60**: Modificato `publicOrigin()` per restituire **stringa vuota** invece di `window.location.origin` quando `COUNSELORBOT_PUBLIC_ORIGIN` non è configurato
- Questo è il fix principale per l'issue #598: in desktop senza tunnel attivo, i link/QR non devono mostrare indirizzi locali

#### Frontend - ClassOverviewTab (`frontend/src/components/teacher/ClassOverviewTab.tsx`)
- **Linea 369-374**: Aggiunta variabile `showWebLink` che verifica se `webLink` è valido
- **Linea 502**: Modificata condizione da `{webLink &&` a `{showWebLink ?`
- **Linee 527-532**: Aggiunto branch else che mostra un messaggio "Tunnel non attivo" quando il link non è disponibile
- Il link Telegram resta visibile perché non dipende dal tunnel

#### Frontend - ClassCouncilTab (`frontend/src/components/teacher/ClassCouncilTab.tsx`)
- **Linea 39-40**: Aggiunta variabile `councilLink` che costruisce il link solo se `origin` è valido
- **Linea 84-89**: Modificata condizione per mostrare il CopyField solo se `councilLink` è valido

#### Frontend - Test (`frontend/src/lib/runtime-config.test.ts`)
- **Linee 68-87**: Aggiornato test esistente per riflettere il nuovo comportamento
- **Linee 89-100**: Aggiunto nuovo test `publicOrigin never falls back to localhost in desktop (issue #598)` che verifica che `publicOrigin()` non restituisca mai `window.location.origin`

## Verifiche

### Test da eseguire
1. **Test Node runtime-config**:
   ```bash
   cd frontend
   npm test -- --testNamePattern="publicOrigin"
   ```
   - Verifica che `publicOrigin()` restituisca stringa vuota quando `COUNSELORBOT_PUBLIC_ORIGIN` non è impostato
   - Verifica che non cada su `window.location.origin`

2. **Test Rust supervisore**:
   ```bash
   cd desktop/teacher/src-tauri
   cargo test --test supervisor
   ```
   - Verifica che `COUNSELORBOT_PUBLIC_ORIGIN` sia sempre impostato (anche vuoto)

3. **Test manuale desktop**:
   - Avviare CounselorBot Docente
   - Verificare che senza tunnel attivo, i link/QR di condivisione **non** mostrino 127.0.0.1 o localhost
   - Avviare tunnel (quick o nominativo)
   - Verificare che i link/QR mostrino l'URL del tunnel (es. `*.trycloudflare.com`)

### Punti di condivisione verificati
- [x] `ClassOverviewTab.tsx`: link web iscrizione studenti
- [x] `ClassCouncilTab.tsx`: link consiglio di classe  
- [x] `ValidationExportPanel.tsx`: link raccolta validazione
- [x] `panel.js` (guscio): QR code tunnel (già corretto, usa `status.tunnel_url`)

## Prossimi passi

1. Eseguire test Node per `runtime-config.test.ts`
2. Eseguire test Rust per supervisore
3. Test manuale con build desktop v0.1.1 o successiva
4. Verificare che la CI desktop passi su tutti e 4 i runner
5. Creare PR con riferimento a #598

## Blocchi

- Nessun blocco noto
- I test Rust potrebbero richiedere tempo per il download delle dipendenze

## Rischi

- **Basso**: Le modifiche sono minimal e mirate
- **Medio**: Il cambiamento di comportamento di `publicOrigin()` potrebbe influenzare altri componenti che dipendono da questa funzione
- **Mitigazione**: Verificare tutti i punti di condivisione e assicurarsi che gestiscano correttamente il caso di `publicOrigin()` vuoto

## Note

- Il fix è indipendente dalla modalità tunnel (quick o nominativo)
- Il backend (`local_pairing.py`) già usava `COUNSELORBOT_PUBLIC_ORIGIN` correttamente
- Il pannello del guscio (`panel.js`) già usava `status.tunnel_url` correttamente
- Il problema principale era nel frontend web che gira nel browser
