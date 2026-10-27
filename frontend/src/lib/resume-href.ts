// Accept only internal plan destinations issued by the server.
export function resumeHref(entry: { session_id: string; resume_href?: string | null }): string {
    return entry.resume_href && /^\/profilo\/piani-operativi\/\d+\/\d+(?:\/approfondimento)?\?resume=1$/.test(entry.resume_href)
        ? entry.resume_href
        : `/?frozen=${encodeURIComponent(entry.session_id)}`;
}
