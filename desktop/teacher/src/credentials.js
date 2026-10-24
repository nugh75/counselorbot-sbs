/* The native panel owns these inputs. Nothing is stored in browser storage. */
(function () {
  const invoke = window.__TAURI__.core.invoke;
  const $ = (id) => document.getElementById(id);
  const results = {
    accepted: 'Connessione verificata. Il servizio ha accettato la chiave; disponibilità dei modelli e credito dipendono dal tuo account.',
    rejected: 'Il servizio ha rifiutato la chiave o i suoi permessi.',
    rate_limited: 'Limite del servizio raggiunto. Riprova più tardi.',
    unavailable: 'Verifica non riuscita: controlla rete e disponibilità del servizio.',
  };
  let busy = false;
  let changed = false;
  const notice = (text) => { $('credentials-notice').textContent = text; };

  function controls(disabled) {
    for (const control of $('credentials-card').querySelectorAll('button, input')) {
      control.disabled = disabled || control.dataset.unavailable === 'true';
    }
    $('apply-credentials').disabled = disabled || !changed;
  }

  async function operation(job) {
    if (busy) return;
    busy = true;
    controls(true);
    notice('Operazione in corso…');
    try { await job(); }
    catch { notice('Operazione non riuscita. Controlla che il portachiavi sia sbloccato e la chiave sia corretta (senza spazi).'); }
    finally { busy = false; controls(false); }
  }

  async function load() {
    const rows = await invoke('credential_status');
    const cards = rows.map((row) => {
      const form = document.createElement('form');
      form.className = 'credential';
      const label = document.createElement('label');
      label.htmlFor = 'key-' + row.id;
      label.textContent = row.label;
      const status = document.createElement('span');
      status.className = 'muted';
      status.textContent = row.configured ? 'Configurata' : 'Mancante';
      const input = document.createElement('input');
      input.id = label.htmlFor;
      input.type = 'password';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.maxLength = 4096;
      input.setAttribute('aria-label', 'Nuova chiave ' + row.label);
      input.placeholder = row.configured ? 'Inserisci una nuova chiave per sostituirla' : 'Inserisci la chiave';
      const actions = document.createElement('div');
      actions.className = 'actions';
      const save = document.createElement('button');
      save.type = 'submit';
      save.textContent = 'Salva nel portachiavi';
      const test = document.createElement('button');
      test.type = 'button';
      test.textContent = 'Testa connessione';
      test.dataset.unavailable = String(!row.testable);
      test.disabled = !row.testable;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Rimuovi';
      remove.dataset.unavailable = String(!row.configured);
      remove.disabled = !row.configured;
      actions.append(save, test, remove);
      form.append(label, status, input, actions);
      if (!row.testable) {
        const help = document.createElement('p');
        help.className = 'muted';
        help.textContent = 'Conservazione sicura disponibile; verifica remota non disponibile.';
        form.appendChild(help);
      }
      form.onsubmit = (event) => {
        event.preventDefault();
        if (!input.value) { notice('Inserisci prima una chiave.'); return; }
        operation(async () => {
          // Clear the DOM before awaiting IPC, including failure paths.
          const pending = invoke('save_credential', { provider: row.id, value: input.value });
          input.value = '';
          await pending;
          changed = true;
          notice('Chiave salvata. Applica le modifiche per riavviare i servizi locali.');
          await load();
        });
      };
      test.onclick = () => operation(async () => {
        const pending = invoke('test_credential', { provider: row.id, value: input.value || null });
        input.value = '';
        notice(results[await pending] || results.unavailable);
      });
      remove.onclick = () => operation(async () => {
        input.value = '';
        await invoke('remove_credential', { provider: row.id });
        changed = true;
        notice('Chiave rimossa dal portachiavi. Applica le modifiche per rimuoverla anche dai servizi in esecuzione.');
        await load();
      });
      return form;
    });
    $('credential-list').replaceChildren(...cards);
    controls(busy);
  }

  $('refresh-credentials').onclick = () => operation(async () => { await load(); notice('Stato del portachiavi aggiornato.'); });
  $('apply-credentials').onclick = () => operation(async () => {
    await invoke('apply_credentials');
    changed = false;
    notice('Servizi riavviati con le credenziali aggiornate.');
  });
  window.addEventListener('pagehide', () => {
    for (const input of $('credential-list').querySelectorAll('input')) input.value = '';
  });
  operation(async () => { await load(); notice('Stato del portachiavi aggiornato.'); });
})();
