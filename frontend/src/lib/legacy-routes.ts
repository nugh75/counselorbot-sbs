// Old addresses of renamed pages, kept alive with a permanent redirect for saved
// links, bookmarks and emails already sent. Query string and #anchor are kept.
export const legacyRouteRedirects = [
    // «Percorsi di classe» became «Piano operativo» (2026-10).
    { source: '/docente/percorsi/:path*', destination: '/docente/piani-operativi/:path*', permanent: true },
    { source: '/profilo/percorsi/:path*', destination: '/profilo/piani-operativi/:path*', permanent: true },
];
