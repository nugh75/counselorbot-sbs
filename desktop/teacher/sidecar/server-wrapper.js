'use strict';
// Frontend Next standalone come sidecar dell'app docente (ADR-0002 §2.4).
//
// Avvolge il `server.js` generato da `next build` senza modificarlo:
// - `--lifeline`: a EOF su stdin (il guscio e' morto o chiede l'arresto) chiude
//   i server HTTP con server.close() e dopo 10 s esce comunque; idem a SIGTERM;
// - codice di uscita 4 se la porta e' occupata (il guscio riprova con un'altra).
// PORT e HOSTNAME arrivano dal guscio e li legge server.js.

const http = require('node:http');
const path = require('node:path');

const EXIT_PORT_IN_USE = 4;
const STOP_GRACE_MS = 10_000;
const servers = [];

// Next creates its server with http.createServer: wrap it to get the handle.
const createServer = http.createServer;
http.createServer = function wrappedCreateServer(...args) {
    const server = createServer.apply(this, args);
    // Registered before Next's own listeners, so it runs first.
    server.on('error', (error) => {
        if (error && error.code === 'EADDRINUSE') {
            console.error(`server-wrapper: porta ${process.env.PORT} occupata`);
            process.exit(EXIT_PORT_IN_USE);
        }
    });
    servers.push(server);
    return server;
};

let stopping = false;
function stop(reason) {
    if (stopping) return;
    stopping = true;
    console.log(`server-wrapper: ${reason}, arresto`);
    setTimeout(() => process.exit(0), STOP_GRACE_MS).unref();
    let open = servers.length;
    if (open === 0) process.exit(0);
    for (const server of servers) {
        server.close(() => {
            open -= 1;
            if (open === 0) process.exit(0);
        });
        server.closeIdleConnections();
    }
}

if (process.argv.includes('--lifeline')) {
    process.stdin.on('end', () => stop('stdin chiuso'));
    process.stdin.on('error', () => stop('stdin in errore'));
    process.stdin.resume();
}
process.on('SIGTERM', () => stop('SIGTERM'));

require(path.join(__dirname, 'server.js'));
