#!/usr/bin/env node
// Register only after the portable frontend and backend are ready. No DNS writes.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function parseOptions(args) {
    const options = {
        hostname: 'counselorbot.labform.net',
        frontend: 'counselorbot-portable-frontend',
        console: 'portable-console',
    };
    for (let index = 0; index < args.length; index += 2) {
        const key = args[index]?.replace(/^--/, '');
        if (!['hostname', 'frontend', 'console'].includes(key) || !args[index + 1]) {
            throw new Error('Usage: node scripts/register-portable-console.mjs [--hostname HOST] [--frontend CONTAINER] [--console CONTAINER]');
        }
        options[key] = args[index + 1];
    }
    if (options.hostname.length > 253 || !options.hostname.includes('.') ||
        !options.hostname.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
        throw new Error('Invalid public hostname');
    }
    for (const key of ['frontend', 'console']) {
        if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(options[key])) throw new Error(`Invalid ${key} container`);
    }
    return options;
}

// This function runs inside Console, inheriting its paths and private auth env.
async function register(options, template) {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const { pathToFileURL } = await import('node:url');
    const nginx = await import(pathToFileURL(path.resolve('src/services/nginx.js')));
    const auth = await import(pathToFileURL(path.resolve('src/services/ai4auth.js')));
    const testNginx = async () => {
        const result = await nginx.testConfig();
        if (!result.valid) throw new Error(`Nginx validation failed: ${result.output}`);
    };
    if (!['true', '1'].includes(process.env.CONSOLE_PORTABLE)) throw new Error('Console is not a portable installation');
    const domain = process.env.CLOUDFLARED_WILDCARD_BASE;
    if (!domain || !options.hostname.endsWith(`.${domain}`)) throw new Error('Hostname is outside the Console domain');
    const authHost = new URL(process.env.AI4AUTH_LOGIN_URL).hostname;
    const portalHost = new URL(process.env.AI4AUTH_FORBIDDEN_URL).hostname;
    const authUpstream = process.env.AI4AUTH_NGINX_HOST;
    if (!/^[a-zA-Z0-9.-]+:[0-9]+$/.test(authUpstream)) throw new Error('Invalid Console auth upstream');
    const config = template.replace(/\{\{(HOSTNAME|FRONTEND|AUTH_UPSTREAM|AUTH_HOST|PORTAL_HOST)\}\}/g, (_, key) => ({
        HOSTNAME: options.hostname, FRONTEND: options.frontend, AUTH_UPSTREAM: authUpstream,
        AUTH_HOST: authHost, PORTAL_HOST: portalHost,
    })[key]);
    // Readiness checks are read-only and happen before any config mutation.
    const home = await fetch(`http://${options.frontend}:3000/`, { signal: AbortSignal.timeout(15000) });
    if (!home.ok) throw new Error(`Frontend readiness failed: ${home.status}`);
    const identity = await fetch(`http://${options.frontend}:3000/api/auth/me`, { signal: AbortSignal.timeout(15000) });
    if (!identity.ok || (await identity.json()).authenticated !== false) throw new Error('Backend anonymous identity readiness failed');
    const available = process.env.NGINX_SITES_AVAILABLE;
    const enabled = process.env.NGINX_SITES_ENABLED;
    const matrixPath = process.env.MATRIX_PATH;
    if (!available || !enabled || !matrixPath) throw new Error('Console nginx/matrix paths are missing');
    const vhostPath = path.join(available, `${options.hostname}.conf`);
    const linkPath = path.join(enabled, `${options.hostname}.conf`);
    const readOptional = async filename => fs.readFile(filename, 'utf8').catch(error => {
        if (error.code === 'ENOENT') return null;
        throw error;
    });
    const oldConfig = await readOptional(vhostPath);
    if (oldConfig !== null && !oldConfig.startsWith('# Managed by CounselorBot scripts/register-portable-console.mjs.')) {
        throw new Error('Existing vhost is not managed by this script; refusing to overwrite it');
    }
    const oldLink = await fs.lstat(linkPath).catch(error => {
        if (error.code === 'ENOENT') return null;
        throw error;
    });
    if (oldLink && !oldLink.isSymbolicLink()) throw new Error('Enabled vhost is not a symlink; refusing to overwrite it');
    const oldTarget = oldLink ? await fs.readlink(linkPath) : null;
    const target = `../sites-available/${options.hostname}.conf`;
    if (oldTarget && oldTarget !== target) throw new Error('Enabled vhost points elsewhere; refusing to overwrite it');
    const oldMatrixText = await fs.readFile(matrixPath, 'utf8');
    const matrix = await auth.readMatrix();
    if (!Array.isArray(matrix.services) || !Array.isArray(matrix.groups)) throw new Error('Invalid Console access matrix');
    const existing = matrix.services.filter(service => service.hostname === options.hostname);
    if (existing.length > 1) throw new Error('Multiple access rules exist for the hostname; review them manually');
    if (existing.length) {
        // Retain Console-managed permissions and any other service metadata.
        existing[0].manualVhost = true;
    } else {
        matrix.services.push({ hostname: options.hostname, name: 'CounselorBot',
            groups: ['admins', 'studenti', 'viewer'].filter(group => matrix.groups.includes(group)), manualVhost: true });
    }
    const matrixChanged = JSON.stringify(JSON.parse(oldMatrixText)) !== JSON.stringify(matrix);
    const configChanged = oldConfig !== config || oldTarget !== target;
    if (!matrixChanged && !configChanged) {
        await testNginx();
        console.log(JSON.stringify({ ok: true, changed: false, hostname: options.hostname }));
        return;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-') + `-${process.pid}`;
    const backup = path.join('/portable-data/backups/counselorbot', stamp);
    await fs.mkdir(backup, { recursive: true, mode: 0o700 });
    await fs.writeFile(path.join(backup, 'access_matrix.json'), oldMatrixText, { mode: 0o600 });
    if (oldConfig !== null) await fs.writeFile(path.join(backup, `${options.hostname}.conf`), oldConfig, { mode: 0o600 });
    await fs.writeFile(path.join(backup, 'registration.json'), JSON.stringify({ hostname: options.hostname, oldTarget }), { mode: 0o600 });
    try {
        // Avoid silently losing changes made through Console during readiness.
        if ((await fs.readFile(matrixPath, 'utf8')) !== oldMatrixText) throw new Error('Console access matrix changed concurrently; rerun registration');
        if (configChanged) {
            await fs.writeFile(vhostPath, config, { mode: 0o600 });
            if (!oldTarget) await fs.symlink(target, linkPath);
        }
        await testNginx();
        if (matrixChanged) await auth.writeMatrix(matrix);
        await auth.syncMatrix(matrix);
        // This reload is graceful and does not restart other services.
        if (configChanged) await nginx.reload();
        console.log(JSON.stringify({ ok: true, changed: true, hostname: options.hostname, backup }));
    } catch (error) {
        if (oldConfig === null) await fs.rm(vhostPath, { force: true });
        else await fs.writeFile(vhostPath, oldConfig, { mode: 0o600 });
        if (!oldTarget) await fs.rm(linkPath, { force: true });
        // Restore our matrix only if it still contains exactly our write.
        const currentMatrixText = await fs.readFile(matrixPath, 'utf8');
        if (matrixChanged && JSON.stringify(JSON.parse(currentMatrixText)) === JSON.stringify(matrix)) {
            await fs.writeFile(matrixPath, oldMatrixText);
        }
        await testNginx();
        await nginx.reload();
        throw error;
    }
}

export function registrationSource(options, template) {
    return `await (${register.toString()})(${JSON.stringify(options)}, ${JSON.stringify(template)});`;
}

export function main(args = process.argv.slice(2)) {
    const options = parseOptions(args);
    const template = readFileSync(new URL('../infrastructure/portable/nginx-counselorbot.conf.template', import.meta.url), 'utf8');
    const result = spawnSync('docker', ['exec', '-i', '-w', '/app', options.console, 'node', '--input-type=module'], {
        input: registrationSource(options, template), encoding: 'utf8', stdio: ['pipe', 'inherit', 'inherit'],
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error('Portable Console registration failed');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
