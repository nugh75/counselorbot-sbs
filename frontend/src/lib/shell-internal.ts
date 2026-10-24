// /api/internal/* would reach the backend's shell-only routes through the
// /api rewrite (ADR-0002 §2.6). Decoded, case-insensitive and tolerant of
// repeated slashes, so no spelling of the path slips through.
export function isShellInternalPath(pathname: string): boolean {
    let decoded = pathname;
    try {
        decoded = decodeURIComponent(pathname);
    } catch {
        // Malformed escapes: check the raw path.
    }
    const normalized = decoded.toLowerCase().replace(/\/{2,}/g, '/');
    return normalized === '/api/internal' || normalized.startsWith('/api/internal/');
}
