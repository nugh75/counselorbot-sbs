#!/usr/bin/env python3
"""Script per la generazione e validazione delle 26 copertine YouTube-style (16:9, viewBox="0 0 320 180").

Conforme alle specifiche di docs/operations/piano-copertine-counselor.md:
- Formato: SVG 1.1 puro, viewBox="0 0 320 180", width="100%", height="100%", preserveAspectRatio="xMidYMid meet".
- ID univoci prefissati con lo slug del counselor.
- Nessun elemento raster, dimensione per file < 5 KB.
- Validazione sintattica XML con xml.etree.ElementTree.
"""
from pathlib import Path
import xml.etree.ElementTree as ET

DEST_DIR = Path("frontend/public/images/counselors")

COVERS = {}

# 1. MARCO - Esploratore classico, cartografo delle idee
COVERS["marco"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
  <defs>
    <radialGradient id="bg_marco" cx="70%" cy="35%" r="75%">
      <stop offset="0%" stop-color="#0f766e" />
      <stop offset="50%" stop-color="#042f2e" />
      <stop offset="100%" stop-color="#021c1b" />
    </radialGradient>
    <linearGradient id="scope_marco" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#78350f" />
      <stop offset="50%" stop-color="#d97706" />
      <stop offset="100%" stop-color="#fbbf24" />
    </linearGradient>
    <linearGradient id="beam_marco" x1="0%" y1="80%" x2="100%" y2="20%">
      <stop offset="0%" stop-color="#fb923c" stop-opacity="0.35" />
      <stop offset="100%" stop-color="#fef3c7" stop-opacity="0.0" />
    </linearGradient>
  </defs>
  <rect width="320" height="180" fill="url(#bg_marco)" />
  <!-- Mappa nautica: coordinate e meridiani -->
  <path d="M 0 140 C 60 120, 140 160, 220 130 C 260 115, 290 125, 320 135" fill="none" stroke="#2dd4bf" stroke-width="1.2" stroke-dasharray="3 4" opacity="0.35" />
  <path d="M 0 155 C 80 135, 170 175, 250 145 C 285 135, 305 140, 320 150" fill="none" stroke="#5eead4" stroke-width="1" stroke-dasharray="2 4" opacity="0.25" />
  <circle cx="160" cy="90" r="70" fill="none" stroke="#2dd4bf" stroke-width="0.8" stroke-dasharray="2 6" opacity="0.2" />
  <circle cx="160" cy="90" r="110" fill="none" stroke="#14b8a6" stroke-width="0.6" stroke-dasharray="1 8" opacity="0.2" />
  <!-- Isola all'orizzonte -->
  <path d="M 230 132 C 245 124, 260 122, 275 125 C 290 128, 300 133, 310 136 Z" fill="#115e59" opacity="0.7" />
  <!-- Fascio di osservazione verso l'astro guida -->
  <polygon points="125,115 270,30 286,42 136,128" fill="url(#beam_marco)" />
  <!-- Astro guida polare dorato -->
  <g transform="translate(278, 36)">
    <circle cx="0" cy="0" r="12" fill="#fb923c" opacity="0.25" />
    <circle cx="0" cy="0" r="6" fill="#f59e0b" opacity="0.5" />
    <path d="M 0,-10 Q 0,0 10,0 Q 0,0 0,10 Q 0,0 -10,0 Q 0,0 0,-10 Z" fill="#fef3c7" />
    <circle cx="0" cy="0" r="2.5" fill="#ffffff" />
  </g>
  <!-- Treppiede e montatura in ottone -->
  <line x1="85" y1="175" x2="110" y2="128" stroke="#b45309" stroke-width="3" stroke-linecap="round" />
  <line x1="135" y1="175" x2="110" y2="128" stroke="#b45309" stroke-width="3" stroke-linecap="round" />
  <line x1="105" y1="175" x2="110" y2="128" stroke="#78350f" stroke-width="2.5" stroke-linecap="round" opacity="0.7" />
  <circle cx="110" cy="128" r="5" fill="#f59e0b" stroke="#78350f" stroke-width="1.5" />
  <!-- Cannocchiale telescopico a 30 gradi -->
  <g transform="rotate(-30 110 128)">
    <rect x="70" y="125" width="16" height="6" rx="2" fill="#451a03" />
    <rect x="84" y="124" width="22" height="8" rx="2" fill="url(#scope_marco)" />
    <rect x="104" y="123" width="28" height="10" rx="2" fill="#d97706" />
    <rect x="130" y="122" width="36" height="12" rx="2" fill="url(#scope_marco)" />
    <rect x="164" y="120" width="10" height="16" rx="2" fill="#fbbf24" />
    <ellipse cx="174" cy="128" rx="3" ry="8" fill="#ccfbf1" opacity="0.85" />
  </g>
</svg>"""

# 2. SARA - Maestra elementare, accoglienza rassicurante
COVERS["sara"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="bg_sara" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#083344" />
      <stop offset="55%" stop-color="#0f766e" />
      <stop offset="100%" stop-color="#042f2e" />
    </linearGradient>
    <linearGradient id="beam_sara" x1="0%" y1="50%" x2="100%" y2="50%">
      <stop offset="0%" stop-color="#fed7aa" stop-opacity="0.9" />
      <stop offset="40%" stop-color="#fed7aa" stop-opacity="0.35" />
      <stop offset="100%" stop-color="#fed7aa" stop-opacity="0.0" />
    </linearGradient>
    <linearGradient id="tower_sara" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#f8fafc" />
      <stop offset="60%" stop-color="#e2e8f0" />
      <stop offset="100%" stop-color="#94a3b8" />
    </linearGradient>
  </defs>
  <rect width="320" height="180" fill="url(#bg_sara)" />
  <!-- Stelle nel cielo notturno accogliente -->
  <circle cx="160" cy="35" r="1.5" fill="#fef3c7" opacity="0.7" />
  <circle cx="210" cy="25" r="1.2" fill="#fef3c7" opacity="0.6" />
  <circle cx="130" cy="60" r="1" fill="#fef3c7" opacity="0.5" />
  <!-- Stella polare a 8 punte -->
  <g transform="translate(265, 38)">
    <circle cx="0" cy="0" r="10" fill="#fbbf24" opacity="0.2" />
    <path d="M 0,-12 L 2,-3 L 11,0 L 2,3 L 0,12 L -2,3 L -11,0 L -2,-3 Z" fill="#fef3c7" />
    <circle cx="0" cy="0" r="2" fill="#ffffff" />
  </g>
  <!-- Fascio di luce calda proiettato verso il mare e il futuro -->
  <polygon points="76,64 320,25 320,115 76,74" fill="url(#beam_sara)" />
  <!-- Scogliera accogliente sulla sinistra -->
  <path d="M 0 120 Q 30 115 55 125 Q 75 135 90 148 L 90 180 L 0 180 Z" fill="#042f2e" />
  <path d="M 0 135 Q 40 130 70 142 L 70 180 L 0 180 Z" fill="#115e59" opacity="0.6" />
  <!-- Faro costiero slanciato -->
  <g transform="translate(56, 52)">
    <!-- Basamento -->
    <rect x="10" y="65" width="20" height="14" rx="2" fill="#334155" />
    <!-- Torre rastremata -->
    <path d="M 12 65 L 15 22 L 25 22 L 28 65 Z" fill="url(#tower_sara)" />
    <!-- Fasce decorative ocra calde -->
    <path d="M 13.5 52 L 14.5 40 L 25.5 40 L 26.5 52 Z" fill="#f59e0b" />
    <path d="M 14.8 32 L 15.2 24 L 24.8 24 L 25.2 32 Z" fill="#f59e0b" />
    <!-- Galleria lanterna -->
    <rect x="13" y="19" width="14" height="4" rx="1" fill="#0f172a" />
    <rect x="15" y="10" width="10" height="10" rx="1" fill="#fef08a" stroke="#d97706" stroke-width="1" />
    <!-- Cupola faro -->
    <path d="M 14 10 Q 20 4 26 10 Z" fill="#0f172a" />
    <circle cx="20" cy="4" r="1.5" fill="#f59e0b" />
  </g>
  <!-- Mare calmo con riflessi dorati -->
  <path d="M 50 152 C 90 148, 140 154, 200 150 C 250 146, 280 150, 320 148 L 320 180 L 50 180 Z" fill="#042f2e" opacity="0.85" />
  <path d="M 90 158 C 140 155, 190 161, 240 157 C 275 154, 300 157, 320 156" fill="none" stroke="#2dd4bf" stroke-width="1.5" opacity="0.4" />
  <path d="M 120 166 C 160 163, 220 168, 270 164 C 295 162, 310 165, 320 164" fill="none" stroke="#fef3c7" stroke-width="1" opacity="0.4" />
</svg>"""

# 3. LUCA - Meccanico d'officina, concretezza e riparazioni
COVERS["luca"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="bg_luca" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e293b" />
      <stop offset="60%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#020617" />
    </linearGradient>
    <radialGradient id="lamp_glow_luca" cx="30%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#fef08a" stop-opacity="0.8" />
      <stop offset="40%" stop-color="#f59e0b" stop-opacity="0.25" />
      <stop offset="100%" stop-color="#f59e0b" stop-opacity="0.0" />
    </radialGradient>
    <linearGradient id="metal_luca" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#cbd5e1" />
      <stop offset="50%" stop-color="#94a3b8" />
      <stop offset="100%" stop-color="#475569" />
    </linearGradient>
  </defs>
  <rect width="320" height="180" fill="url(#bg_luca)" />
  <!-- Pegboard officina a fori regolari -->
  <g fill="#334155" opacity="0.4">
    <circle cx="30" cy="30" r="1.5" /><circle cx="50" cy="30" r="1.5" /><circle cx="70" cy="30" r="1.5" /><circle cx="90" cy="30" r="1.5" /><circle cx="110" cy="30" r="1.5" /><circle cx="130" cy="30" r="1.5" />
    <circle cx="30" cy="50" r="1.5" /><circle cx="50" cy="50" r="1.5" /><circle cx="70" cy="50" r="1.5" /><circle cx="90" cy="50" r="1.5" /><circle cx="110" cy="50" r="1.5" /><circle cx="130" cy="50" r="1.5" />
    <circle cx="30" cy="70" r="1.5" /><circle cx="50" cy="70" r="1.5" /><circle cx="70" cy="70" r="1.5" /><circle cx="90" cy="70" r="1.5" /><circle cx="110" cy="70" r="1.5" /><circle cx="130" cy="70" r="1.5" />
  </g>
  <!-- Piano di lavoro in legno massello e acciaio -->
  <rect x="0" y="142" width="320" height="38" fill="#1e293b" stroke="#334155" stroke-width="1.5" />
  <line x1="0" y1="145" x2="320" y2="145" stroke="#f59e0b" stroke-width="2" opacity="0.7" />
  <!-- Cono di luce calda della lampada tecnica -->
  <polygon points="65,48 20,145 170,145" fill="url(#lamp_glow_luca)" />
  <!-- Lampada tecnica a braccio snodato -->
  <g>
    <!-- Morsetto al banco -->
    <rect x="18" y="128" width="8" height="16" rx="1" fill="#475569" />
    <!-- Braccio inferiore -->
    <line x1="22" y1="130" x2="38" y2="82" stroke="#94a3b8" stroke-width="3" stroke-linecap="round" />
    <circle cx="38" cy="82" r="3.5" fill="#f59e0b" />
    <!-- Braccio superiore -->
    <line x1="38" y1="82" x2="62" y2="46" stroke="#94a3b8" stroke-width="3" stroke-linecap="round" />
    <!-- Paralume conico orientato verso il banco -->
    <path d="M 54 36 L 72 44 L 62 58 L 48 46 Z" fill="#0284c7" stroke="#38bdf8" stroke-width="1" />
    <circle cx="58" cy="50" r="4" fill="#fef08a" />
  </g>
  <!-- Ingranaggi di precisione collegati -->
  <!-- Grande ingranaggio centro-destra -->
  <g transform="translate(225, 88)">
    <circle cx="0" cy="0" r="36" fill="#334155" stroke="#64748b" stroke-width="2" />
    <!-- Denti -->
    <path d="M -5 -40 L 5 -40 L 4 -34 L -4 -34 Z M -5 40 L 5 40 L 4 34 L -4 34 Z M -40 -5 L -40 5 L -34 4 L -34 -4 Z M 40 -5 L 40 5 L 34 4 L 34 -4 Z M -28 -28 L -22 -32 L -19 -26 L -25 -22 Z M 28 28 L 22 32 L 19 26 L 25 22 Z M -28 28 L -32 22 L -26 19 L -22 25 Z M 28 -28 L 32 -22 L 26 -19 L 22 -25 Z" fill="#64748b" />
    <circle cx="0" cy="0" r="22" fill="#0f172a" />
    <circle cx="0" cy="0" r="10" fill="#334155" />
    <circle cx="0" cy="0" r="4" fill="#f59e0b" />
  </g>
  <!-- Ingranaggio piccolo accoppiato -->
  <g transform="translate(278, 52)">
    <circle cx="0" cy="0" r="18" fill="#475569" stroke="#94a3b8" stroke-width="1.5" />
    <circle cx="0" cy="0" r="9" fill="#0f172a" />
    <circle cx="0" cy="0" r="3" fill="#38bdf8" />
  </g>
  <!-- Calibro a corsoio sul banco -->
  <g transform="translate(110, 150)">
    <rect x="0" y="0" width="85" height="6" rx="1" fill="url(#metal_luca)" />
    <!-- Becco fisso -->
    <path d="M 0 0 L 0 -12 L 6 -6 L 6 0 Z" fill="url(#metal_luca)" />
    <!-- Corsoio mobile -->
    <rect x="35" y="-2" width="16" height="10" rx="1" fill="#e2e8f0" stroke="#475569" stroke-width="0.8" />
    <path d="M 35 0 L 35 -12 L 40 -6 L 40 0 Z" fill="#e2e8f0" />
    <!-- Graduazioni -->
    <line x1="12" y1="1" x2="12" y2="3" stroke="#0f172a" stroke-width="0.8" />
    <line x1="20" y1="1" x2="20" y2="4" stroke="#0f172a" stroke-width="0.8" />
    <line x1="28" y1="1" x2="28" y2="3" stroke="#0f172a" stroke-width="0.8" />
  </g>
  <!-- Chiave combinata inclinata -->
  <g transform="translate(210, 155) rotate(-15)">
    <rect x="0" y="-3" width="70" height="6" rx="2" fill="url(#metal_luca)" />
    <!-- Forchetta fissa -->
    <path d="M 0 -7 C -8 -7, -12 -1, -12 0 C -12 1, -8 7, 0 7 L -4 3 L -4 -3 Z" fill="url(#metal_luca)" />
    <!-- Occhiello poligonale -->
    <circle cx="70" cy="0" r="7" fill="url(#metal_luca)" />
    <circle cx="70" cy="0" r="3.5" fill="#1e293b" />
  </g>
</svg>"""

# 4. ELENA - Giornalista d'inchiesta, domande accurate
COVERS["elena"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="bg_elena" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="60%" stop-color="#1e1b4b" />
      <stop offset="100%" stop-color="#090d16" />
    </linearGradient>
    <radialGradient id="lamp_glow_elena" cx="40%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#6ee7b7" stop-opacity="0.6" />
      <stop offset="40%" stop-color="#10b981" stop-opacity="0.2" />
      <stop offset="100%" stop-color="#047857" stop-opacity="0.0" />
    </radialGradient>
    <linearGradient id="brass_elena" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fef3c7" />
      <stop offset="50%" stop-color="#d97706" />
      <stop offset="100%" stop-color="#78350f" />
    </linearGradient>
  </defs>
  <rect width="320" height="180" fill="url(#bg_elena)" />
  <!-- Scrivania di redazione con legni caldi -->
  <rect x="0" y="130" width="320" height="50" fill="#18181b" stroke="#27272a" stroke-width="1.5" />
  <!-- Alone luminoso della lampada ministeriale -->
  <polygon points="55,62 10,140 185,140" fill="url(#lamp_glow_elena)" />
  <!-- Lampada ministeriale verde smeraldo classica -->
  <g transform="translate(32, 50)">
    <!-- Base circolare in ottone -->
    <ellipse cx="25" cy="82" rx="14" ry="4" fill="url(#brass_elena)" />
    <!-- Stelo curvo in ottone -->
    <path d="M 25 80 L 25 35 Q 25 20 38 18" fill="none" stroke="url(#brass_elena)" stroke-width="3" stroke-linecap="round" />
    <!-- Paralume verde smeraldo curvo -->
    <path d="M 12 18 Q 38 4 64 18 L 62 26 Q 38 16 14 26 Z" fill="#047857" stroke="#10b981" stroke-width="1" />
    <path d="M 14 26 Q 38 16 62 26 L 60 28 Q 38 18 16 28 Z" fill="#6ee7b7" opacity="0.8" />
  </g>
  <!-- Taccuino di reportage aperto -->
  <g transform="translate(118, 95)">
    <!-- Pagina sinistra -->
    <polygon points="0,5 50,0 48,46 -2,50" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1" />
    <line x1="8" y1="12" x2="42" y2="8" stroke="#94a3b8" stroke-width="1.2" stroke-linecap="round" />
    <line x1="8" y1="20" x2="38" y2="16" stroke="#94a3b8" stroke-width="1.2" stroke-linecap="round" />
    <line x1="8" y1="28" x2="44" y2="24" stroke="#94a3b8" stroke-width="1.2" stroke-linecap="round" />
    <line x1="8" y1="36" x2="32" y2="33" stroke="#94a3b8" stroke-width="1.2" stroke-linecap="round" />
    <!-- Pagina destra -->
    <polygon points="50,0 100,5 98,50 48,46" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="1" />
    <line x1="56" y1="9" x2="90" y2="13" stroke="#047857" stroke-width="1.2" stroke-linecap="round" />
    <line x1="56" y1="17" x2="86" y2="21" stroke="#94a3b8" stroke-width="1.2" stroke-linecap="round" />
    <line x1="56" y1="25" x2="92" y2="29" stroke="#94a3b8" stroke-width="1.2" stroke-linecap="round" />
    <circle cx="56" cy="35" r="2" fill="#d97706" />
    <line x1="62" y1="35" x2="88" y2="37" stroke="#d97706" stroke-width="1.5" stroke-linecap="round" />
    <!-- Rilegatura centrale -->
    <line x1="50" y1="0" x2="48" y2="46" stroke="#64748b" stroke-width="1.5" />
  </g>
  <!-- Penna stilografica elegante in ottone e nero -->
  <g transform="translate(210, 138) rotate(-35)">
    <!-- Fusto -->
    <rect x="0" y="-3" width="55" height="6" rx="2" fill="#0f172a" stroke="#d97706" stroke-width="0.8" />
    <!-- Anellino dorato -->
    <rect x="15" y="-3.5" width="4" height="7" fill="url(#brass_elena)" />
    <!-- Pennino d'oro -->
    <path d="M 55 -2.5 L 67 0 L 55 2.5 Z" fill="url(#brass_elena)" />
    <line x1="55" y1="0" x2="63" y2="0" stroke="#78350f" stroke-width="0.8" />
  </g>
  <!-- Reticolo rotativa / grafici d'inchiesta sullo sfondo -->
  <g stroke="#38bdf8" stroke-width="0.8" opacity="0.25">
    <line x1="235" y1="35" x2="295" y2="35" />
    <line x1="235" y1="45" x2="305" y2="45" />
    <line x1="235" y1="55" x2="280" y2="55" />
    <circle cx="280" cy="55" r="3" fill="#38bdf8" />
    <line x1="280" y1="55" x2="305" y2="75" />
    <circle cx="305" cy="75" r="3" fill="#f59e0b" />
  </g>
</svg>"""

# 5. DAVIDE - Guida alpina di cordata, sfide a tappe
COVERS["davide"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="bg_davide" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="45%" stop-color="#1e293b" />
      <stop offset="75%" stop-color="#ea580c" />
      <stop offset="100%" stop-color="#fbbf24" />
    </linearGradient>
    <linearGradient id="peak_light_davide" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fef08a" />
      <stop offset="40%" stop-color="#f97316" />
      <stop offset="100%" stop-color="#c2410c" />
    </linearGradient>
  </defs>
  <rect width="320" height="180" fill="url(#bg_davide)" />
  <!-- Sole che sorge dietro la vetta -->
  <circle cx="255" cy="85" r="26" fill="#fef08a" opacity="0.75" />
  <circle cx="255" cy="85" r="42" fill="#fbbf24" opacity="0.25" />
  <!-- Catene montuose di sfondo (sagome distanti) -->
  <polygon points="0,140 50,110 110,135 180,95 240,125 320,80 320,180 0,180" fill="#1e293b" opacity="0.6" />
  <!-- Vetta aguzza baciata dal sole all'alba -->
  <polygon points="160,180 230,68 300,180" fill="#0f172a" />
  <!-- Versante illuminato della vetta -->
  <polygon points="230,68 230,180 300,180" fill="url(#peak_light_davide)" opacity="0.9" />
  <!-- Bandierina di traguardo sulla cima -->
  <line x1="230" y1="68" x2="230" y2="52" stroke="#ffffff" stroke-width="1.5" />
  <polygon points="230,52 242,57 230,62" fill="#ef4444" />
  <!-- Creste intermedie scure in primo piano -->
  <polygon points="0,180 0,130 65,115 130,150 170,180" fill="#0f172a" />
  <!-- Corda da arrampicata dinamica arancione con nodi -->
  <path d="M 20 165 C 60 130, 95 160, 140 125 C 175 100, 205 110, 230 75" fill="none" stroke="#f97316" stroke-width="2.5" stroke-dasharray="6 2" stroke-linecap="round" />
  <!-- Moschettone in alluminio sulla corda -->
  <g transform="translate(136, 122) rotate(25)">
    <rect x="-4" y="-8" width="8" height="16" rx="4" fill="none" stroke="#e2e8f0" stroke-width="2" />
    <line x1="4" y1="-3" x2="4" y2="3" stroke="#38bdf8" stroke-width="2.5" />
  </g>
  <!-- Piccozza tecnica d'alpinismo sul lato sinistro -->
  <g transform="translate(68, 120) rotate(-40)">
    <!-- Becca e paletta -->
    <path d="M -16 -4 C -6 -10, 6 -10, 16 -6 L 14 -1 L -12 0 Z" fill="#cbd5e1" stroke="#94a3b8" stroke-width="0.8" />
    <!-- Manico -->
    <rect x="-2" y="-2" width="4" height="42" rx="1.5" fill="#38bdf8" />
    <rect x="-2" y="24" width="4" height="14" rx="1" fill="#0f172a" />
    <!-- Puntale -->
    <polygon points="-2,40 2,40 0,46" fill="#cbd5e1" />
  </g>
</svg>"""

# 6. GIULIA - Architetta, fondamenta e progetti passo dopo passo
COVERS["giulia"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="bg_giulia" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#042f2e" />
      <stop offset="50%" stop-color="#0f766e" />
      <stop offset="100%" stop-color="#115e59" />
    </linearGradient>
    <linearGradient id="block_giulia" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#22d3ee" />
      <stop offset="100%" stop-color="#0891b2" />
    </linearGradient>
  </defs>
  <rect width="320" height="180" fill="url(#bg_giulia)" />
  <!-- Reticolo millimetrato blueprint tecnico -->
  <g stroke="#2dd4bf" stroke-width="0.5" opacity="0.25">
    <line x1="20" y1="0" x2="20" y2="180" /><line x1="50" y1="0" x2="50" y2="180" /><line x1="80" y1="0" x2="80" y2="180" /><line x1="110" y1="0" x2="110" y2="180" /><line x1="140" y1="0" x2="140" y2="180" /><line x1="170" y1="0" x2="170" y2="180" /><line x1="200" y1="0" x2="200" y2="180" /><line x1="230" y1="0" x2="230" y2="180" /><line x1="260" y1="0" x2="260" y2="180" /><line x1="290" y1="0" x2="290" y2="180" />
    <line x1="0" y1="30" x2="320" y2="30" /><line x1="0" y1="60" x2="320" y2="60" /><line x1="0" y1="90" x2="320" y2="90" /><line x1="0" y1="120" x2="320" y2="120" /><line x1="0" y1="150" x2="320" y2="150" />
  </g>
  <!-- Blocchi isometrici modulari in crescita (fondamenta passo dopo passo) -->
  <!-- Blocco 1 (base sinistra) -->
  <g transform="translate(60, 110)">
    <polygon points="0,0 24,-12 48,0 24,12" fill="#5eead4" opacity="0.8" />
    <polygon points="0,0 24,12 24,32 0,20" fill="#0d9488" />
    <polygon points="24,12 48,0 48,20 24,32" fill="#042f2e" />
  </g>
  <!-- Blocco 2 (centro-crescita) -->
  <g transform="translate(90, 85)">
    <polygon points="0,0 24,-12 48,0 24,12" fill="#22d3ee" />
    <polygon points="0,0 24,12 24,36 0,24" fill="#0891b2" />
    <polygon points="24,12 48,0 48,24 24,36" fill="#0e7490" />
  </g>
  <!-- Blocco 3 (elevazione superiore) -->
  <g transform="translate(120, 60)">
    <polygon points="0,0 24,-12 48,0 24,12" fill="#fef08a" />
    <polygon points="0,0 24,12 24,36 0,24" fill="#f59e0b" />
    <polygon points="24,12 48,0 48,24 24,36" fill="#d97706" />
  </g>
  <!-- Squadra da disegno a 45 gradi con graduazioni -->
  <g transform="translate(195, 45)">
    <polygon points="0,95 95,95 95,0" fill="#f8fafc" opacity="0.85" stroke="#0891b2" stroke-width="1.5" />
    <polygon points="22,78 78,78 78,22" fill="#0f766e" opacity="0.75" />
    <!-- Graduazioni sulla squadra -->
    <line x1="10" y1="95" x2="10" y2="90" stroke="#042f2e" stroke-width="1" />
    <line x1="20" y1="95" x2="20" y2="88" stroke="#042f2e" stroke-width="1.5" />
    <line x1="30" y1="95" x2="30" y2="90" stroke="#042f2e" stroke-width="1" />
    <line x1="40" y1="95" x2="40" y2="88" stroke="#042f2e" stroke-width="1.5" />
    <line x1="50" y1="95" x2="50" y2="90" stroke="#042f2e" stroke-width="1" />
    <line x1="60" y1="95" x2="60" y2="88" stroke="#042f2e" stroke-width="1.5" />
    <line x1="70" y1="95" x2="70" y2="90" stroke="#042f2e" stroke-width="1" />
    <line x1="80" y1="95" x2="80" y2="88" stroke="#042f2e" stroke-width="1.5" />
  </g>
  <!-- Compasso tecnico aperto -->
  <g transform="translate(180, 40)">
    <circle cx="20" cy="15" r="4" fill="#e2e8f0" stroke="#0e7490" stroke-width="1.5" />
    <line x1="20" y1="15" x2="2" y2="75" stroke="#e2e8f0" stroke-width="2.5" stroke-linecap="round" />
    <line x1="20" y1="15" x2="38" y2="75" stroke="#e2e8f0" stroke-width="2.5" stroke-linecap="round" />
    <!-- Punta e mina -->
    <polygon points="2,75 0,82 4,78" fill="#475569" />
    <circle cx="38" cy="76" r="2" fill="#0284c7" />
    <!-- Arco tracciato dal compasso -->
    <path d="M 0 82 A 40 40 0 0 1 45 82" fill="none" stroke="#22d3ee" stroke-width="1.2" stroke-dasharray="2 3" />
  </g>
</svg>"""

# 7. NADIA - Mediatrice di progetti, ascolto e armonia
COVERS["nadia"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="bg_nadia" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#042f2e" />
      <stop offset="50%" stop-color="#0d9488" />
      <stop offset="100%" stop-color="#115e59" />
    </linearGradient>
    <linearGradient id="bridge_nadia" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#a855f7" />
      <stop offset="50%" stop-color="#fef08a" />
      <stop offset="100%" stop-color="#14b8a6" />
    </linearGradient>
    <radialGradient id="sun_nadia" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fef3c7" />
      <stop offset="50%" stop-color="#fb923c" />
      <stop offset="100%" stop-color="#ea580c" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="320" height="180" fill="url(#bg_nadia)" />
  <!-- Sole armonico di convergenza -->
  <circle cx="160" cy="65" r="40" fill="url(#sun_nadia)" opacity="0.6" />
  <!-- Cerchi concentrici di convergenza ed equilibrio -->
  <circle cx="160" cy="65" r="55" fill="none" stroke="#fed7aa" stroke-width="1" stroke-dasharray="3 5" opacity="0.5" />
  <circle cx="160" cy="65" r="75" fill="none" stroke="#a7f3d0" stroke-width="0.8" stroke-dasharray="2 6" opacity="0.4" />
  <!-- Due colline diverse (sposte da collegare) -->
  <path d="M -20 180 Q 40 100 110 135 L 110 180 Z" fill="#042f2e" />
  <path d="M 210 135 Q 270 95 340 180 L 210 180 Z" fill="#042f2e" />
  <!-- Fiume calmo riflettente sotto il ponte -->
  <rect x="0" y="155" width="320" height="25" fill="#022c22" />
  <path d="M 40 165 C 100 162, 220 168, 280 164" fill="none" stroke="#5eead4" stroke-width="1.2" opacity="0.4" />
  <!-- Ponte ad arco sospeso di mediazione -->
  <path d="M 80 140 Q 160 85 240 140" fill="none" stroke="url(#bridge_nadia)" stroke-width="4" stroke-linecap="round" />
  <!-- Tiranti armonici simmetrici -->
  <line x1="110" y1="130" x2="110" y2="155" stroke="#fef3c7" stroke-width="1" opacity="0.7" />
  <line x1="135" y1="115" x2="135" y2="155" stroke="#fef3c7" stroke-width="1" opacity="0.7" />
  <line x1="160" y1="108" x2="160" y2="155" stroke="#fef3c7" stroke-width="1.2" opacity="0.9" />
  <line x1="185" y1="115" x2="185" y2="155" stroke="#fef3c7" stroke-width="1" opacity="0.7" />
  <line x1="210" y1="130" x2="210" y2="155" stroke="#fef3c7" stroke-width="1" opacity="0.7" />
  <!-- Simbolo di bilancia/equilibrio armonico al vertice -->
  <g transform="translate(160, 48)">
    <circle cx="0" cy="0" r="4.5" fill="#fef3c7" />
    <line x1="-16" y1="6" x2="16" y2="6" stroke="#fef3c7" stroke-width="1.5" />
    <path d="M -16 6 L -20 14 L -12 14 Z" fill="#a855f7" />
    <path d="M 16 6 L 12 14 L 20 14 Z" fill="#14b8a6" />
  </g>
</svg>"""

# 8. NORA - Sintesi essenziale, pensiero cartesiano
COVERS["nora"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="bg_nora" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="60%" stop-color="#1e1b4b" />
      <stop offset="100%" stop-color="#0284c7" />
    </linearGradient>
    <linearGradient id="prism_nora" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.9" />
      <stop offset="50%" stop-color="#38bdf8" stop-opacity="0.4" />
      <stop offset="100%" stop-color="#e0f2fe" stop-opacity="0.9" />
    </linearGradient>
  </defs>
  <rect width="320" height="180" fill="url(#bg_nora)" />
  <!-- Linea d'orizzonte pura ed essenziale -->
  <line x1="0" y1="125" x2="320" y2="125" stroke="#06b6d4" stroke-width="1.2" opacity="0.6" />
  <!-- Assi cartesiani essenziali sul lato sinistro -->
  <g stroke="#94a3b8" stroke-width="1" opacity="0.5">
    <line x1="45" y1="35" x2="45" y2="155" />
    <line x1="25" y1="135" x2="145" y2="135" />
    <line x1="42" y1="105" x2="48" y2="105" />
    <line x1="42" y1="75" x2="48" y2="75" />
    <line x1="75" y1="132" x2="75" y2="138" />
    <line x1="105" y1="132" x2="105" y2="138" />
  </g>
  <!-- Prisma geometrico minimale trasparente al centro -->
  <g transform="translate(140, 65)">
    <polygon points="25,-25 65,45 -15,45" fill="url(#prism_nora)" stroke="#e2e8f0" stroke-width="1.5" />
    <line x1="25" y1="-25" x2="25" y2="45" stroke="#ffffff" stroke-width="1" stroke-dasharray="3 3" opacity="0.7" />
    <circle cx="25" cy="-25" r="3" fill="#fef08a" />
  </g>
  <!-- Bussola cartesiana essenziale a destra -->
  <g transform="translate(245, 90)">
    <circle cx="0" cy="0" r="32" fill="#0f172a" stroke="#06b6d4" stroke-width="1.5" />
    <circle cx="0" cy="0" r="28" fill="none" stroke="#38bdf8" stroke-width="0.8" stroke-dasharray="2 4" />
    <!-- Ago sottile nord/sud -->
    <polygon points="0,0 -4,-3 0,-24 4,-3" fill="#06b6d4" />
    <polygon points="0,0 -4,3 0,24 4,3" fill="#94a3b8" />
    <circle cx="0" cy="0" r="3" fill="#ffffff" />
  </g>
</svg>"""

# 9. GIULIO - Counselor per percorsi complessi, pazienza
COVERS["giulio"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="bg_giulio" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="50%" stop-color="#1e1b4b" />
      <stop offset="100%" stop-color="#0f766e" />
    </linearGradient>
    <linearGradient id="path_gold_giulio" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#d97706" />
      <stop offset="60%" stop-color="#fbbf24" />
      <stop offset="100%" stop-color="#fef08a" />
    </linearGradient>
  </defs>
  <rect width="320" height="180" fill="url(#bg_giulio)" />
  <!-- Dedalo / Labirinto visto dall'alto a sinistra -->
  <g stroke="#334155" stroke-width="2" fill="none" opacity="0.6">
    <path d="M 25 35 L 95 35 L 95 105 L 45 105 L 45 55 L 75 55 L 75 85 L 60 85" />
    <path d="M 15 20 L 110 20 L 110 120 L 30 120 L 30 145 L 125 145" />
  </g>
  <!-- Sentiero dorato che esce dal labirinto e si fa fluido e aperto -->
  <path d="M 60 85 C 80 85, 95 70, 115 95 C 135 120, 160 80, 195 100 C 230 120, 260 90, 295 90" fill="none" stroke="url(#path_gold_giulio)" stroke-width="3.5" stroke-linecap="round" />
  <!-- Radura aperta accogliente a destra -->
  <circle cx="285" cy="90" r="28" fill="#fef3c7" opacity="0.2" />
  <circle cx="285" cy="90" r="16" fill="#fbbf24" opacity="0.4" />
  <circle cx="285" cy="90" r="5" fill="#fef08a" />
  <!-- Clessidra dorata (pazienza e tempo dedicato) al centro -->
  <g transform="translate(165, 52)">
    <!-- Piatti superiore e inferiore -->
    <rect x="-14" y="0" width="28" height="3" rx="1.5" fill="#fbbf24" />
    <rect x="-14" y="38" width="28" height="3" rx="1.5" fill="#fbbf24" />
    <!-- Vetro a bulbi -->
    <path d="M -10 3 L 10 3 L 2 20 L 10 38 L -10 38 L -2 20 Z" fill="#0f172a" opacity="0.5" stroke="#fef3c7" stroke-width="1" />
    <!-- Sabbia che scorre con calma -->
    <polygon points="-8,5 8,5 2,17 -2,17" fill="#fbbf24" />
    <line x1="0" y1="20" x2="0" y2="34" stroke="#fef08a" stroke-width="1.2" stroke-dasharray="1 2" />
    <polygon points="-6,37 6,37 0,28" fill="#fbbf24" />
  </g>
</svg>"""

# 10. IRIDE - Quadro d'insieme per studenti
COVERS["iride"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="bg_iride" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e1b4b" />
      <stop offset="50%" stop-color="#312e81" />
      <stop offset="100%" stop-color="#0f172a" />
    </linearGradient>
    <linearGradient id="prism_face_iride" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#c7d2fe" stop-opacity="0.8" />
      <stop offset="100%" stop-color="#818cf8" stop-opacity="0.3" />
    </linearGradient>
  </defs>
  <rect width="320" height="180" fill="url(#bg_iride)" />
  <!-- Costellazione di nodi e idee sparse prima della sintesi -->
  <g fill="#a5b4fc" opacity="0.5">
    <circle cx="35" cy="45" r="2.5" /><circle cx="55" cy="115" r="2" /><circle cx="85" cy="65" r="3" />
    <line x1="35" y1="45" x2="85" y2="65" stroke="#6366f1" stroke-width="0.8" stroke-dasharray="2 3" />
    <line x1="55" y1="115" x2="85" y2="65" stroke="#6366f1" stroke-width="0.8" stroke-dasharray="2 3" />
  </g>
  <!-- Raggio di luce bianca pura verso il prisma -->
  <line x1="0" y1="90" x2="135" y2="90" stroke="#ffffff" stroke-width="3" stroke-linecap="round" />
  <!-- Grande prisma di cristallo triangolare -->
  <g transform="translate(145, 90)">
    <polygon points="0,-48 42,32 -42,32" fill="url(#prism_face_iride)" stroke="#e0e7ff" stroke-width="1.8" />
    <line x1="0" y1="-48" x2="0" y2="32" stroke="#ffffff" stroke-width="1" opacity="0.6" />
  </g>
  <!-- Ventaglio cromatico spettro coordinato verso destra -->
  <g opacity="0.85">
    <!-- Rosso/Arancio -->
    <polygon points="160,82 320,40 320,54 162,85" fill="#f43f5e" />
    <!-- Ambra/Giallo -->
    <polygon points="162,85 320,54 320,68 164,88" fill="#f59e0b" />
    <!-- Smeraldo/Verde -->
    <polygon points="164,88 320,68 320,82 166,91" fill="#10b981" />
    <!-- Ciano/Azzurro -->
    <polygon points="166,91 320,82 320,96 168,94" fill="#06b6d4" />
    <!-- Indaco/Viola -->
    <polygon points="168,94 320,96 320,110 170,97" fill="#8b5cf6" />
    <!-- Magenta -->
    <polygon points="170,97 320,110 320,124 172,100" fill="#ec4899" />
  </g>
  <!-- Nodi concettuali collegati e armonizzati a destra -->
  <circle cx="280" cy="50" r="4" fill="#fef08a" />
  <circle cx="295" cy="88" r="4" fill="#67e8f9" />
  <circle cx="275" cy="118" r="4" fill="#f472b6" />
</svg>"""

# 11. CLIO - Spiegazioni dettagliate passo dopo passo per studenti
COVERS["clio"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="bg_clio" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e3a8a" />
      <stop offset="60%" stop-color="#0f766e" />
      <stop offset="100%" stop-color="#042f2e" />
    </linearGradient>
    <linearGradient id="scroll_clio" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#fef3c7" />
      <stop offset="50%" stop-color="#fef9c3" />
      <stop offset="100%" stop-color="#fde68a" />
    </linearGradient>
  </defs>
  <rect width="320" height="180" fill="url(#bg_clio)" />
  <!-- Pergamena aperta orizzontalmente -->
  <g transform="translate(30, 42)">
    <rect x="0" y="0" width="220" height="96" rx="4" fill="url(#scroll_clio)" stroke="#d97706" stroke-width="1.5" />
    <!-- Rotoli ai margini -->
    <rect x="-6" y="-3" width="8" height="102" rx="3" fill="#b45309" />
    <rect x="218" y="-3" width="8" height="102" rx="3" fill="#b45309" />
    <!-- Filo d'Arianna dorato a tappe progressive (1 -> 2 -> 3) -->
    <!-- Tappa 1 -->
    <circle cx="35" cy="48" r="10" fill="#10b981" />
    <circle cx="35" cy="48" r="4" fill="#ffffff" />
    <!-- Freccia 1 -> 2 -->
    <line x1="50" y1="48" x2="85" y2="48" stroke="#d97706" stroke-width="2" stroke-linecap="round" />
    <polygon points="85,45 92,48 85,51" fill="#d97706" />
    <!-- Tappa 2 -->
    <circle cx="108" cy="48" r="10" fill="#0284c7" />
    <circle cx="108" cy="48" r="4" fill="#ffffff" />
    <!-- Freccia 2 -> 3 -->
    <line x1="123" y1="48" x2="158" y2="48" stroke="#d97706" stroke-width="2" stroke-linecap="round" />
    <polygon points="158,45 165,48 158,51" fill="#d97706" />
    <!-- Tappa 3 -->
    <circle cx="180" cy="48" r="10" fill="#f59e0b" />
    <circle cx="180" cy="48" r="4" fill="#ffffff" />
  </g>
  <!-- Lente d'ingrandimento sui dettagli a destra -->
  <g transform="translate(245, 95)">
    <!-- Manico obliquo -->
    <line x1="18" y1="18" x2="42" y2="42" stroke="#b45309" stroke-width="6" stroke-linecap="round" />
    <line x1="18" y1="18" x2="42" y2="42" stroke="#fcd34d" stroke-width="2" stroke-linecap="round" />
    <!-- Cornice e lente -->
    <circle cx="0" cy="0" r="26" fill="#ccfbf1" fill-opacity="0.4" stroke="#d97706" stroke-width="3" />
    <circle cx="0" cy="0" r="23" fill="#ffffff" fill-opacity="0.25" stroke="#fde68a" stroke-width="1" />
    <!-- Dettaglio ingrandito / scintilla di comprensione -->
    <polygon points="0,-12 3,-3 12,0 3,3 0,12 -3,3 -12,0 -3,-3" fill="#f59e0b" />
    <circle cx="0" cy="0" r="3" fill="#ffffff" />
  </g>
</svg>"""

# 12. BRUNO - Ponte ricerca-pratica per docenti
COVERS["bruno"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="bg_bruno" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e293b" />
      <stop offset="50%" stop-color="#334155" />
      <stop offset="100%" stop-color="#0f172a" />
    </linearGradient>
    <linearGradient id="bridge_bruno" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#b45309" />
      <stop offset="50%" stop-color="#d97706" />
      <stop offset="100%" stop-color="#991b1b" />
    </linearGradient>
  </defs>
  <rect width="320" height="180" fill="url(#bg_bruno)" />
  <!-- Skyline accademica classica a sinistra (colonnato università) -->
  <g fill="#475569" opacity="0.6">
    <rect x="15" y="55" width="45" height="50" rx="1" />
    <polygon points="10,55 37,35 65,55" />
    <rect x="22" y="65" width="4" height="35" fill="#1e293b" />
    <rect x="35" y="65" width="4" height="35" fill="#1e293b" />
    <rect x="48" y="65" width="4" height="35" fill="#1e293b" />
  </g>
  <!-- Laboratorio scientifico e sperimentale a destra -->
  <g fill="#475569" opacity="0.6">
    <rect x="260" y="50" width="45" height="55" rx="2" />
    <line x1="270" y1="65" x2="295" y2="65" stroke="#38bdf8" stroke-width="1.5" />
    <line x1="270" y1="75" x2="290" y2="75" stroke="#38bdf8" stroke-width="1.5" />
    <line x1="270" y1="85" x2="298" y2="85" stroke="#f59e0b" stroke-width="1.5" />
  </g>
  <!-- Ponte monumentale ad arcate che unisce ricerca e pratica -->
  <g transform="translate(0, 100)">
    <!-- Struttura superiore del ponte -->
    <rect x="45" y="0" width="230" height="8" rx="1" fill="#f8fafc" stroke="#94a3b8" stroke-width="1" />
    <!-- 3 Arcate classiche -->
    <path d="M 55 8 L 55 45 Q 85 18 115 45 L 115 8 Z" fill="url(#bridge_bruno)" />
    <path d="M 125 8 L 125 45 Q 155 18 185 45 L 185 8 Z" fill="url(#bridge_bruno)" />
    <path d="M 195 8 L 195 45 Q 225 18 255 45 L 255 8 Z" fill="url(#bridge_bruno)" />
  </g>
  <!-- Libro aperto in primo piano con grafici pedagogici applicati -->
  <g transform="translate(125, 132)">
    <polygon points="0,5 35,0 35,32 0,36" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1" />
    <polygon points="35,0 70,5 70,36 35,32" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="1" />
    <!-- Grafico su pagina sinistra -->
    <line x1="6" y1="24" x2="28" y2="10" stroke="#b45309" stroke-width="1.5" />
    <circle cx="16" cy="18" r="1.5" fill="#f59e0b" />
    <!-- Righe su pagina destra -->
    <line x1="42" y1="12" x2="62" y2="12" stroke="#64748b" stroke-width="1" />
    <line x1="42" y1="18" x2="60" y2="18" stroke="#64748b" stroke-width="1" />
    <line x1="42" y1="24" x2="56" y2="24" stroke="#64748b" stroke-width="1" />
  </g>
</svg>"""

# 13. MINERVA - Rigore scientifico ed evidenze per docenti
COVERS["minerva"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="bg_minerva" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="50%" stop-color="#1e1b4b" />
      <stop offset="100%" stop-color="#020617" />
    </linearGradient>
    <linearGradient id="gold_minerva" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fde68a" />
      <stop offset="50%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#b45309" />
    </linearGradient>
  </defs>
  <rect width="320" height="180" fill="url(#bg_minerva)" />
  <!-- Scaffali di biblioteca geometrici a sinistra -->
  <g stroke="#334155" stroke-width="1.2" opacity="0.4">
    <line x1="20" y1="20" x2="20" y2="160" />
    <line x1="20" y1="60" x2="130" y2="60" />
    <line x1="20" y1="110" x2="130" y2="110" />
    <line x1="20" y1="150" x2="130" y2="150" />
    <!-- Volumi ordinati -->
    <rect x="30" y="66" width="10" height="42" fill="#1e293b" />
    <rect x="42" y="70" width="8" height="38" fill="#4338ca" />
    <rect x="52" y="64" width="12" height="44" fill="#312e81" />
    <rect x="66" y="68" width="9" height="40" fill="#b45309" />
  </g>
  <!-- Curva di dati scientifici ed evidenze empirical con punti perlacei -->
  <path d="M 40 145 C 80 140, 110 85, 150 95 C 180 102, 210 50, 240 65" fill="none" stroke="#38bdf8" stroke-width="2" />
  <circle cx="85" cy="120" r="3" fill="#ffffff" stroke="#0284c7" stroke-width="1" />
  <circle cx="150" cy="95" r="3" fill="#ffffff" stroke="#0284c7" stroke-width="1" />
  <circle cx="210" cy="65" r="3" fill="#ffffff" stroke="#f59e0b" stroke-width="1" />
  <!-- Civetta stilizzata della sapienza a destra -->
  <g transform="translate(245, 75)">
    <!-- Corpo e ali -->
    <path d="M 0 55 C -25 50, -32 10, 0 -25 C 32 10, 25 50, 0 55 Z" fill="#1e293b" stroke="url(#gold_minerva)" stroke-width="1.5" />
    <!-- Occhi grandi e saggi con cerchi concentrici -->
    <circle cx="-12" cy="-6" r="11" fill="#0f172a" stroke="url(#gold_minerva)" stroke-width="1.5" />
    <circle cx="-12" cy="-6" r="5" fill="#fef08a" />
    <circle cx="-12" cy="-6" r="2" fill="#0f172a" />
    <circle cx="12" cy="-6" r="11" fill="#0f172a" stroke="url(#gold_minerva)" stroke-width="1.5" />
    <circle cx="12" cy="-6" r="5" fill="#fef08a" />
    <circle cx="12" cy="-6" r="2" fill="#0f172a" />
    <!-- Becco geometrico -->
    <polygon points="0,0 -4,7 4,7" fill="#f59e0b" />
    <!-- Piumaggio frontale chevron -->
    <path d="M -8 24 L 0 30 L 8 24" fill="none" stroke="#fef08a" stroke-width="1" opacity="0.6" />
    <path d="M -8 34 L 0 40 L 8 34" fill="none" stroke="#fef08a" stroke-width="1" opacity="0.6" />
  </g>
</svg>"""

# 14. BIANCA - Liutaia di Cremona, cura e accordatura
COVERS["bianca"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="bg_bianca" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#451a03" />
      <stop offset="50%" stop-color="#78350f" />
      <stop offset="100%" stop-color="#271103" />
    </linearGradient>
    <linearGradient id="wood_bianca" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fde68a" />
      <stop offset="50%" stop-color="#d97706" />
      <stop offset="100%" stop-color="#92400e" />
    </linearGradient>
  </defs>
  <rect width="320" height="180" fill="url(#bg_bianca)" />
  <!-- Venature del legno d'abete e acero di bottega -->
  <g stroke="#92400e" stroke-width="1" opacity="0.3">
    <path d="M 0 30 Q 160 25 320 30" fill="none" />
    <path d="M 0 70 Q 160 65 320 70" fill="none" />
    <path d="M 0 115 Q 160 120 320 115" fill="none" />
  </g>
  <!-- Onde armoniche di risonanza dorate in alto a destra -->
  <g stroke="#fde68a" stroke-width="1.2" fill="none" opacity="0.5">
    <path d="M 180 40 C 210 25, 250 55, 290 35 C 305 28, 315 32, 320 30" />
    <path d="M 195 55 C 225 40, 260 70, 300 50 C 310 45, 318 48, 320 46" />
  </g>
  <!-- Sagoma violino artigianale in lavorazione al centro -->
  <g transform="translate(145, 88) rotate(-15)">
    <!-- Cassa armonica superiore e inferiore -->
    <path d="M 0 -50 C 22 -50, 30 -30, 20 -15 C 14 -5, 26 10, 35 30 C 42 46, 26 65, 0 65 C -26 65, -42 46, -35 30 C -26 10, -14 -5, -20 -15 C -30 -30, -22 -50, 0 -50 Z" fill="url(#wood_bianca)" stroke="#451a03" stroke-width="2" />
    <!-- Buche a f simmetriche -->
    <path d="M -12 -5 C -15 8, -6 18, -12 24" fill="none" stroke="#451a03" stroke-width="2.5" stroke-linecap="round" />
    <circle cx="-12" cy="-5" r="1.5" fill="#451a03" />
    <path d="M 12 -5 C 15 8, 6 18, 12 24" fill="none" stroke="#451a03" stroke-width="2.5" stroke-linecap="round" />
    <circle cx="12" cy="-5" r="1.5" fill="#451a03" />
    <!-- Ponticello in acero -->
    <rect x="-8" y="8" width="16" height="4" rx="1" fill="#fef3c7" stroke="#92400e" stroke-width="0.8" />
  </g>
  <!-- Riccio intagliato (scroll) e manico sul lato sinistro -->
  <g transform="translate(60, 50)">
    <path d="M 25 45 L 25 10 C 25 -10, 0 -10, 0 0 C 0 8, 15 8, 15 0" fill="none" stroke="url(#wood_bianca)" stroke-width="4.5" stroke-linecap="round" />
    <!-- Piroli di accordatura in ebano -->
    <circle cx="18" cy="18" r="3" fill="#18181b" />
    <circle cx="32" cy="24" r="3" fill="#18181b" />
  </g>
  <!-- Pialla di liuteria artigianale in ottone in basso a sinistra -->
  <g transform="translate(65, 142)">
    <rect x="0" y="0" width="36" height="14" rx="3" fill="#b45309" stroke="#78350f" stroke-width="1.5" />
    <polygon points="12,0 18,-8 22,-8 18,0" fill="#fde68a" stroke="#78350f" stroke-width="1" />
  </g>
  <!-- Trucioli di legno curvati dorati sul piano di lavoro -->
  <path d="M 115 152 Q 125 138 135 154 Q 140 144 146 150" fill="none" stroke="#fde68a" stroke-width="2" stroke-linecap="round" />
  <path d="M 230 155 Q 242 140 254 156" fill="none" stroke="#fde68a" stroke-width="1.8" stroke-linecap="round" />
</svg>"""

# 15. ERIK - Falegname svedese in Dalarna, misura lagom
COVERS["erik"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="bg_erik" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#0284c7" />
      <stop offset="50%" stop-color="#064e3b" />
      <stop offset="100%" stop-color="#022c22" />
    </linearGradient>
    <linearGradient id="horse_erik" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ea580c" />
      <stop offset="50%" stop-color="#c2410c" />
      <stop offset="100%" stop-color="#9a3412" />
    </linearGradient>
  </defs>
  <rect width="320" height="180" fill="url(#bg_erik)" />
  <!-- Vista panoramica Dalarna: lago svedese e foreste di pini -->
  <path d="M 0 95 Q 160 85 320 95 L 320 135 L 0 135 Z" fill="#0369a1" opacity="0.6" />
  <!-- Silhouettes di abeti nordici sulle rive -->
  <g fill="#064e3b">
    <polygon points="30,95 38,70 46,95" />
    <polygon points="48,95 55,75 62,95" />
    <polygon points="120,95 128,72 136,95" />
    <polygon points="260,95 270,65 280,95" />
    <polygon points="282,95 290,72 298,95" />
  </g>
  <!-- Banco da lavoro in legno di betulla chiara in primo piano -->
  <rect x="0" y="135" width="320" height="45" fill="#fef3c7" stroke="#d97706" stroke-width="1.5" />
  <line x1="0" y1="138" x2="320" y2="138" stroke="#b45309" stroke-width="1.5" opacity="0.4" />
  <!-- Cavallino di Dalarna intagliato (Dalahäst) al centro-destra -->
  <g transform="translate(190, 72)">
    <!-- Sagoma corpo cavallo -->
    <path d="M 20 62 L 20 40 L 5 40 L 5 62 L -8 62 L -8 32 C -18 30, -22 18, -20 0 C -15 -18, -5 -25, 10 -22 C 16 -12, 14 0, 16 12 L 35 15 C 45 18, 50 30, 48 40 L 48 62 Z" fill="url(#horse_erik)" stroke="#7c2d12" stroke-width="1.5" />
    <!-- Decorazioni floreali Kurbits tradizionali (bianco, ciano, oro) -->
    <path d="M 10 0 C 18 2, 26 8, 30 18" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" />
    <circle cx="16" cy="18" r="3" fill="#38bdf8" />
    <circle cx="26" cy="18" r="3" fill="#fef08a" />
    <path d="M -2 -10 Q 6 -8 10 -2" fill="none" stroke="#ffffff" stroke-width="1.8" />
  </g>
  <!-- Scalpello da intaglio nordico sul banco -->
  <g transform="translate(75, 148)">
    <!-- Manico in legno tornito -->
    <rect x="0" y="-4" width="35" height="8" rx="3" fill="#b45309" stroke="#78350f" stroke-width="1" />
    <circle cx="35" cy="0" r="4.5" fill="#d97706" />
    <!-- Lama in acciaio bisellata -->
    <rect x="38" y="-3" width="28" height="6" fill="#e2e8f0" stroke="#64748b" stroke-width="0.8" />
    <polygon points="66,-3 74,0 66,3" fill="#f8fafc" />
  </g>
</svg>"""

# 16. CARMEN - Ceramista di Triana (Siviglia), kintsugi
COVERS["carmen"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="bg_carmen" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#7c2d12" />
      <stop offset="50%" stop-color="#1e3a8a" />
      <stop offset="100%" stop-color="#0f172a" />
    </linearGradient>
    <linearGradient id="clay_carmen" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f97316" />
      <stop offset="50%" stop-color="#c2410c" />
      <stop offset="100%" stop-color="#7c2d12" />
    </linearGradient>
  </defs>
  <rect width="320" height="180" fill="url(#bg_carmen)" />
  <!-- Pattern Azulejos geometrici sivigliani sui bordi -->
  <g stroke="#60a5fa" stroke-width="1" fill="none" opacity="0.35">
    <rect x="15" y="20" width="30" height="30" /><polygon points="30,20 45,35 30,50 15,35" />
    <rect x="275" y="20" width="30" height="30" /><polygon points="290,20 305,35 290,50 275,35" />
  </g>
  <!-- Nastri e onde fluide di ritmo flamenco/tornio -->
  <path d="M 0 145 C 90 120, 150 165, 230 135 C 280 115, 305 130, 320 125" fill="none" stroke="#f59e0b" stroke-width="1.8" opacity="0.45" />
  <!-- Vaso artigianale di terracotta al centro -->
  <g transform="translate(160, 92)">
    <!-- Sagoma del vaso -->
    <path d="M -16 -45 L 16 -45 C 14 -35, 38 -15, 32 15 C 26 40, 18 50, 14 52 L -14 52 C -18 50, -26 40, -32 15 C -38 -15, -14 -35, -16 -45 Z" fill="url(#clay_carmen)" stroke="#451a03" stroke-width="1.5" />
    <!-- Bocca del vaso -->
    <ellipse cx="0" cy="-45" rx="16" ry="4" fill="#fb923c" stroke="#451a03" stroke-width="1" />
    <!-- Venature Kintsugi in foglia d'oro lucente (riparazione con valore) -->
    <path d="M -16 -30 Q -2 -15 6 -5 Q 16 8 8 26 Q 4 38 12 50" fill="none" stroke="#fef08a" stroke-width="2.5" stroke-linecap="round" />
    <path d="M 6 -5 Q -10 8 -18 18" fill="none" stroke="#fef08a" stroke-width="2" stroke-linecap="round" />
    <circle cx="6" cy="-5" r="2.5" fill="#ffffff" />
    <circle cx="-18" cy="18" r="2" fill="#ffffff" />
  </g>
</svg>"""

# 17. OTTO - Orologiaio della Foresta Nera, ingranaggi e tempo
COVERS["otto"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="bg_otto" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#271c19" />
      <stop offset="50%" stop-color="#451a03" />
      <stop offset="100%" stop-color="#14532d" />
    </linearGradient>
    <linearGradient id="brass_otto" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fef08a" />
      <stop offset="50%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#b45309" />
    </linearGradient>
  </defs>
  <rect width="320" height="180" fill="url(#bg_otto)" />
  <!-- Silhouette di rami d'abete della Foresta Nera -->
  <g stroke="#166534" stroke-width="1.5" opacity="0.35">
    <path d="M 15 25 L 45 40 M 15 35 L 40 45 M 20 50 L 50 60" />
    <path d="M 305 25 L 275 40 M 305 35 L 280 45" />
  </g>
  <!-- Ingranaggi in ottone finemente incastrati a sinistra -->
  <g transform="translate(100, 85)">
    <circle cx="0" cy="0" r="32" fill="url(#brass_otto)" stroke="#78350f" stroke-width="1.5" />
    <circle cx="0" cy="0" r="20" fill="#271c19" />
    <circle cx="0" cy="0" r="8" fill="url(#brass_otto)" />
    <!-- Denti ingranaggio -->
    <rect x="-3" y="-36" width="6" height="8" rx="1" fill="#f59e0b" />
    <rect x="-3" y="28" width="6" height="8" rx="1" fill="#f59e0b" />
    <rect x="-36" y="-3" width="8" height="6" rx="1" fill="#f59e0b" />
    <rect x="28" y="-3" width="8" height="6" rx="1" fill="#f59e0b" />
  </g>
  <g transform="translate(145, 50)">
    <circle cx="0" cy="0" r="18" fill="url(#brass_otto)" stroke="#78350f" stroke-width="1.2" />
    <circle cx="0" cy="0" r="9" fill="#271c19" />
  </g>
  <!-- Quadrante orologio con pendolo armonico a destra -->
  <g transform="translate(225, 75)">
    <!-- Cassa in legno d'abete intagliata -->
    <rect x="-30" y="-45" width="60" height="90" rx="4" fill="#451a03" stroke="#78350f" stroke-width="2" />
    <!-- Quadrante circolare -->
    <circle cx="0" cy="-15" r="22" fill="#fef3c7" stroke="#78350f" stroke-width="1.5" />
    <!-- Lancette ore e minuti -->
    <line x1="0" y1="-15" x2="0" y2="-27" stroke="#1c1917" stroke-width="1.8" stroke-linecap="round" />
    <line x1="0" y1="-15" x2="9" y2="-15" stroke="#1c1917" stroke-width="1.5" stroke-linecap="round" />
    <circle cx="0" cy="-15" r="2" fill="#f59e0b" />
    <!-- Pendolo oscillante in ottone -->
    <line x1="0" y1="10" x2="6" y2="45" stroke="#f59e0b" stroke-width="2" />
    <circle cx="6" cy="48" r="9" fill="url(#brass_otto)" stroke="#78350f" stroke-width="1" />
  </g>
</svg>"""

# 18. TEO - Studente universitario peer, metodo pratico
COVERS["teo"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="bg_teo" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="60%" stop-color="#1e293b" />
      <stop offset="100%" stop-color="#334155" />
    </linearGradient>
  </defs>
  <rect width="320" height="180" fill="url(#bg_teo)" />
  <!-- Scrivania da studio moderna -->
  <rect x="0" y="130" width="320" height="50" fill="#1e293b" stroke="#475569" stroke-width="1" />
  <!-- Laptop moderno aperto a 3/4 a sinistra -->
  <g transform="translate(60, 65)">
    <!-- Schermo -->
    <rect x="0" y="0" width="95" height="65" rx="3" fill="#0f172a" stroke="#64748b" stroke-width="1.5" />
    <rect x="4" y="4" width="87" height="57" rx="2" fill="#0284c7" opacity="0.8" />
    <!-- Sticker sul retro/lato -->
    <circle cx="20" cy="20" r="6" fill="#f97316" />
    <rect x="65" y="15" width="12" height="12" rx="2" fill="#10b981" />
    <!-- Base tastiera in prospettiva -->
    <polygon points="-8,66 103,66 115,80 -20,80" fill="#334155" stroke="#64748b" stroke-width="1" />
  </g>
  <!-- Tazza di caffè fumante al centro -->
  <g transform="translate(195, 115)">
    <rect x="0" y="0" width="22" height="26" rx="3" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1" />
    <!-- Manico tazza -->
    <path d="M 22 5 C 28 5, 28 20, 22 20" fill="none" stroke="#f8fafc" stroke-width="2.5" />
    <!-- Vapore caldo a spire -->
    <path d="M 6 -4 Q 10 -12 6 -18" fill="none" stroke="#e2e8f0" stroke-width="1.5" stroke-linecap="round" opacity="0.6" />
    <path d="M 14 -4 Q 18 -12 14 -18" fill="none" stroke="#e2e8f0" stroke-width="1.5" stroke-linecap="round" opacity="0.6" />
  </g>
  <!-- Post-it colorati con checklist to-do a destra -->
  <g transform="translate(245, 60)">
    <!-- Post-it giallo -->
    <rect x="0" y="0" width="40" height="40" rx="1" fill="#fef08a" stroke="#fde047" stroke-width="1" />
    <line x1="6" y1="10" x2="32" y2="10" stroke="#ca8a04" stroke-width="1.5" stroke-linecap="round" />
    <line x1="6" y1="18" x2="26" y2="18" stroke="#ca8a04" stroke-width="1.5" stroke-linecap="round" />
    <line x1="6" y1="26" x2="30" y2="26" stroke="#ca8a04" stroke-width="1.5" stroke-linecap="round" />
    <!-- Post-it arancione sfalsato -->
    <rect x="18" y="32" width="38" height="38" rx="1" fill="#fed7aa" stroke="#fb923c" stroke-width="1" />
    <line x1="24" y1="42" x2="48" y2="42" stroke="#ea580c" stroke-width="1.5" stroke-linecap="round" />
    <line x1="24" y1="50" x2="42" y2="50" stroke="#ea580c" stroke-width="1.5" stroke-linecap="round" />
  </g>
  <!-- Evidenziatore fluorescente sul piano -->
  <g transform="translate(180, 150) rotate(-10)">
    <rect x="0" y="-4" width="42" height="8" rx="2" fill="#f97316" />
    <polygon points="42,-3 48,0 42,3" fill="#fbbf24" />
  </g>
</svg>"""

# 19. SONIA - Insegnante di mindfulness e respiro
COVERS["sonia"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="bg_sonia" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#134e4a" />
      <stop offset="50%" stop-color="#0f766e" />
      <stop offset="100%" stop-color="#312e81" />
    </linearGradient>
    <radialGradient id="bowl_sonia" cx="50%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#fef08a" />
      <stop offset="50%" stop-color="#d97706" />
      <stop offset="100%" stop-color="#78350f" />
    </radialGradient>
  </defs>
  <rect width="320" height="180" fill="url(#bg_sonia)" />
  <!-- Onde di respiro calmo a onda sinusoidale (ispirazione / espirazione) -->
  <path d="M 0 90 Q 80 55 160 90 T 320 90" fill="none" stroke="#5eead4" stroke-width="1.5" opacity="0.4" />
  <path d="M 0 105 Q 80 70 160 105 T 320 105" fill="none" stroke="#c084fc" stroke-width="1" opacity="0.35" />
  <!-- Cerchi concentrici nell'acqua che si distendono con serenità -->
  <ellipse cx="160" cy="135" rx="110" ry="24" fill="none" stroke="#2dd4bf" stroke-width="1" stroke-dasharray="3 5" opacity="0.4" />
  <ellipse cx="160" cy="135" rx="70" ry="16" fill="none" stroke="#5eead4" stroke-width="1.2" stroke-dasharray="2 4" opacity="0.5" />
  <ellipse cx="160" cy="135" rx="30" ry="8" fill="none" stroke="#fef3c7" stroke-width="1.5" opacity="0.6" />
  <!-- Fiore di loto stilizzato al centro -->
  <g transform="translate(160, 125)">
    <!-- Petali esterni -->
    <path d="M 0 -22 C -18 -15, -28 0, 0 10 C 28 0, 18 -15, 0 -22 Z" fill="#c084fc" opacity="0.8" />
    <path d="M -15 -18 C -30 -5, -22 6, 0 10 C -12 2, -18 -8, -15 -18 Z" fill="#a855f7" />
    <path d="M 15 -18 C 30 -5, 22 6, 0 10 C 12 2, 18 -8, 15 -18 Z" fill="#a855f7" />
    <!-- Petalo centrale splendente -->
    <path d="M 0 -28 C -8 -15, -6 0, 0 8 C 6 0, 8 -15, 0 -28 Z" fill="#fef3c7" />
    <circle cx="0" cy="-6" r="3" fill="#f59e0b" />
  </g>
  <!-- Campana tibetana dorata martellata sul lato sinistro -->
  <g transform="translate(65, 115)">
    <path d="M -22 0 C -22 22, 22 22, 22 0 Z" fill="url(#bowl_sonia)" stroke="#b45309" stroke-width="1" />
    <!-- Batacchio in legno -->
    <line x1="18" y1="-12" x2="28" y2="12" stroke="#78350f" stroke-width="3" stroke-linecap="round" />
  </g>
</svg>"""

# 20. ROCCO - Allenatore di canottaggio, ritmo di squadra
COVERS["rocco"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="bg_rocco" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="45%" stop-color="#1e3a8a" />
      <stop offset="80%" stop-color="#f43f5e" />
      <stop offset="100%" stop-color="#fed7aa" />
    </linearGradient>
    <linearGradient id="water_rocco" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#0369a1" />
      <stop offset="100%" stop-color="#0f172a" />
    </linearGradient>
  </defs>
  <rect width="320" height="180" fill="url(#bg_rocco)" />
  <!-- Fiume all'alba con riflesso dell'orizzonte -->
  <rect x="0" y="95" width="320" height="85" fill="url(#water_rocco)" opacity="0.9" />
  <!-- Scia dinamica simmetrica a V dell'imbarcazione -->
  <polygon points="175,130 0,110 0,150" fill="#38bdf8" opacity="0.25" />
  <line x1="175" y1="130" x2="20" y2="105" stroke="#ffffff" stroke-width="1.5" opacity="0.6" />
  <line x1="175" y1="130" x2="20" y2="155" stroke="#ffffff" stroke-width="1.5" opacity="0.6" />
  <!-- Barca da canottaggio a quattro sottile e slanciata -->
  <g transform="translate(105, 130)">
    <!-- Scafo affilato -->
    <path d="M -70 0 Q 0 -5 70 0 Q 0 5 -70 0 Z" fill="#f8fafc" stroke="#0284c7" stroke-width="1" />
    <!-- 4 remi all'unisono (coppie simmetriche) -->
    <!-- Coppia 1 -->
    <line x1="-35" y1="0" x2="-45" y2="-28" stroke="#f43f5e" stroke-width="2" stroke-linecap="round" />
    <polygon points="-45,-28 -52,-30 -48,-24" fill="#fb7185" />
    <line x1="-35" y1="0" x2="-25" y2="28" stroke="#f43f5e" stroke-width="2" stroke-linecap="round" />
    <polygon points="-25,28 -32,30 -28,24" fill="#fb7185" />
    <!-- Coppia 2 -->
    <line x1="5" y1="0" x2="-5" y2="-28" stroke="#f43f5e" stroke-width="2" stroke-linecap="round" />
    <polygon points="-5,-28 -12,-30 -8,-24" fill="#fb7185" />
    <line x1="5" y1="0" x2="15" y2="28" stroke="#f43f5e" stroke-width="2" stroke-linecap="round" />
    <polygon points="15,28 8,30 12,24" fill="#fb7185" />
  </g>
  <!-- Cronometro sportivo vintage sul pontile a destra -->
  <g transform="translate(265, 60)">
    <circle cx="0" cy="0" r="22" fill="#f8fafc" stroke="#334155" stroke-width="2.5" />
    <circle cx="0" cy="0" r="18" fill="#ffffff" stroke="#94a3b8" stroke-width="0.8" />
    <!-- Pulsante in cima -->
    <rect x="-3" y="-28" width="6" height="6" fill="#334155" />
    <circle cx="0" cy="-28" r="4" fill="none" stroke="#334155" stroke-width="1.5" />
    <!-- Lancetta secondi e split time -->
    <line x1="0" y1="0" x2="8" y2="-10" stroke="#ef4444" stroke-width="1.8" stroke-linecap="round" />
    <circle cx="0" cy="0" r="2.5" fill="#0f172a" />
  </g>
</svg>"""

# 21. AIDAN - Cantastorie irlandese, racconti concreti
COVERS["aidan"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="bg_aidan" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#064e3b" />
      <stop offset="50%" stop-color="#047857" />
      <stop offset="100%" stop-color="#0f172a" />
    </linearGradient>
  </defs>
  <rect width="320" height="180" fill="url(#bg_aidan)" />
  <!-- Scogliere atlantiche e oceano aperto -->
  <path d="M 0 115 Q 120 100 200 125 L 200 180 L 0 180 Z" fill="#064e3b" opacity="0.8" />
  <path d="M 0 135 C 80 128, 160 145, 240 135 L 240 180 L 0 180 Z" fill="#022c22" />
  <!-- Onde spumeggianti dell'Atlantico in basso a sinistra -->
  <path d="M 10 155 C 40 148, 70 158, 100 152" fill="none" stroke="#a7f3d0" stroke-width="1.5" opacity="0.6" />
  <!-- Nodo celtico triskele/trifoglio intrecciato in alto a sinistra -->
  <g transform="translate(60, 48)" stroke="#fef08a" stroke-width="2.5" fill="none" opacity="0.75">
    <circle cx="0" cy="-10" r="10" />
    <circle cx="-9" cy="6" r="10" />
    <circle cx="9" cy="6" r="10" />
  </g>
  <!-- Cottage costiero tradizionale irlandese a destra -->
  <g transform="translate(230, 92)">
    <!-- Muri in pietra imbiancata -->
    <polygon points="0,35 45,35 45,0 22,-16 0,0" fill="#f8fafc" stroke="#475569" stroke-width="1.5" />
    <!-- Tetto in paglia/ardesia -->
    <polygon points="-4,2 22,-18 49,2" fill="#78350f" />
    <!-- Camino con fumo caldo -->
    <rect x="30" y="-24" width="8" height="14" fill="#334155" />
    <path d="M 34 -24 Q 40 -34 34 -42" fill="none" stroke="#fed7aa" stroke-width="1.5" stroke-linecap="round" opacity="0.7" />
    <!-- Finestra accesa con luce dorata del focolare -->
    <rect x="15" y="10" width="14" height="14" rx="1" fill="#f59e0b" stroke="#78350f" stroke-width="1" />
    <line x1="22" y1="10" x2="22" y2="24" stroke="#78350f" stroke-width="1" />
    <line x1="15" y1="17" x2="29" y2="17" stroke="#78350f" stroke-width="1" />
  </g>
</svg>"""

# 22. CAMILLE - Bibliotecaria parigina, chiarezza cartesiana
COVERS["camille"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="bg_camille" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#064e3b" />
      <stop offset="50%" stop-color="#14532d" />
      <stop offset="100%" stop-color="#271c19" />
    </linearGradient>
    <radialGradient id="lamp_glow_camille" cx="40%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#a7f3d0" stop-opacity="0.7" />
      <stop offset="40%" stop-color="#10b981" stop-opacity="0.25" />
      <stop offset="100%" stop-color="#047857" stop-opacity="0.0" />
    </radialGradient>
  </defs>
  <rect width="320" height="180" fill="url(#bg_camille)" />
  <!-- Grande libreria parigina in rovere a scaffali regolari sullo sfondo -->
  <g stroke="#78350f" stroke-width="1.8" fill="none" opacity="0.65">
    <rect x="15" y="15" width="290" height="110" rx="2" />
    <line x1="15" y1="52" x2="305" y2="52" />
    <line x1="15" y1="88" x2="305" y2="88" />
    <line x1="110" y1="15" x2="110" y2="125" />
    <line x1="210" y1="15" x2="210" y2="125" />
  </g>
  <!-- Volumi eleganti rilegati negli scaffali -->
  <g fill="#b45309">
    <rect x="25" y="22" width="10" height="28" fill="#991b1b" /><rect x="37" y="24" width="8" height="26" fill="#1e3a8a" /><rect x="47" y="20" width="12" height="30" fill="#065f46" />
    <rect x="125" y="58" width="9" height="28" fill="#d97706" /><rect x="136" y="56" width="11" height="30" fill="#4338ca" />
  </g>
  <!-- Tavolino di lettura in mogano in primo piano -->
  <rect x="0" y="130" width="320" height="50" fill="#451a03" stroke="#78350f" stroke-width="1.5" />
  <!-- Alone verde opaline della lampada -->
  <polygon points="65,65 15,145 165,145" fill="url(#lamp_glow_camille)" />
  <!-- Lampada opalina verde accesa -->
  <g transform="translate(45, 55)">
    <ellipse cx="20" cy="76" rx="12" ry="3" fill="#fbbf24" />
    <line x1="20" y1="76" x2="20" y2="35" stroke="#d97706" stroke-width="3" stroke-linecap="round" />
    <!-- Paralume opalino curvo -->
    <path d="M 6 35 Q 20 20 34 35 Z" fill="#10b981" stroke="#6ee7b7" stroke-width="1" />
  </g>
  <!-- Pila di libri catalogati con ordine cartesiano al centro -->
  <g transform="translate(145, 115)">
    <rect x="0" y="18" width="55" height="10" rx="1" fill="#1e3a8a" stroke="#172554" stroke-width="0.8" />
    <rect x="4" y="9" width="48" height="9" rx="1" fill="#047857" stroke="#064e3b" stroke-width="0.8" />
    <rect x="8" y="0" width="42" height="9" rx="1" fill="#b45309" stroke="#78350f" stroke-width="0.8" />
  </g>
  <!-- Tazzina da caffè parigina con piattino a destra -->
  <g transform="translate(235, 134)">
    <ellipse cx="12" cy="10" rx="14" ry="3" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1" />
    <path d="M 4 2 C 4 10, 20 10, 20 2 Z" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1" />
  </g>
</svg>"""

# 23. LUZ - Madrilena dei mercati di quartiere, storie umane
COVERS["luz"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="bg_luz" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#78350f" />
      <stop offset="50%" stop-color="#c2410c" />
      <stop offset="100%" stop-color="#ea580c" />
    </linearGradient>
  </defs>
  <rect width="320" height="180" fill="url(#bg_luz)" />
  <!-- Muro caldo di patio madrileno con pergolato e rampicanti -->
  <g stroke="#3f6212" stroke-width="2" fill="none" opacity="0.45">
    <path d="M 0 25 Q 80 15 160 25 T 320 20" />
    <path d="M 30 22 C 35 32, 45 32, 40 22" fill="#65a30d" />
    <path d="M 90 22 C 95 32, 105 32, 100 22" fill="#65a30d" />
    <path d="M 170 24 C 175 34, 185 34, 180 24" fill="#65a30d" />
    <path d="M 250 20 C 255 30, 265 30, 260 20" fill="#65a30d" />
  </g>
  <!-- Luce dorata calda del pomeriggio madrileno -->
  <circle cx="270" cy="50" r="38" fill="#fef08a" opacity="0.3" />
  <!-- Pavimento in cotto del patio -->
  <rect x="0" y="132" width="320" height="48" fill="#9a3412" stroke="#7c2d12" stroke-width="1" />
  <!-- Vasi in terracotta con rigogliose piante d'olivo e gerani -->
  <g transform="translate(65, 95)">
    <!-- Vaso terracotta grande -->
    <polygon points="0,40 32,40 28,15 4,15" fill="#ea580c" stroke="#7c2d12" stroke-width="1.5" />
    <ellipse cx="16" cy="15" rx="13" ry="3" fill="#f97316" />
    <!-- Foglie d'olivo e verde brillante -->
    <circle cx="16" cy="2" r="14" fill="#65a30d" opacity="0.9" />
    <circle cx="8" cy="-5" r="9" fill="#84cc16" />
    <circle cx="24" cy="-5" r="9" fill="#4d7c0f" />
    <circle cx="16" cy="-4" r="3" fill="#ef4444" />
  </g>
  <!-- Tavolino in ferro battuto con taccuino aperto a destra -->
  <g transform="translate(195, 105)">
    <!-- Piano tavolino circolare -->
    <ellipse cx="30" cy="28" rx="38" ry="10" fill="#18181b" stroke="#71717a" stroke-width="1.5" />
    <!-- Taccuino aperto illuminato dal sole -->
    <polygon points="15,22 30,20 45,22 45,30 30,32 15,30" fill="#fef9c3" stroke="#ca8a04" stroke-width="1" />
    <line x1="30" y1="20" x2="30" y2="32" stroke="#a16207" stroke-width="1" />
  </g>
</svg>"""

# 24. VERA - Psicologa personalità e tempo ZTPI
COVERS["vera"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="bg_vera" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="50%" stop-color="#1e1b4b" />
      <stop offset="100%" stop-color="#581c87" />
    </linearGradient>
  </defs>
  <rect width="320" height="180" fill="url(#bg_vera)" />
  <!-- Meridiani e costellazioni della mappa temporale ZTPI -->
  <g stroke="#c084fc" stroke-width="0.8" fill="none" opacity="0.35">
    <circle cx="160" cy="90" r="75" stroke-dasharray="2 4" />
    <circle cx="160" cy="90" r="45" stroke-dasharray="3 3" />
    <line x1="40" y1="90" x2="280" y2="90" />
    <line x1="160" y1="15" x2="160" y2="165" />
  </g>
  <!-- Tre dimensioni temporali ZTPI sovrapposte e interconnesse -->
  <!-- 1. Passato (memoria ambra a sinistra) -->
  <g transform="translate(95, 90)">
    <circle cx="0" cy="0" r="26" fill="#f59e0b" fill-opacity="0.25" stroke="#fbbf24" stroke-width="1.5" />
    <circle cx="0" cy="0" r="14" fill="#d97706" opacity="0.6" />
    <circle cx="0" cy="0" r="4" fill="#fef08a" />
  </g>
  <!-- 2. Presente (vissuto dinamico al centro) -->
  <g transform="translate(160, 90)">
    <circle cx="0" cy="0" r="32" fill="#9333ea" fill-opacity="0.3" stroke="#d946ef" stroke-width="2" />
    <circle cx="0" cy="0" r="18" fill="#c084fc" opacity="0.7" />
    <circle cx="0" cy="0" r="6" fill="#ffffff" />
  </g>
  <!-- 3. Futuro (proiezione e orizzonte a destra) -->
  <g transform="translate(225, 90)">
    <circle cx="0" cy="0" r="26" fill="#06b6d4" fill-opacity="0.25" stroke="#38bdf8" stroke-width="1.5" />
    <circle cx="0" cy="0" r="14" fill="#0284c7" opacity="0.6" />
    <!-- Stella guida del futuro -->
    <polygon points="0,-8 2,-2 8,0 2,2 0,8 -2,2 -8,0 -2,-2" fill="#ffffff" />
  </g>
  <!-- Filamento connettivo armonico che collega Passato, Presente e Futuro -->
  <path d="M 95 90 C 120 70, 135 110, 160 90 C 185 70, 200 110, 225 90" fill="none" stroke="#fef08a" stroke-width="2" stroke-linecap="round" />
  <!-- Stelle di consapevolezza psicologica -->
  <circle cx="130" cy="45" r="2" fill="#fef08a" />
  <circle cx="190" cy="135" r="2" fill="#fef08a" />
  <circle cx="260" cy="40" r="2.5" fill="#fef08a" />
</svg>"""

# 25. OMAR - Cartografo di sintesi multidimensionale
COVERS["omar"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="bg_omar" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#042f2e" />
      <stop offset="50%" stop-color="#0f766e" />
      <stop offset="100%" stop-color="#1e3a8a" />
    </linearGradient>
  </defs>
  <rect width="320" height="180" fill="url(#bg_omar)" />
  <!-- Rilievo topografico a curve di livello graduate -->
  <g stroke="#2dd4bf" stroke-width="1" fill="none" opacity="0.35">
    <path d="M 0 150 C 60 120, 140 170, 220 135 C 270 115, 300 125, 320 120" />
    <path d="M 0 130 C 70 100, 150 150, 230 115 C 275 95, 305 105, 320 100" />
    <path d="M 0 110 C 80 80, 160 130, 240 95 C 280 80, 310 90, 320 85" stroke-dasharray="3 4" />
  </g>
  <!-- Tre cerchi di sintesi intersecati (Diagramma di Venn multilivello) -->
  <g transform="translate(145, 85)">
    <!-- Cerchio QSA (teal) -->
    <circle cx="-25" cy="-10" r="32" fill="#0d9488" fill-opacity="0.35" stroke="#2dd4bf" stroke-width="1.8" />
    <!-- Cerchio ZTPI (blu) -->
    <circle cx="25" cy="-10" r="32" fill="#2563eb" fill-opacity="0.35" stroke="#60a5fa" stroke-width="1.8" />
    <!-- Cerchio SAVICKAS/altri (arancio coordinate) -->
    <circle cx="0" cy="22" r="32" fill="#ea580c" fill-opacity="0.35" stroke="#fb923c" stroke-width="1.8" />
    <!-- Punto centrale di sintesi convergente -->
    <circle cx="0" cy="4" r="7" fill="#fef08a" opacity="0.9" />
    <circle cx="0" cy="4" r="3" fill="#ffffff" />
  </g>
  <!-- Bussola topografica sul lato destro -->
  <g transform="translate(255, 65)">
    <circle cx="0" cy="0" r="24" fill="#0f172a" stroke="#f97316" stroke-width="1.5" />
    <line x1="0" y1="-20" x2="0" y2="20" stroke="#fed7aa" stroke-width="1" />
    <line x1="-20" y1="0" x2="20" y2="0" stroke="#fed7aa" stroke-width="1" />
    <polygon points="0,0 -3,-4 0,-18 3,-4" fill="#f97316" />
    <polygon points="0,0 -3,4 0,18 3,4" fill="#94a3b8" />
    <circle cx="0" cy="0" r="2.5" fill="#ffffff" />
  </g>
</svg>"""

# 26. GEMINI - Orientamento digitale a doppia intelligenza
COVERS["gemini"] = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="bg_gemini" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="45%" stop-color="#1e1b4b" />
      <stop offset="100%" stop-color="#020617" />
    </linearGradient>
    <radialGradient id="star_cyan_gemini" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="40%" stop-color="#22d3ee" />
      <stop offset="100%" stop-color="#0891b2" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="star_purple_gemini" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="40%" stop-color="#c084fc" />
      <stop offset="100%" stop-color="#7c3aed" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="320" height="180" fill="url(#bg_gemini)" />
  <!-- Onde digitali dell'aurora boreale nello spazio stellato -->
  <path d="M 0 60 Q 80 20 160 55 T 320 30" fill="none" stroke="#8b5cf6" stroke-width="1.5" opacity="0.4" />
  <path d="M 0 120 Q 80 150 160 115 T 320 140" fill="none" stroke="#06b6d4" stroke-width="1.5" opacity="0.4" />
  <!-- Onde orbitali a doppio elicoide / infinito tra le due intelligenze -->
  <path d="M 90 90 C 110 50, 150 130, 160 90 C 170 50, 210 130, 230 90 C 210 50, 170 130, 160 90 C 150 50, 110 130, 90 90 Z" fill="none" stroke="#38bdf8" stroke-width="2" stroke-dasharray="3 4" opacity="0.75" />
  <!-- Stella binaria 1: Ciano elettrico (analisi e chiarezza) -->
  <g transform="translate(115, 90)">
    <circle cx="0" cy="0" r="32" fill="url(#star_cyan_gemini)" opacity="0.8" />
    <polygon points="0,-16 4,-4 16,0 4,4 0,16 -4,4 -16,0 -4,-4" fill="#ffffff" />
    <circle cx="0" cy="0" r="4" fill="#22d3ee" />
  </g>
  <!-- Stella binaria 2: Viola aurora (creatività e sintesi) -->
  <g transform="translate(205, 90)">
    <circle cx="0" cy="0" r="32" fill="url(#star_purple_gemini)" opacity="0.8" />
    <polygon points="0,-16 4,-4 16,0 4,4 0,16 -4,4 -16,0 -4,-4" fill="#ffffff" />
    <circle cx="0" cy="0" r="4" fill="#c084fc" />
  </g>
  <!-- Portale di convergenza e saggezza digitale al centro esatto -->
  <g transform="translate(160, 90)">
    <circle cx="0" cy="0" r="14" fill="none" stroke="#fef08a" stroke-width="1.8" stroke-dasharray="2 3" />
    <circle cx="0" cy="0" r="5" fill="#fef3c7" />
  </g>
</svg>"""


def main():
    DEST_DIR.mkdir(parents=True, exist_ok=True)
    assert len(COVERS) == 26, f"Previsti 26 counselor, trovati {len(COVERS)}"

    for slug, content in COVERS.items():
        file_path = DEST_DIR / f"{slug}.svg"
        
        # Validazione XML
        try:
            root = ET.fromstring(content)
        except ET.ParseError as e:
            raise ValueError(f"XML non valido per {slug}: {e}")

        # Controllo attributi radice
        assert root.tag.endswith("svg"), f"Root non è <svg> per {slug}"
        assert root.attrib.get("viewBox") == "0 0 320 180", f"viewBox errato per {slug}: {root.attrib.get('viewBox')}"
        assert root.attrib.get("width") == "100%", f"width non è 100% per {slug}"
        assert root.attrib.get("height") == "100%", f"height non è 100% per {slug}"
        assert root.attrib.get("preserveAspectRatio") == "xMidYMid meet", f"preserveAspectRatio errato per {slug}"

        # Scrittura file
        cleaned_content = content.strip() + "\n"
        file_path.write_text(cleaned_content, encoding="utf-8")
        
        # Verifica dimensione < 5 KB (5120 bytes)
        size_bytes = file_path.stat().st_size
        assert size_bytes < 5120, f"File {slug}.svg troppo grande: {size_bytes} bytes (max 5120)"
        print(f"✓ {slug}.svg: {size_bytes} bytes - OK")

    print(f"\nTutte le 26 copertine generate con successo in {DEST_DIR}!")


if __name__ == "__main__":
    main()
