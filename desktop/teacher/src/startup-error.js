(() => {
  const invoke = window.__TAURI__.core.invoke;
  const message = document.getElementById('startup-message');
  document.getElementById('quit').addEventListener('click', () => invoke('quit'));
  invoke('startup_error').then((error) => {
    message.textContent = error;
  }).catch(() => {
    message.textContent = 'Impossibile leggere il dettaglio dell’errore. Contatta l’assistenza.';
  });
})();
