// Old addresses of renamed pages, kept alive with redirects for saved
// links, bookmarks and emails already sent. Query string and #anchor are kept.
export const legacyRouteRedirects = [
    // Resolve the role at the root after authentication. Individual tool pages stay.
    { source: '/strumenti', destination: '/?view=home', permanent: false },
    // «Percorsi di classe» became «Piano operativo» (2026-10).
    { source: '/docente/percorsi/:path*', destination: '/docente/piani-operativi/:path*', permanent: true },
    { source: '/profilo/percorsi/:path*', destination: '/profilo/piani-operativi/:path*', permanent: true },
];
