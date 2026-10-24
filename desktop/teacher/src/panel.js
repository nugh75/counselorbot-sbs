const invoke = window.__TAURI__.core.invoke;
const phases = { preparing: 'Preparazione…', ready: 'Pronto', error: 'Errore', stopped: 'Fermato' };
const states = { running: 'attivo', stopped: 'fermo' };
const hints = {
  restore_backup: 'Puoi ripristinare l\'ultimo backup della cartella dati.',
  diagnostics: 'Usa «Esporta diagnostica» e invia il file a chi ti assiste.',
};
const $ = (id) => document.getElementById(id);

let currentTunnelUrl = null;
let lastRenderedUrl = null;

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

  // Aggiornamento Quick Tunnel
  const cf = status.sidecars.find((s) => s.name === 'cloudflared');
  const isQuickMode = status.tunnel_mode === 'quick';
  const isTunnelRunning = cf && cf.state === 'running';
  const tunnelUrl = status.tunnel_url;
  currentTunnelUrl = tunnelUrl;

  const badge = $('tunnel-badge');
  const startBtn = $('start-tunnel');
  const stopBtn = $('stop-tunnel');
  const openTunnelBtn = $('open-tunnel');
  const copyBtn = $('copy-tunnel');
  const warning = $('tunnel-warning');
  const content = $('tunnel-content');

  if (tunnelUrl) {
    badge.textContent = 'Attivo';
    badge.className = 'badge active';
    startBtn.style.display = 'none';
    stopBtn.style.display = 'inline-block';
    stopBtn.disabled = false;
    openTunnelBtn.style.display = 'inline-block';
    openTunnelBtn.disabled = false;
    copyBtn.style.display = 'inline-block';
    copyBtn.disabled = false;
    warning.style.display = 'block';
    content.style.display = 'block';

    const link = $('tunnel-url-link');
    link.textContent = tunnelUrl;
    link.href = tunnelUrl;

    if (lastRenderedUrl !== tunnelUrl && window.QrCode) {
      $('qrcode').innerHTML = window.QrCode.generateSvg(tunnelUrl, 2, 180);
      lastRenderedUrl = tunnelUrl;
    }
  } else if (isQuickMode || isTunnelRunning) {
    badge.textContent = 'Avvio in corso…';
    badge.className = 'badge starting';
    startBtn.style.display = 'none';
    stopBtn.style.display = 'inline-block';
    stopBtn.disabled = false;
    openTunnelBtn.style.display = 'none';
    copyBtn.style.display = 'none';
    warning.style.display = 'block';
    content.style.display = 'none';
  } else {
    badge.textContent = 'Disattivato';
    badge.className = 'badge off';
    startBtn.style.display = 'inline-block';
    startBtn.disabled = status.phase !== 'ready';
    stopBtn.style.display = 'none';
    openTunnelBtn.style.display = 'none';
    copyBtn.style.display = 'none';
    warning.style.display = 'none';
    content.style.display = 'none';
    lastRenderedUrl = null;
  }
}

async function refresh() {
  try {
    render(await invoke('shell_status'));
  } catch (error) {
    $('notice').textContent = String(error);
  }
}

// Azioni del pannello
$('open').onclick = () => invoke('open_in_browser').catch((e) => { $('notice').textContent = String(e); });
$('diagnostics').onclick = async () => {
  try {
    $('notice').textContent = 'Diagnostica salvata in ' + await invoke('export_diagnostics');
  } catch (error) {
    $('notice').textContent = String(error);
  }
};
$('quit').onclick = () => invoke('quit');

// Azioni del Quick Tunnel
$('start-tunnel').onclick = async () => {
  $('start-tunnel').disabled = true;
  $('start-tunnel').textContent = 'Avvio in corso…';
  try {
    await invoke('start_quick_tunnel');
    await refresh();
  } catch (error) {
    $('notice').textContent = 'Errore avvio tunnel: ' + error;
  } finally {
    $('start-tunnel').textContent = 'Avvia Quick Tunnel';
  }
};

$('stop-tunnel').onclick = async () => {
  $('stop-tunnel').disabled = true;
  $('stop-tunnel').textContent = 'Arresto in corso…';
  try {
    await invoke('stop_quick_tunnel');
    lastRenderedUrl = null;
    await refresh();
  } catch (error) {
    $('notice').textContent = 'Errore arresto tunnel: ' + error;
  } finally {
    $('stop-tunnel').textContent = 'Ferma Quick Tunnel';
  }
};

const openTunnel = (e) => {
  if (e) e.preventDefault();
  invoke('open_tunnel_in_browser').catch((err) => { $('notice').textContent = String(err); });
};
$('open-tunnel').onclick = openTunnel;
$('tunnel-url-link').onclick = openTunnel;

$('copy-tunnel').onclick = () => {
  if (currentTunnelUrl) {
    navigator.clipboard.writeText(currentTunnelUrl)
      .then(() => {
        const orig = $('copy-tunnel').textContent;
        $('copy-tunnel').textContent = 'Copiato!';
        setTimeout(() => { $('copy-tunnel').textContent = orig; }, 2000);
      })
      .catch((err) => {
        $('notice').textContent = 'Impossibile copiare l\'URL: ' + err;
      });
  }
};

refresh();
setInterval(refresh, 1000);
