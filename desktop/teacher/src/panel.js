const invoke = window.__TAURI__.core.invoke;
const phases = { preparing: 'Preparazione…', ready: 'Pronto', error: 'Errore', stopped: 'Fermato' };
const states = { running: 'attivo', stopped: 'fermo' };
const hints = {
  restore_backup: 'Puoi ripristinare l\'ultimo backup della cartella dati.',
  diagnostics: 'Usa «Esporta diagnostica» e invia il file a chi ti assiste.',
};
const $ = (id) => document.getElementById(id);

function render(status) {
  $('version').textContent = 'Versione ' + status.version;
  $('phase').textContent = phases[status.phase] || status.phase;
  $('phase').className = status.phase;
  $('message').textContent = [status.message, hints[status.hint]].filter(Boolean).join(' ');
  $('folder').textContent = 'Cartella dati: ' + status.data_dir;
  $('open').disabled = !status.frontend_url;
  const rows = status.sidecars.map((s) => {
    const tr = document.createElement('tr');
    const detail = s.port ? 'porta ' + s.port : '';
    const extra = s.name === 'cloudflared' && status.tunnel_url ? status.tunnel_url : detail;
    for (const text of [s.name, states[s.state] || s.state, extra, s.restarts ? s.restarts + ' riavvii' : '']) {
      const td = document.createElement('td');
      td.textContent = text;
      tr.appendChild(td);
    }
    return tr;
  });
  $('sidecars').replaceChildren(...rows);
}

async function refresh() {
  try { render(await invoke('shell_status')); } catch (error) { $('notice').textContent = String(error); }
}

$('open').onclick = () => invoke('open_in_browser').catch((e) => { $('notice').textContent = String(e); });
$('diagnostics').onclick = async () => {
  try { $('notice').textContent = 'Diagnostica salvata in ' + await invoke('export_diagnostics'); }
  catch (error) { $('notice').textContent = String(error); }
};
$('quit').onclick = () => invoke('quit');
refresh();
setInterval(refresh, 1000);
