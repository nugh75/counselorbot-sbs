if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw-offline.js').catch(function () {});
}
