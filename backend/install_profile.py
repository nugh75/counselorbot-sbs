"""Profilo di installazione `COUNSELORBOT_PROFILE` (ADR-0001, F1-07).

`teacher-pc` (app docente) disattiva le funzioni di laboratorio escluse in
Fase 1: Prompt Lab, Telegram, OpenCode, Console sync, helper ChatGPT, Piper.
Le loro rotte rispondono 404 e i loro worker non partono; il codice resta
nella madre.
"""
import os

from fastapi import HTTPException, status

TEACHER_PC = "teacher-pc"
PROFILE = os.environ.get("COUNSELORBOT_PROFILE", "").strip().lower()


def teacher_pc() -> bool:
    return PROFILE == TEACHER_PC


def require_lab_features():
    """Dipendenza delle rotte di laboratorio: 404 sul profilo teacher-pc."""
    if teacher_pc():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not Found")
