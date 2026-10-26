const invoke = typeof window !== 'undefined' && window.__TAURI__ ? window.__TAURI__.core.invoke : null;
// Domain-based tunnels remain preparatory; this release uses Quick Tunnel.
const NAMED_TUNNELS_ENABLED = false;
const phases = { preparing: 'Preparazione…', ready: 'Pronto', error: 'Errore', stopped: 'Fermato' };
const states = { running: 'attivo', stopped: 'fermo' };
const hints = {
  restore_backup: 'Puoi ripristinare l\'ultimo backup della cartella dati.',
  diagnostics: 'Usa «Esporta diagnostica» e invia il file a chi ti assiste.',
};
const $ = (id) => (typeof document !== 'undefined' ? document.getElementById(id) : null);

let currentTunnelUrl = null;
let lastRenderedUrl = null;
let selectedMode = 'quick';
let hasSavedToken = false;
let initialSettingsLoaded = false;

function validateDomainInput(domain) {
  const trimmed = (domain || '').trim();
  if (!trimmed) return { ok: false, msg: 'Inserisci un dominio personalizzato.' };
  const withoutScheme = trimmed.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const host = withoutScheme;
  if (!host || host.includes('/') || host.includes(':') || host.includes(' ') || host.includes('@') || !host.includes('.')) {
    return { ok: false, msg: 'Dominio non valido (es. counselor.tuascuola.it).' };
  }
  const parts = host.split('.');
  for (const part of parts) {
    if (!part || part.startsWith('-') || part.endsWith('-') || !/^[a-zA-Z0-9-]+$/.test(part)) {
      return { ok: false, msg: 'Formato dominio non valido.' };
    }
  }
  return { ok: true, domain: 'https://' + host };
}

function validateTokenInput(token, optional = false) {
  const trimmed = (token || '').trim();
  if (!trimmed && optional) return { ok: true, token: '' };
  if (!trimmed) return { ok: false, msg: 'Inserisci il token del tunnel.' };
  if (trimmed.length < 20) return { ok: false, msg: 'Token troppo corto (almeno 20 caratteri).' };
  if (!/^[a-zA-Z0-9+/_=-]+$/.test(trimmed)) {
    return { ok: false, msg: 'Il token contiene caratteri non validi.' };
  }
  return { ok: true, token: trimmed };
}

async function loadInitialSettings() {
  if (initialSettingsLoaded) return;
  try {
    const settings = await invoke('get_tunnel_settings');
    if (settings) {
      if (settings.custom_domain) {
        $('custom-domain-input').value = settings.custom_domain.replace(/^https?:\/\//, '');
      }
      if (settings.has_token) {
        hasSavedToken = true;
        $('token-status-hint').textContent = '✅ Token Cloudflare configurato e salvato in sicurezza.';
      }
      if (NAMED_TUNNELS_ENABLED && settings.mode === 'named') {
        selectedMode = 'named';
        $('mode-named').checked = true;
      } else {
        selectedMode = 'quick';
        $('mode-quick').checked = true;
      }
      updateModeView();
    }
    initialSettingsLoaded = true;
  } catch (err) {
    console.warn('Errore lettura impostazioni iniziali:', err);
  }
}

function updateModeView() {
  if (!NAMED_TUNNELS_ENABLED) selectedMode = 'quick';
  $('named-mode-option').style.display = NAMED_TUNNELS_ENABLED ? 'flex' : 'none';
  $('mode-named').disabled = !NAMED_TUNNELS_ENABLED;
  const isNamed = selectedMode === 'named';
  $('named-config-panel').style.display = isNamed ? 'block' : 'none';
  if (isNamed) {
    $('tunnel-warning').style.display = 'none';
    $('named-info').style.display = 'block';
  } else {
    $('named-info').style.display = 'none';
  }
}

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

  // Aggiornamento Tunnel
  const cf = status.sidecars.find((s) => s.name === 'cloudflared');
  const isTunnelRunning = cf && cf.state === 'running';
  const activeMode = status.tunnel_mode || selectedMode;
  const isNamedMode = NAMED_TUNNELS_ENABLED && activeMode === 'named';
  const tunnelUrl = status.tunnel_url;
  currentTunnelUrl = tunnelUrl;

  if (status.has_tunnel_token) {
    hasSavedToken = true;
    $('token-status-hint').textContent = '✅ Token Cloudflare configurato e salvato in sicurezza.';
  }

  const badge = $('tunnel-badge');
  const startQuickBtn = $('start-tunnel');
  const startNamedBtn = $('start-named-tunnel');
  const stopBtn = $('stop-tunnel');
  const openTunnelBtn = $('open-tunnel');
  const copyBtn = $('copy-tunnel');
  const warning = $('tunnel-warning');
  const namedInfo = $('named-info');
  const content = $('tunnel-content');
  const qrCaption = $('qr-caption');

  if (tunnelUrl) {
    badge.textContent = 'Attivo';
    badge.className = 'badge active';
    startQuickBtn.style.display = 'none';
    startNamedBtn.style.display = 'none';
    stopBtn.style.display = 'inline-block';
    stopBtn.disabled = false;
    openTunnelBtn.style.display = 'inline-block';
    openTunnelBtn.disabled = false;
    copyBtn.style.display = 'inline-block';
    copyBtn.disabled = false;

    if (isNamedMode) {
      warning.style.display = 'none';
      namedInfo.style.display = 'block';
      if (qrCaption) qrCaption.textContent = 'Inquadra con smartphone o tablet per accedere alla classe';
    } else {
      warning.style.display = 'block';
      namedInfo.style.display = 'none';
      if (qrCaption) qrCaption.textContent = 'Indirizzo del tunnel. Il link di invito agli studenti si genera dalla classe.';
    }

    content.style.display = 'block';

    const link = $('tunnel-url-link');
    link.textContent = tunnelUrl;
    link.href = tunnelUrl;

    if (lastRenderedUrl !== tunnelUrl && window.QrCode) {
      $('qrcode').innerHTML = window.QrCode.generateSvg(tunnelUrl, 2, 180);
      lastRenderedUrl = tunnelUrl;
    }
  } else if (isTunnelRunning || status.tunnel_mode === 'quick' || status.tunnel_mode === 'named') {
    badge.textContent = 'Avvio in corso…';
    badge.className = 'badge starting';
    startQuickBtn.style.display = 'none';
    startNamedBtn.style.display = 'none';
    stopBtn.style.display = 'inline-block';
    stopBtn.disabled = false;
    openTunnelBtn.style.display = 'none';
    copyBtn.style.display = 'none';

    if (isNamedMode) {
      warning.style.display = 'none';
      namedInfo.style.display = 'block';
    } else {
      warning.style.display = 'block';
      namedInfo.style.display = 'none';
    }

    content.style.display = 'none';
  } else {
    badge.textContent = 'Disattivato';
    badge.className = 'badge off';

    if (selectedMode === 'quick') {
      startQuickBtn.style.display = 'inline-block';
      startQuickBtn.disabled = status.phase !== 'ready';
      startNamedBtn.style.display = 'none';
      warning.style.display = 'none';
      namedInfo.style.display = 'none';
    } else {
      startQuickBtn.style.display = 'none';
      startNamedBtn.style.display = 'inline-block';
      startNamedBtn.disabled = status.phase !== 'ready';
      warning.style.display = 'none';
      namedInfo.style.display = 'block';
    }

    stopBtn.style.display = 'none';
    openTunnelBtn.style.display = 'none';
    copyBtn.style.display = 'none';
    content.style.display = 'none';
    lastRenderedUrl = null;
  }
}

async function refresh() {
  try {
    await loadInitialSettings();
    render(await invoke('shell_status'));
  } catch (error) {
    $('notice').textContent = String(error);
  }
}

// Azioni del pannello
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  $('open').onclick = () => invoke('open_in_browser').catch((e) => { $('notice').textContent = String(e); });
  $('diagnostics').onclick = async () => {
    try {
      $('notice').textContent = 'Diagnostica salvata in ' + await invoke('export_diagnostics');
    } catch (error) {
      $('notice').textContent = String(error);
    }
  };
  $('quit').onclick = () => invoke('quit');

  // Modalità radio switch
  $('mode-quick').onchange = () => {
    selectedMode = 'quick';
    updateModeView();
    refresh();
  };
  $('mode-named').onchange = () => {
    selectedMode = 'named';
    updateModeView();
    refresh();
  };

  // Verifica e validazione parametri tunnel nominativo
  $('test-named-config').onclick = () => {
    const domainVal = $('custom-domain-input').value;
    const tokenVal = $('tunnel-token-input').value;
    const feedback = $('named-feedback');

    const domainRes = validateDomainInput(domainVal);
    if (!domainRes.ok) {
      feedback.textContent = domainRes.msg;
      feedback.className = 'config-feedback err';
      return;
    }

    const tokenRes = validateTokenInput(tokenVal, hasSavedToken);
    if (!tokenRes.ok) {
      feedback.textContent = tokenRes.msg;
      feedback.className = 'config-feedback err';
      return;
    }

    feedback.textContent = 'Parametri validi (' + domainRes.domain + ')';
    feedback.className = 'config-feedback ok';
  };

  // Salva configurazione tunnel nominativo
  $('save-named-config').onclick = async () => {
    const domainVal = $('custom-domain-input').value;
    const tokenVal = $('tunnel-token-input').value;
    const feedback = $('named-feedback');

    const domainRes = validateDomainInput(domainVal);
    if (!domainRes.ok) {
      feedback.textContent = domainRes.msg;
      feedback.className = 'config-feedback err';
      return;
    }

    const tokenRes = validateTokenInput(tokenVal, hasSavedToken);
    if (!tokenRes.ok) {
      feedback.textContent = tokenRes.msg;
      feedback.className = 'config-feedback err';
      return;
    }

    feedback.textContent = 'Salvataggio in corso…';
    feedback.className = 'config-feedback';

    try {
      await invoke('save_named_tunnel_config', {
        customDomain: domainRes.domain,
        token: tokenRes.token || null,
      });
      feedback.textContent = 'Configurazione salvata con successo.';
      feedback.className = 'config-feedback ok';
      if (tokenRes.token) {
        hasSavedToken = true;
        $('token-status-hint').textContent = '✅ Token Cloudflare configurato e salvato in sicurezza.';
        $('tunnel-token-input').value = '';
      }
      await refresh();
    } catch (err) {
      feedback.textContent = 'Errore salvataggio: ' + err;
      feedback.className = 'config-feedback err';
    }
  };

  // Avvio Quick Tunnel
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

  // Avvio Tunnel Nominativo
  $('start-named-tunnel').onclick = async () => {
    const domainVal = $('custom-domain-input').value;
    const tokenVal = $('tunnel-token-input').value;
    if (domainVal) {
      const domainRes = validateDomainInput(domainVal);
      if (domainRes.ok) {
        try {
          await invoke('save_named_tunnel_config', {
            customDomain: domainRes.domain,
            token: tokenVal.trim() || null,
          });
        } catch (_) {}
      }
    }

    $('start-named-tunnel').disabled = true;
    $('start-named-tunnel').textContent = 'Avvio in corso…';
    try {
      await invoke('start_named_tunnel');
      await refresh();
    } catch (error) {
      $('notice').textContent = 'Errore avvio tunnel: ' + error;
    } finally {
      $('start-named-tunnel').textContent = 'Avvia Tunnel nominativo';
    }
  };

  // Fermata Tunnel
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
      $('stop-tunnel').textContent = 'Ferma Tunnel';
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
}

async function initUpdater() {
  if (!invoke) return;
  const channelSelect = $('updater-channel-select');
  const checkBtn = $('check-updates-btn');
  const applyBtn = $('apply-update-btn');
  const notice = $('updater-notice');
  const details = $('update-details');
  const versionText = $('update-version-text');
  const notesText = $('update-notes-text');

  if (!channelSelect || !checkBtn) return;

  try {
    const channel = await invoke('get_updater_channel');
    if (channel) channelSelect.value = channel;
  } catch (err) {
    console.warn('Errore lettura canale aggiornamento:', err);
  }

  channelSelect.onchange = async () => {
    try {
      await invoke('set_updater_channel', { channel: channelSelect.value });
      notice.textContent = `Canale aggiornato a: ${channelSelect.value}`;
    } catch (err) {
      notice.textContent = 'Errore salvataggio canale: ' + err;
    }
  };

  checkBtn.onclick = async () => {
    checkBtn.disabled = true;
    checkBtn.textContent = 'Verifica in corso…';
    notice.textContent = '';
    applyBtn.style.display = 'none';
    details.style.display = 'none';

    try {
      const info = await invoke('check_for_updates');
      if (info && info.available) {
        notice.textContent = 'Aggiornamento disponibile!';
        versionText.textContent = `Versione ${info.version} (attuale: ${info.current_version})`;
        notesText.textContent = info.body || '';
        details.style.display = 'block';
        applyBtn.style.display = 'inline-block';
      } else {
        notice.textContent = `CounselorBot è già aggiornato (versione ${info ? info.current_version : ''}).`;
      }
    } catch (err) {
      notice.textContent = 'Errore verifica aggiornamenti: ' + err;
    } finally {
      checkBtn.disabled = false;
      checkBtn.textContent = 'Verifica aggiornamenti';
    }
  };

  applyBtn.onclick = async () => {
    applyBtn.disabled = true;
    applyBtn.textContent = 'Aggiornamento in corso…';
    notice.textContent = 'Esecuzione backup di sicurezza SQLite e applicazione aggiornamento…';

    try {
      const res = await invoke('apply_update');
      notice.textContent = res;
    } catch (err) {
      notice.textContent = 'Errore aggiornamento: ' + err;
      applyBtn.disabled = false;
      applyBtn.textContent = 'Aggiorna ora (con backup preventivo)';
    }
  };
}

// Export validation functions for Node unit tests
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    validateDomainInput,
    validateTokenInput,
  };
}

if (typeof window !== 'undefined' && window.__TAURI__) {
  refresh();
  setInterval(refresh, 1000);
  initUpdater();
}
