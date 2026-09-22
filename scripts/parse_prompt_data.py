#!/usr/bin/env python3
"""
Parser deterministico e veloce per i file di documentazione QSA.
Nessun regex complesso: parsing basato su suddivisione in sezioni e linee.
"""

import os
import sys
import json

DB_TXT_PATH = "/home/nugh75/counselorbot-sbs/docs/qsa_prompt_strategie_letture_db.txt"
ALL_TXT_PATH = "/home/nugh75/counselorbot-sbs/docs/qsa_prompt_strategie_letture.txt"

def load_text_files():
    with open(DB_TXT_PATH, "r", encoding="utf-8") as f:
        db_content = f.read()
    with open(ALL_TXT_PATH, "r", encoding="utf-8") as f:
        all_content = f.read()
    return db_content, all_content

def parse_db_sections(db_text):
    data = {
        "steps": {},
        "components": {},
        "base_prompts": {},
        "meta_prompts": {},
        "other": {}
    }

    # Dividiamo per le linee di separazione trattini
    chunks = db_text.split("------------------------------------------------------------------------------")
    
    # Primo passaggio: catturiamo gli STEP
    for i in range(len(chunks) - 1):
        header = chunks[i].strip()
        body = chunks[i+1].strip()
        if header.startswith("STEP "):
            # Formato: STEP 0 — id: intro — 0. Presentazione (system_prompt_mode: intro)
            # body contiene il testo del prompt fino alla fine o al prossimo blocco
            lines = header.split("\n")
            first_line = lines[-1].strip() if lines else ""
            if "— id:" in first_line:
                parts = first_line.split("—")
                step_str = parts[0].replace("STEP", "").strip()
                try:
                    step_num = int(step_str)
                except ValueError:
                    continue
                step_id = ""
                step_title = ""
                step_mode = ""
                for p in parts[1:]:
                    p = p.strip()
                    if p.startswith("id:"):
                        step_id = p.replace("id:", "").strip()
                    elif "(system_prompt_mode:" in p:
                        t_parts = p.split("(system_prompt_mode:")
                        step_title = t_parts[0].strip()
                        step_mode = t_parts[1].replace(")", "").strip()
                
                # Il body è il testo del prompt dello step
                prompt_lines = []
                for bl in body.split("\n"):
                    if bl.startswith("STEP ") or bl.startswith("===") or bl.startswith("["):
                        break
                    prompt_lines.append(bl)
                data["steps"][step_num] = {
                    "num": step_num,
                    "id": step_id,
                    "title": step_title,
                    "mode": step_mode,
                    "prompt": "\n".join(prompt_lines).strip()
                }

    # Secondo passaggio: blocchi [chiave] (configs)
    for i in range(len(chunks) - 1):
        header = chunks[i].strip()
        body = chunks[i+1].strip()
        if "[" in header and "]" in header:
            # Estraiamo la chiave tra parentesi quadre
            k_start = header.rfind("[")
            k_end = header.rfind("]")
            if k_start != -1 and k_end > k_start:
                key = header[k_start+1:k_end].strip()
                # body contiene il valore del config
                val_lines = []
                for bl in body.split("\n"):
                    if bl.startswith("STEP ") or bl.startswith("===") or (bl.startswith("[") and "caratteri" in bl):
                        break
                    val_lines.append(bl)
                val_text = "\n".join(val_lines).strip()
                
                if key.startswith("prompt_components_"):
                    try:
                        data["components"][key] = json.loads(val_text)
                    except Exception:
                        data["components"][key] = val_text
                elif key.startswith("prompt_meta_"):
                    data["meta_prompts"][key] = val_text
                elif key.startswith("prompt_"):
                    data["base_prompts"][key] = val_text
                else:
                    data["other"][key] = val_text

    return data

def parse_strategies(all_text):
    # Sezione 2: STRATEGIE CERTIFICATE QSA/QSAr
    strat_marker = "2. STRATEGIE CERTIFICATE QSA/QSAr"
    cat_marker = "3. CATALOGO LETTURE, FILM E VIDEO"
    
    p1 = all_text.find(strat_marker)
    p2 = all_text.find(cat_marker)
    if p1 == -1:
        return []
    strat_text = all_text[p1:p2] if p2 != -1 else all_text[p1:]
    
    items = strat_text.split("\n\n- ")
    strategies = []
    for it in items[1:]:
        lines = it.strip().split("\n")
        title = lines[0].strip()
        fattori = ""
        quando = ""
        cosa = ""
        for line in lines[1:]:
            line = line.strip()
            if line.startswith("Fattori:"):
                fattori = line.replace("Fattori:", "").strip()
            elif line.startswith("Quando:"):
                quando = line.replace("Quando:", "").strip()
            elif line.startswith("Cosa:"):
                cosa = line.replace("Cosa:", "").strip()
        strategies.append({
            "title": title,
            "factors": fattori,
            "when": quando,
            "what": cosa
        })
    return strategies

def parse_cultural_catalog(all_text):
    catalog = {
        "saggi": [],
        "articoli": [],
        "narrativa": [],
        "film": [],
        "video": [],
        "documentari": []
    }
    
    cat_marker = "3. CATALOGO LETTURE, FILM E VIDEO"
    cat_start = all_text.find(cat_marker)
    if cat_start == -1:
        cat_start = 0

    sections = [
        ("saggi", "SAGGIO/LIBRO (", "ARTICOLO ("),
        ("articoli", "ARTICOLO (", "NARRATIVA ("),
        ("narrativa", "NARRATIVA (", "FILM ("),
        ("film", "FILM (", "VIDEO ("),
        ("video", "VIDEO (", "DOCUMENTARIO ("),
        ("documentari", "DOCUMENTARIO (", "4. FATTORI QSA")
    ]
    
    for cat_name, start_mark, end_mark in sections:
        p1 = all_text.find(start_mark, cat_start)
        if p1 == -1:
            continue
        p2 = all_text.find(end_mark, p1)
        sub_text = all_text[p1:p2] if p2 != -1 else all_text[p1:]
        
        items = sub_text.split("\n\n* ")
        for it in items[1:]:
            lines = it.strip().split("\n")
            header_line = lines[0].strip()
            editore = ""
            fattori = ""
            trama = ""
            for l in lines[1:]:
                l = l.strip()
                if l.startswith("Editore/produzione:"):
                    editore = l.replace("Editore/produzione:", "").strip()
                elif l.startswith("Fattori collegati:"):
                    fattori = l.replace("Fattori collegati:", "").strip()
                elif l.startswith("Trama/tema:"):
                    trama = l.replace("Trama/tema:", "").strip()
            catalog[cat_name].append({
                "header": header_line,
                "publisher": editore,
                "factors": fattori,
                "theme": trama
            })
            
    return catalog

if __name__ == "__main__":
    db_text, all_text = load_text_files()
    db_data = parse_db_sections(db_text)
    strats = parse_strategies(all_text)
    cat = parse_cultural_catalog(all_text)
    print(f"DEBUG: Steps={len(db_data['steps'])}, Components={len(db_data['components'])}, Meta={len(db_data['meta_prompts'])}, Base={len(db_data['base_prompts'])}")
    print(f"DEBUG: Strategie={len(strats)}, Saggi={len(cat['saggi'])}, Articoli={len(cat['articoli'])}, Film={len(cat['film'])}")
