"""Programmi esterni del backend: dove cercarli e se ci sono.

Nel container Docker arrivano da apt e stanno nel PATH. Nelle app desktop
(docs/architecture/desktop-native-deps.md) il guscio li mette in una cartella
propria e la passa in `NATIVE_BIN_DIR`; su macOS un'app avviata dal Finder non
eredita il PATH della shell, percio' le cartelle di Homebrew si cercano a parte.

Oggi l'unico programma esterno e' Graphviz (`dot`): i PDF si rasterizzano con
PyMuPDF e Tesseract non e' usato dal codice.
"""
from __future__ import annotations

import os
import shutil
import sys

# Le app avviate dal Finder hanno PATH=/usr/bin:/bin:/usr/sbin:/sbin.
_PLATFORM_DIRS = {"darwin": ("/opt/homebrew/bin", "/usr/local/bin")}


def search_path() -> str:
    dirs = (
        os.getenv("NATIVE_BIN_DIR", ""),
        os.getenv("PATH", ""),
        *_PLATFORM_DIRS.get(sys.platform, ()),
    )
    return os.pathsep.join(d for d in dirs if d)


def find_program(name: str) -> str | None:
    """Percorso assoluto del programma, o None se non c'e'."""
    return shutil.which(name, path=search_path())


def native_capabilities() -> dict:
    """Funzioni che dipendono da un programma esterno: disponibili si'/no.

    E' cio' che `/capabilities` mostra all'interfaccia: senza Graphviz i
    diagrammi restano leggibili come testo, ma il disegno non c'e'."""
    return {
        "diagrams": {
            "available": find_program("dot") is not None,
            "program": "graphviz",
        },
    }
