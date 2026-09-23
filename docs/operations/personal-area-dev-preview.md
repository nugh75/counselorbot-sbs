# Anteprima di sviluppo dell’Area personale

Il pilota della testata comune è `/profilo/orientamento`; l’ingresso `/profilo`
resta disponibile. Il proxy `frontend/scripts/personal-area-preview.mjs` usa
esclusivamente dati dimostrativi in memoria. Non inoltra richieste API al backend,
blocca le scritture e limita l’ottimizzatore delle immagini agli asset pubblici.
Le altre pagine mostrano un avviso sui limiti della preview. La guida è accessibile.

Avviare tre processi separati, mantenendoli attivi:

```bash
# Terminale 1, dalla directory frontend
npm run dev -- --hostname 127.0.0.1 --port 3108

# Terminale 2, dalla directory frontend
node scripts/personal-area-preview.mjs

# Terminale 3: configurazione isolata dal tunnel di produzione
mkdir -p /tmp/counselorbot-personal-preview
printf '{}\n' > /tmp/counselorbot-personal-preview/tunnel.yml
cloudflared tunnel --config /tmp/counselorbot-personal-preview/tunnel.yml --url http://127.0.0.1:3109 --no-autoupdate
```

Aprire l’URL temporaneo stampato da cloudflared, seguito da
`/profilo/orientamento`. Il link scade quando il processo viene fermato; un nuovo
avvio genera un nuovo indirizzo. Fermare i tre processi con Ctrl+C nei rispettivi
terminali. Non usare il proxy come sistema di autenticazione o per dati reali.

Le porte possono essere cambiate tramite `PREVIEW_DEV_PORT` e `PREVIEW_PORT`;
la prima deve corrispondere alla porta passata a Next, la seconda al tunnel.

Verifiche riproducibili dalla directory frontend, con i primi due processi attivi:

```bash
node --test --experimental-strip-types tests/personal-area-header.test.mjs
GUIDE_BASE_URL=http://127.0.0.1:3108 GUIDE_SCREENS=orientation node --experimental-strip-types scripts/capture-guide.mjs
```

I test coprono le sei lingue, 320/390/1440 px, mobile orizzontale, temi chiaro/scuro,
focus e tastiera, destinazioni, filtri, parametri URL e isolamento delle API.
Il rebuild dell’immagine Docker può essere eseguito senza sostituire il container
di produzione durante la revisione della preview: `docker compose build frontend`.
