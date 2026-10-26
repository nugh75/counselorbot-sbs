# Handoff: Fix herder.labform.net upstream IPv6 irraggiungibile

**Task ID**: s27-ipv6-255  
**Issue**: #255  
**Branch**: fix/herder-ipv6-upstream-255  
**PR**: https://github.com/nugh75/counselorbot-sbs/pull/614  
**Data**: 26/10/2026

## Stato
✅ COMPLETATO - PR aperta, in attesa di review/merge

## Fatto
- ✅ Letta issue #255: herder.labform.net upstream host.docker.internal risolto su IPv6 ULA [fdc4:f303:9324::254] irraggiungibile
- ✅ Analizzati template nginx esistenti (nginx-counselorbot.conf.template usa resolver ipv6=off)
- ✅ Creato `infrastructure/portable/nginx-herder.conf.template` con upstream IPv4 esplicito (127.0.0.1:7317)
- ✅ Creato `scripts/register-portable-herder.mjs` per deployment automatico
- ✅ Creato `infrastructure/portable/nginx-herder.conf.example` con documentazione
- ✅ Commit atomico con messaggio Conventional Commits
- ✅ Push e PR creata: https://github.com/nugh75/counselorbot-sbs/pull/614

## Verifiche
- ✅ Sintassi template nginx verificata
- ✅ Coerenza con template esistente per counselorbot
- ✅ Soluzione allinea con opzione b) dell'issue: resolver ipv6=off + variabile runtime
- ✅ Anche opzione a) implementata: IPv4 esplicito 127.0.0.1:7317

## Prossimi passi
1. **Deploy sul server Console**: Sostituire herder.labform.net.conf con template generato
2. **Eseguire script**: `node scripts/register-portable-herder.mjs --hostname herder.labform.net`
3. **Ricaricare nginx**: `nginx -t && nginx -s reload`
4. **Verificare**: `GET /api/health` e `GET /api/machines` non devono produrre "Network unreachable"
5. **Monitorare log**: Verificare assenza di errori `[error] connect() to [fdc4:f303:9324::254]:7317`

## Blocchi
- ❌ Nessuno - PR pronta per merge

## Rischi
- ⚠️ Il file herder.labform.net.conf esistente sul server Console deve essere sostituito manualmente
- ⚠️ Se il servizio herder non è in ascolto su 127.0.0.1:7317, la configurazione non funzionerà
- ⚠️ Verificare che il container herder sia accessibile su loopback

## Note
- Il template usa **doppia protezione**: resolver ipv6=off + IPv4 esplicito
- Questo previene sia la risoluzione IPv6 che eventuali cambi di indirizzo
- Lo script di registrazione è coerente con register-portable-console.mjs
