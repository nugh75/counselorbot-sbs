interface AuthUrlOptions {
    appUrl?: string;
    authBase?: string;
    portalUrl?: string;
    managerUrl?: string;
    projectId?: string;
}

export function createAuthUrls(options: AuthUrlOptions = {}) {
    const appOrigin = new URL(options.appUrl || 'https://counselorbot-sbs.ai4educ.org').origin;
    const authBase = (options.authBase || 'https://auth.ai4educ.org').replace(/\/+$/, '');
    const managerUrl = (options.managerUrl || 'https://manager.ai4educ.org').replace(/\/+$/, '');
    const loginUrl = `${authBase}/login`;

    return {
        portalUrl: options.portalUrl || 'https://portal.ai4educ.org/',
        managerUrl,
        loginUrl,
        logoutUrl: `${authBase}/logout`,
        secretsUrl: `${managerUrl}/segreti?project=${encodeURIComponent(options.projectId || 'counselorbot-10-step')}`,
        login(returnPath = '/admin', browserOrigin?: string): string {
            let origin = appOrigin;
            if (browserOrigin) {
                try {
                    const browser = new URL(browserOrigin);
                    const local = ['localhost', '127.0.0.1', '[::1]'].includes(browser.hostname);
                    if (['http:', 'https:'].includes(browser.protocol)
                        && (browser.origin === appOrigin || local)) origin = browser.origin;
                } catch { /* A malformed browser origin uses the configured app. */ }
            }

            // Accept only paths on this app, including query strings/fragments.
            // Backslashes and control characters can change URL parsing rules.
            const path = returnPath.startsWith('/') && !returnPath.startsWith('//')
                && !/[\\\u0000-\u0020\u007f]/.test(returnPath) ? returnPath : '/admin';
            return `${loginUrl}?rd=${encodeURIComponent(`${origin}${path}`)}`;
        },
    };
}
