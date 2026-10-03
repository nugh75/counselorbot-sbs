// All Next proxies must use the same backend in host development and Docker.
export function backendOrigin(env: Record<string, string | undefined> = process.env): string {
    return (env.BACKEND_ORIGIN || env.BACKEND_INTERNAL_URL || 'http://backend:8000').replace(/\/+$/, '');
}
