// Schermata «docente offline»: controlla il server ogni 10 s e torna alla pagina richiesta appena risponde.
(function (root) {
  var INTERVAL_MS = 10000;

  function isOnline(response) {
    return Boolean(response) && response.status < 500;
  }

  function check(fetchFn) {
    return fetchFn('/', { cache: 'no-store', headers: { 'X-Offline-Probe': '1' } })
      .then(isOnline, function () { return false; });
  }

  function start(doc, fetchFn, reload, setTimer) {
    var state = doc.getElementById('state');
    var busy = false;
    function attempt() {
      if (busy) return Promise.resolve(false);
      busy = true;
      state.textContent = 'Controllo in corso…';
      return check(fetchFn).then(function (online) {
        busy = false;
        if (online) {
          reload();
        } else {
          state.textContent = 'Il docente non è ancora online. Nuovo tentativo automatico ogni 10 secondi.';
        }
        return online;
      });
    }
    doc.getElementById('retry').addEventListener('click', attempt);
    setTimer(attempt, INTERVAL_MS);
    return attempt;
  }

  root.CounselorbotOffline = { INTERVAL_MS: INTERVAL_MS, isOnline: isOnline, check: check, start: start };

  if (typeof document !== 'undefined' && document.getElementById('retry')) {
    // Il service worker serve questa pagina all'URL richiesto: ricaricarlo riporta alla pagina vera.
    start(document, fetch.bind(root), function () { location.reload(); }, setInterval);
  }
})(typeof window !== 'undefined' ? window : globalThis);
