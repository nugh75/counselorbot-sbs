// Isolated, read-only preview: never forwards API requests to the real backend.
import http from 'node:http';

const devPort = Number(process.env.PREVIEW_DEV_PORT || 3108);
const previewPort = Number(process.env.PREVIEW_PORT || 3109);
const fixtures = {
    '/api/auth/me': { authenticated: true, username: 'preview.demo', name: 'Anteprima · Demo', email: 'preview@example.test', groups: ['studenti'], is_admin: false },
    '/api/user/account-preferences': { counselor_id: 1, counselor_ready: true, notebook_ready: true, setup_completed: true },
    '/api/orientation/status': { required: false, completed: true },
    '/api/tavolo/enabled': { enabled: false },
    '/api/user/questionnaire-results': [],
    '/api/user/goals': [],
    '/api/user/assignments': [],
    '/api/session/frozen': [],
    '/api/counselors': [],
    '/api/orientation-directory': {
        institution: { id: 1, slug: 'demo', name: 'Istituto dimostrativo', kind: 'school' },
        events: [{ id: 'demo-event', kind: 'workshop', title: 'Laboratorio sulle scelte di studio · Demo', summary: 'Un esempio di appuntamento per confrontare interessi e possibilità.', needs: ['metodo-di-studio'], starts_at: '2026-10-15T14:00:00Z', ends_at: '', registration_deadline: '', page_url: '', location: 'Aula laboratorio · Demo', is_online: false }],
        referrals: [{ id: 'demo-contact', role: 'Tutor di orientamento · Demo', person: '', needs: ['scelta-percorso'], what_for: 'Ragionare su interessi, percorsi e prossimi passi.', how_to_reach: 'Esempio dimostrativo: nessun contatto reale.', email: '', hours: 'Su appuntamento', location: 'Spazio orientamento · Demo', page_url: '' }],
    },
};
const headers = request => ({ ...request.headers, host: `127.0.0.1:${devPort}`, ...(request.headers.origin ? { origin: `http://127.0.0.1:${devPort}` } : {}) });
const server = http.createServer((request, response) => {
    const path = new URL(request.url, 'http://preview.local').pathname;
    const json = (status, data) => { response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); response.end(JSON.stringify(data)); };
    if (!['GET', 'HEAD'].includes(request.method)) return json(405, { detail: 'Read-only demonstration preview' });
    if (path.startsWith('/api/')) return json(Object.hasOwn(fixtures, path) ? 200 : 404, fixtures[path] ?? { detail: 'Not available in this demonstration preview' });
    if (path === '/_next/image') {
        const imagePath = new URL(request.url, 'http://preview.local').searchParams.get('url') || '';
        if (!/^\/(images|guide)\/[\w/.-]+$/.test(imagePath) || imagePath.includes('..')) return json(403, { detail: 'Only public preview images are allowed' });
    }
    // Only this pilot, its entry and public frontend assets are exposed.
    if (!['/', '/profilo', '/profilo/orientamento', '/guide', '/favicon.ico'].includes(path) && !path.startsWith('/_next/') && !path.startsWith('/images/') && !path.startsWith('/guide/')) {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        return response.end('<!doctype html><html lang="it"><meta name="viewport" content="width=device-width"><title>Anteprima Orientamento</title><body style="font:18px system-ui;max-width:40rem;margin:4rem auto;padding:1rem"><h1>Anteprima Orientamento</h1><p>Questo tunnel mostra l’ingresso e la pagina Orientamento con dati dimostrativi. Le altre destinazioni saranno riviste una alla volta.</p><a href="/profilo/orientamento">Torna a Orientamento</a> · <a href="/profilo">Area personale</a></body></html>');
    }
    const upstream = http.request({ hostname: '127.0.0.1', port: devPort, path: request.url, method: request.method, headers: headers(request) }, result => {
        response.writeHead(result.statusCode, result.headers); result.pipe(response);
    });
    upstream.on('error', () => { if (!response.headersSent) json(502, { detail: 'Development server unavailable' }); else response.destroy(); });
    request.pipe(upstream);
});
server.on('upgrade', (request, socket, head) => {
    if (new URL(request.url, 'http://preview.local').pathname !== '/_next/webpack-hmr') return socket.destroy();
    const upstream = http.request({ hostname: '127.0.0.1', port: devPort, path: request.url, headers: headers(request) });
    upstream.on('upgrade', (response, peer, peerHead) => {
        socket.write(`HTTP/1.1 101 Switching Protocols\r\n${Object.entries(response.headers).map(([key, value]) => `${key}: ${value}`).join('\r\n')}\r\n\r\n`);
        if (head.length) peer.write(head);
        if (peerHead.length) socket.write(peerHead);
        socket.pipe(peer).pipe(socket);
        socket.on('error', () => peer.destroy()); peer.on('error', () => socket.destroy());
        socket.on('close', () => peer.destroy()); peer.on('close', () => socket.destroy());
    });
    upstream.on('error', () => socket.destroy()); upstream.end();
});
server.listen(previewPort, '127.0.0.1', () => console.log(`Demonstration preview: http://127.0.0.1:${previewPort}/profilo/orientamento`));
