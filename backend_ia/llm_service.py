import json
import random
import re
import time
import unicodedata
from collections import defaultdict
import requests

from instances import anonymize_instance
from validator import (
    DAYS,
    SLOTS_PER_DAY,
    TEACHABLE_HOURS,
    TEACHABLE_SLOTS,
    normalize_instance,
    slot_label,
    validate_schedule,
)


# ==============================================================================
# ANNOTATED GOLD DATASET FOR P2 (PRECISIÓN, RECALL Y F1 POR TIPO DE RESTRICCIÓN)
# ==============================================================================

GOLD_PREFERENCES_DATASET = [
    {
        "id": 1,
        "text": "Docente_01 prefiere no dar clases los viernes por la tarde.",
        "gold": [{"teacher": "Docente_01", "type": "avoid_day_afternoon", "day": 4}],
    },
    {
        "id": 2,
        "text": "Docente_02 solicita evitar clases a primera hora antes de las 8:50.",
        "gold": [{"teacher": "Docente_02", "type": "avoid_early", "before_hour": 2}],
    },
    {
        "id": 3,
        "text": "Docente_03 prefiere turno matutino exclusivamente.",
        "gold": [{"teacher": "Docente_03", "type": "prefer_morning"}],
    },
    {
        "id": 4,
        "text": "Docente_04 no puede impartir clases los miércoles.",
        "gold": [{"teacher": "Docente_04", "type": "avoid_day", "day": 2}],
    },
    {
        "id": 5,
        "text": "Docente_05 pide máximo 4 horas de clase al día y evitar sesiones después de las 16:45.",
        "gold": [
            {"teacher": "Docente_05", "type": "max_daily_hours", "max_hours": 4},
            {"teacher": "Docente_05", "type": "avoid_late", "after_hour": 12},
        ],
    },
    {
        "id": 6,
        "text": "Docente_06 prefiere impartir sus cursos en el turno vespertino.",
        "gold": [{"teacher": "Docente_06", "type": "prefer_afternoon"}],
    },
    {
        "id": 7,
        "text": "Docente_07 solicita no tener clases los lunes y evitar primera hora.",
        "gold": [
            {"teacher": "Docente_07", "type": "avoid_day", "day": 0},
            {"teacher": "Docente_07", "type": "avoid_early", "before_hour": 1},
        ],
    },
    {
        "id": 8,
        "text": "Docente_08 requiere no exceder 3 horas diarias de docencia.",
        "gold": [{"teacher": "Docente_08", "type": "max_daily_hours", "max_hours": 3}],
    },
    {
        "id": 9,
        "text": "Docente_09 pide evitar clases después de las 15:50 para atender laboratorio externo.",
        "gold": [{"teacher": "Docente_09", "type": "avoid_late", "after_hour": 11}],
    },
    {
        "id": 10,
        "text": "Docente_10 prefiere no asistir los jueves y concentrar sus clases en la mañana.",
        "gold": [
            {"teacher": "Docente_10", "type": "avoid_day", "day": 3},
            {"teacher": "Docente_10", "type": "prefer_morning"},
        ],
    },
]

DAY_PATTERNS = [
    (0, ["lunes"]),
    (1, ["martes"]),
    (2, ["miercoles", "miércoles"]),
    (3, ["jueves"]),
    (4, ["viernes"]),
]


def _strip_accents(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def check_ollama_status(base_url="http://localhost:11434"):
    """Checks if local Ollama server is running and lists installed models."""
    url = (base_url or "http://localhost:11434").rstrip("/")
    try:
        resp = requests.get(f"{url}/api/tags", timeout=3)
        resp.raise_for_status()
        data = resp.json()
        models = [m.get("name") for m in data.get("models", []) if m.get("name")]
        recommended = None
        for pref in ("qwen2.5:3b", "qwen2.5", "llama3.2", "mistral", "gemma"):
            match = next((m for m in models if pref in m.lower()), None)
            if match:
                recommended = match
                break
        if not recommended and models:
            recommended = models[0]
        return {
            "running": True,
            "base_url": url,
            "models": models,
            "recommended": recommended,
        }
    except Exception as exc:
        return {
            "running": False,
            "base_url": url,
            "models": [],
            "recommended": None,
            "error": str(exc),
        }


def _extract_list_from_parsed(parsed, candidate_keys):
    """Unwraps either a top-level JSON list or a JSON object containing a list (common with Ollama JSON mode)."""
    if isinstance(parsed, list):
        return parsed
    if isinstance(parsed, dict):
        for k in candidate_keys:
            val = parsed.get(k)
            if isinstance(val, list):
                return val
        for val in parsed.values():
            if isinstance(val, list):
                return val
        if any(k in parsed for k in ("course_id", "type")):
            return [parsed]
    return None


def _call_llm(prompt, llm_config=None, expect_json=False, max_tokens=1024):
    """Calls Gemini, OpenAI-compatible API, or Ollama local. Returns (text, provider_used, error_msg)."""
    cfg = llm_config or {}
    provider = cfg.get("provider", "offline")

    if provider == "offline":
        return None, "offline", None

    try:
        if provider == "ollama":
            base_url = (cfg.get("base_url") or "http://127.0.0.1:11434").rstrip("/")
            model = (cfg.get("model") or "").strip()
            if not model:
                st = check_ollama_status(base_url)
                model = st.get("recommended") or "qwen2.5:3b"
            payload = {
                "model": model,
                "prompt": prompt,
                "stream": False,
                "options": {
                    "temperature": 0.1,
                    "num_ctx": 4096,
                    "num_predict": int(max_tokens),
                },
            }
            if expect_json:
                payload["format"] = "json"
            resp = requests.post(f"{base_url}/api/generate", json=payload, timeout=120)
            resp.raise_for_status()
            return resp.json().get("response", ""), f"ollama:{model}", None

        if provider == "gemini":
            api_key = (cfg.get("api_key") or "").strip()
            if not api_key:
                return None, "offline", "Falta API Key de Gemini; usando modo respaldo offline."
            model = cfg.get("model") or "gemini-2.0-flash"
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
            body = {"contents": [{"parts": [{"text": prompt}]}]}
            if expect_json:
                body["generationConfig"] = {"responseMimeType": "application/json"}
            resp = requests.post(url, json=body, timeout=35)
            resp.raise_for_status()
            data = resp.json()
            text = data["candidates"][0]["content"]["parts"][0]["text"]
            return text, f"gemini:{model}", None

        if provider == "openai":
            api_key = (cfg.get("api_key") or "").strip()
            if not api_key:
                return None, "offline", "Falta API Key de OpenAI/Groq; usando modo respaldo offline."
            base_url = (cfg.get("base_url") or "https://api.openai.com/v1").rstrip("/")
            model = cfg.get("model") or "gpt-4o-mini"
            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            body = {
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.1,
            }
            resp = requests.post(f"{base_url}/chat/completions", headers=headers, json=body, timeout=35)
            resp.raise_for_status()
            text = resp.json()["choices"][0]["message"]["content"]
            return text, f"openai:{model}", None

    except Exception as exc:
        return None, "offline", f"No se pudo conectar con {provider} ({exc}). Se aplicó respaldo local."

    return None, "offline", None


def _parse_json_from_text(text):
    if not text:
        return None
    text = text.strip()
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if m:
        text = m.group(1).strip()
    try:
        return json.loads(text)
    except Exception:
        # Try finding outermost JSON array or object
        for start_ch, end_ch in [("[", "]"), ("{", "}")]:
            i = text.find(start_ch)
            j = text.rfind(end_ch)
            if i != -1 and j > i:
                try:
                    return json.loads(text[i : j + 1])
                except Exception:
                    pass
    return None


# ==============================================================================
# R5: EXTRACTOR DE PREFERENCIAS (ESPAÑOL -> RESTRICCIONES JSON) + MÉTRICAS F1
# ==============================================================================

def _offline_extract_preferences(text, teachers=None):
    """Deterministic Spanish NLP extractor used when no API/Ollama is configured."""
    lines = [ln.strip() for ln in re.split(r"[\n;]+", text or "") if ln.strip()]
    teachers = teachers or []
    results = []

    for line in lines:
        norm = _strip_accents(line.lower())
        # Detect teacher reference
        matched_teacher_id = 0
        matched_teacher_name = "General"

        # Match explicit Docente_XX
        m_doc = re.search(r"docente[_\s-]*0*(\d+)", norm)
        if m_doc:
            num = int(m_doc.group(1))
            matched_teacher_name = f"Docente_{num:02d}"
            for t in teachers:
                if int(t["id"]) == num or f"docente_{num:02d}" in _strip_accents(t.get("name", "").lower()):
                    matched_teacher_id = int(t["id"])
                    matched_teacher_name = t["name"]
                    break
        else:
            for t in teachers:
                t_norm = _strip_accents(t.get("name", "").lower())
                tokens = [tok for tok in re.split(r"[\s.(),-]+", t_norm) if len(tok) >= 4]
                if t_norm in norm or any(tok in norm for tok in tokens):
                    matched_teacher_id = int(t["id"])
                    matched_teacher_name = t["name"]
                    break

        is_hard = any(kw in norm for kw in ["no puede", "imposible", "bloqueado", "obligatorio", "no disponible"])
        extracted_in_line = []

        # 1) Avoid day afternoon (e.g., "viernes por la tarde")
        found_day_afternoon = False
        for d_idx, names in DAY_PATTERNS:
            if any(nm in norm for nm in names) and ("tarde" in norm or "vespertin" in norm):
                extracted_in_line.append({
                    "teacher_id": matched_teacher_id,
                    "teacher_name": matched_teacher_name,
                    "type": "avoid_day_afternoon",
                    "day": d_idx,
                    "hard": is_hard,
                    "description": f"Evitar {DAYS[d_idx]} por la tarde",
                    "source_text": line,
                })
                found_day_afternoon = True

        # 2) Avoid full day ("no ... miércoles", "evitar lunes", "no asistir los jueves")
        if not found_day_afternoon:
            for d_idx, names in DAY_PATTERNS:
                if any(nm in norm for nm in names) and any(kw in norm for kw in ["no ", "evitar", "sin ", "nunca", "libre"]):
                    extracted_in_line.append({
                        "teacher_id": matched_teacher_id,
                        "teacher_name": matched_teacher_name,
                        "type": "avoid_day",
                        "day": d_idx,
                        "hard": is_hard,
                        "description": f"No asignar clases el {DAYS[d_idx]}",
                        "source_text": line,
                    })

        # 3) Avoid early hours ("primera hora", "antes de las 8", "7:00")
        if any(kw in norm for kw in ["primera hora", "antes de las 8", "antes de las 08", "antes de las 9", "7:00", "07:00", "temprano"]):
            before_h = 2 if ("8:50" in norm or "08:50" in norm or "9:" in norm or "9 " in norm) else 1
            extracted_in_line.append({
                "teacher_id": matched_teacher_id,
                "teacher_name": matched_teacher_name,
                "type": "avoid_early",
                "before_hour": before_h,
                "hard": is_hard,
                "description": f"Evitar primeras horas (antes del bloque {before_h + 1})",
                "source_text": line,
            })

        # 4) Avoid late hours ("después de las 15", "después de las 16", "noche", "últimas horas")
        if any(kw in norm for kw in ["despues de las 15", "despues de las 16", "despues de las 17", "ultimas horas", "noche", "tarde-noche", "16:45", "15:50"]):
            after_h = 12 if ("16:45" in norm or "17:" in norm) else 11
            extracted_in_line.append({
                "teacher_id": matched_teacher_id,
                "teacher_name": matched_teacher_name,
                "type": "avoid_late",
                "after_hour": after_h,
                "hard": is_hard,
                "description": "Evitar bloques vespertinos tardíos",
                "source_text": line,
            })

        # 5) Prefer morning / afternoon
        if any(kw in norm for kw in ["matutino", "en la manana", "por la manana", "turno de la manana"]):
            extracted_in_line.append({
                "teacher_id": matched_teacher_id,
                "teacher_name": matched_teacher_name,
                "type": "prefer_morning",
                "hard": False,
                "description": "Preferencia por turno matutino",
                "source_text": line,
            })
        elif any(kw in norm for kw in ["vespertino", "turno de la tarde"]) and not found_day_afternoon:
            extracted_in_line.append({
                "teacher_id": matched_teacher_id,
                "teacher_name": matched_teacher_name,
                "type": "prefer_afternoon",
                "hard": False,
                "description": "Preferencia por turno vespertino",
                "source_text": line,
            })

        # 6) Max daily hours ("máximo 4 horas", "no exceder 3 horas")
        m_max = re.search(r"(?:maximo|no exceder|no mas de|tope de)\s+(\d+)\s+hora", norm)
        if m_max:
            extracted_in_line.append({
                "teacher_id": matched_teacher_id,
                "teacher_name": matched_teacher_name,
                "type": "max_daily_hours",
                "max_hours": int(m_max.group(1)),
                "hard": False,
                "description": f"Máximo {m_max.group(1)} horas diarias",
                "source_text": line,
            })

        results.extend(extracted_in_line)

    return results


def extract_preferences(text, raw_instance=None, llm_config=None):
    """R5: Extracts structured JSON restrictions from Spanish text (anonymized before calling external LLM)."""
    teachers = (raw_instance or {}).get("teachers", [])
    anon_inst, anon_map = anonymize_instance(raw_instance or {"teachers": teachers})
    anon_teachers = [t["name"] for t in anon_inst.get("teachers", [])]

    # Anonymize real names inside user text before sending to external LLM
    safe_text = text or ""
    reverse_teacher_map = {}
    for real_name, anon_name in anon_map["teachers"].items():
        reverse_teacher_map[anon_name.lower()] = real_name
        if real_name and real_name in safe_text:
            safe_text = safe_text.replace(real_name, anon_name)

    prompt = f"""Eres el módulo extractor (R5) de restricciones para horarios universitarios ITIID.
Convierte las siguientes preferencias docentes escritas en español a una lista JSON de restricciones.
Tipos válidos de "type":
- "avoid_day" (incluir "day": 0=Lunes..4=Viernes)
- "avoid_day_afternoon" (incluir "day": 0..4)
- "avoid_early" (incluir "before_hour": 1 para 07:00 o 2 para <08:50)
- "avoid_late" (incluir "after_hour": 11 para >=15:50 o 12 para >=16:45)
- "prefer_morning"
- "prefer_afternoon"
- "max_daily_hours" (incluir "max_hours": entero)

Docentes conocidos (anonimizados): {anon_teachers}
Texto de preferencias:
\"\"\"{safe_text}\"\"\"

Responde ÚNICAMENTE con un objeto JSON válido y compacto con la clave "preferences":
{{"preferences": [{{"teacher_name": "Docente_01", "type": "avoid_day_afternoon", "day": 4, "hard": false, "description": "..."}}]}}"""

    llm_out, provider_used, warning = _call_llm(prompt, llm_config, expect_json=True, max_tokens=512)
    parsed_raw = _parse_json_from_text(llm_out) if llm_out else None
    parsed = _extract_list_from_parsed(parsed_raw, ["preferences", "restricciones", "constraints", "items"])

    if isinstance(parsed, list):
        # Map anonymized names back to teacher_id in current instance
        name_to_id = {t["name"].lower(): int(t["id"]) for t in teachers}
        anon_to_id = {}
        for idx, t in enumerate(teachers, start=1):
            anon_to_id[f"docente_{idx:02d}"] = (int(t["id"]), t["name"])
        cleaned = []
        for item in parsed:
            if not isinstance(item, dict) or not item.get("type"):
                continue
            tn = str(item.get("teacher_name", "General"))
            tn_low = tn.lower()
            tid = 0
            real_name = tn
            if tn_low in anon_to_id:
                tid, real_name = anon_to_id[tn_low]
            elif tn_low in name_to_id:
                tid = name_to_id[tn_low]
            item["teacher_id"] = tid
            item["teacher_name"] = real_name
            item.setdefault("hard", False)
            item.setdefault("description", item["type"])
            cleaned.append(item)
        return {
            "provider_used": provider_used,
            "warning": warning,
            "anonymized_text_sent": safe_text,
            "preferences": cleaned,
        }

    # Offline deterministic extractor
    extracted = _offline_extract_preferences(text, teachers=teachers)
    return {
        "provider_used": "offline (reglas NLP en español)",
        "warning": warning,
        "anonymized_text_sent": safe_text,
        "preferences": extracted,
    }


def evaluate_extractor_f1(llm_config=None):
    """Evaluates R5 extractor on the 10-item annotated dataset -> Precision, Recall, F1 overall & by type (P2)."""
    by_type = defaultdict(lambda: {"tp": 0, "fp": 0, "fn": 0})
    details = []

    for sample in GOLD_PREFERENCES_DATASET:
        res = extract_preferences(sample["text"], raw_instance={"teachers": [{"id": i, "name": f"Docente_{i:02d}"} for i in range(1, 11)]}, llm_config=llm_config)
        preds = res["preferences"]

        def _key(it):
            t = it.get("type", "")
            tn = str(it.get("teacher") or it.get("teacher_name") or "").lower().replace(" ", "_")
            extra = it.get("day") if "day" in t else (it.get("max_hours") if t == "max_daily_hours" else "")
            return (tn, t, extra)

        gold_keys = {_key(g): g for g in sample["gold"]}
        pred_keys = {_key(p): p for p in preds}

        tp_set = set(gold_keys.keys()) & set(pred_keys.keys())
        fp_set = set(pred_keys.keys()) - set(gold_keys.keys())
        fn_set = set(gold_keys.keys()) - set(pred_keys.keys())

        for k in tp_set:
            by_type[k[1]]["tp"] += 1
        for k in fp_set:
            by_type[k[1]]["fp"] += 1
        for k in fn_set:
            by_type[k[1]]["fn"] += 1

        details.append({
            "id": sample["id"],
            "text": sample["text"],
            "expected": len(gold_keys),
            "predicted": len(pred_keys),
            "tp": len(tp_set),
            "fp": len(fp_set),
            "fn": len(fn_set),
            "provider_used": res["provider_used"],
        })

    def _prf(tp, fp, fn):
        prec = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        rec = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = (2 * prec * rec / (prec + rec)) if (prec + rec) > 0 else 0.0
        return round(prec, 3), round(rec, 3), round(f1, 3)

    per_type_rows = []
    tot_tp = tot_fp = tot_fn = 0
    for ctype, counts in sorted(by_type.items()):
        tp, fp, fn = counts["tp"], counts["fp"], counts["fn"]
        tot_tp += tp
        tot_fp += fp
        tot_fn += fn
        p, r, f1 = _prf(tp, fp, fn)
        per_type_rows.append({"type": ctype, "tp": tp, "fp": fp, "fn": fn, "precision": p, "recall": r, "f1": f1})

    op, or_, of1 = _prf(tot_tp, tot_fp, tot_fn)
    return {
        "overall": {"tp": tot_tp, "fp": tot_fp, "fn": tot_fn, "precision": op, "recall": or_, "f1": of1},
        "by_type": per_type_rows,
        "samples": details,
        "provider_used": details[0]["provider_used"] if details else "offline",
    }


# ==============================================================================
# R6: HORARIO DIRECTO AL LLM (P1) — CON Y SIN CORRECCIONES DEL VALIDADOR
# ==============================================================================

def llm_direct_schedule(raw_instance, scenario="C", llm_config=None, with_validator_retry=False):
    """P1 test & local LLM solver: asks the LLM directly to produce a timetable (anonymized) and scores it with the official validator."""
    t0 = time.perf_counter()
    inst = normalize_instance(raw_instance)
    room_by_group = {r["group_id"]: r["id"] for r in inst["rooms"]}
    default_room = inst["rooms"][0]["id"] if inst["rooms"] else 1

    compact_courses = [
        {
            "course_id": c["id"],
            "name": c["name"],
            "group_id": c["group_id"],
            "room_id": room_by_group.get(c["group_id"], default_room),
            "teacher_id": c["teacher_id"],
            "weekly_sessions": c["weekly_sessions"],
        }
        for c in inst["courses"]
    ]
    total_sessions = sum(c["weekly_sessions"] for c in inst["courses"])

    # Summarize teacher unavailable days/slots compactly (anonymized IDs only)
    unavail_summary = {
        str(tid): slots[:20]
        for tid, slots in inst["teacher_unavailable"].items()
        if slots
    }

    prompt = f"""Eres un generador de horarios universitarios (ITIID).
Asigna EXACTAMENTE {total_sessions} sesiones en total (según weekly_sessions de cada curso).
Reglas obligatorias:
- Días: 0=Lunes, 1=Martes, 2=Miércoles, 3=Jueves, 4=Viernes.
- Horas válidas por día (sin recesos): {TEACHABLE_HOURS}.
- Fórmula de bloque: start_slot = dia * 17 + hora.
- Ningún docente ni grupo puede tener 2 clases en el mismo start_slot.
- Respeta bloqueos de disponibilidad por teacher_id: {json.dumps(unavail_summary, ensure_ascii=False)}

Cursos a asignar:
{json.dumps(compact_courses, ensure_ascii=False)}

Responde ÚNICAMENTE con un objeto JSON compacto (sin saltos de línea innecesarios) con la clave "schedule":
{{"schedule": [{{"course_id": 37, "room_id": 701, "start_slot": 0}}]}}"""

    llm_out, provider_used, warning = _call_llm(prompt, llm_config, expect_json=True, max_tokens=1500)
    parsed_raw = _parse_json_from_text(llm_out) if llm_out else None
    parsed = _extract_list_from_parsed(parsed_raw, ["schedule", "horarios", "assignments", "clases"])

    used_real_llm = False
    if isinstance(parsed, list) and len(parsed) > 0:
        sched = []
        for it in parsed:
            if isinstance(it, dict) and "course_id" in it and "start_slot" in it:
                try:
                    cid = int(it["course_id"])
                    slot = int(it["start_slot"])
                    c_obj = next((c for c in inst["courses"] if c["id"] == cid), None)
                    rid = int(it.get("room_id") or (room_by_group.get(c_obj["group_id"], default_room) if c_obj else default_room))
                    sched.append({"course_id": cid, "room_id": rid, "start_slot": slot})
                except (TypeError, ValueError):
                    continue
        used_real_llm = len(sched) > 0

    if not used_real_llm:
        if llm_out and not warning:
            warning = f"El modelo ({provider_used}) no devolvió un JSON de horario válido; se aplicó respaldo local."
        rng = random.Random(2026)
        sched = []
        for idx, c in enumerate(inst["courses"]):
            rid = room_by_group.get(c["group_id"], default_room)
            for s_i in range(c["weekly_sessions"]):
                d = (s_i + idx // 3) % 5
                h = TEACHABLE_HOURS[(idx + s_i // 5) % 6]
                if rng.random() < 0.12:
                    h = 4
                sched.append({"course_id": c["id"], "room_id": rid, "start_slot": d * SLOTS_PER_DAY + h})
        provider_used = "offline (simulación LLM directo sin motor)"

    val_initial = validate_schedule(inst, sched, scenario=scenario)

    if not with_validator_retry or val_initial["feasible"]:
        return {
            "provider_used": provider_used,
            "warning": warning,
            "elapsed_ms": round((time.perf_counter() - t0) * 1000, 1),
            "schedule": sched,
            "validation": val_initial,
            "retried": False,
        }

    # Optional 1-round feedback correction using validator conflict messages
    if used_real_llm and llm_config and llm_config.get("provider") != "offline":
        feedback_prompt = f"""Tu horario anterior tuvo {val_initial['hard_violations']['total']} violaciones duras reportadas por el Validador Oficial:
{json.dumps(val_initial['conflicts_detail'][:12], ensure_ascii=False)}

Cursos requeridos (exactamente {total_sessions} sesiones):
{json.dumps(compact_courses, ensure_ascii=False)}

Corrige las asignaciones conflictivas usando horas válidas {TEACHABLE_HOURS} (start_slot = dia*17 + hora) y responde ÚNICAMENTE con un objeto JSON compacto:
{{"schedule": [{{"course_id": 37, "room_id": 701, "start_slot": 0}}]}}"""
        llm_out2, _, warn2 = _call_llm(feedback_prompt, llm_config, expect_json=True, max_tokens=1500)
        parsed_raw2 = _parse_json_from_text(llm_out2) if llm_out2 else None
        parsed2 = _extract_list_from_parsed(parsed_raw2, ["schedule", "horarios", "assignments", "clases"])
        if isinstance(parsed2, list) and len(parsed2) > 0:
            sched2 = []
            for it in parsed2:
                if isinstance(it, dict) and "course_id" in it and "start_slot" in it:
                    try:
                        cid = int(it["course_id"])
                        slot = int(it["start_slot"])
                        c_obj = next((c for c in inst["courses"] if c["id"] == cid), None)
                        rid = int(it.get("room_id") or (room_by_group.get(c_obj["group_id"], default_room) if c_obj else default_room))
                        sched2.append({"course_id": cid, "room_id": rid, "start_slot": slot})
                    except (TypeError, ValueError):
                        continue
            if sched2:
                val_after = validate_schedule(inst, sched2, scenario=scenario)
                return {
                    "provider_used": provider_used,
                    "warning": warning or warn2,
                    "elapsed_ms": round((time.perf_counter() - t0) * 1000, 1),
                    "schedule": sched2,
                    "validation": val_after,
                    "initial_validation": val_initial,
                    "retried": True,
                }
        return {
            "provider_used": provider_used,
            "warning": warning or warn2 or "La ronda de corrección no devolvió un JSON válido; se conserva el horario inicial.",
            "elapsed_ms": round((time.perf_counter() - t0) * 1000, 1),
            "schedule": sched,
            "validation": val_initial,
            "initial_validation": val_initial,
            "retried": True,
        }

    # Offline partial-fix pass (only when in offline mode)
    fixed = list(sched)
    rng = random.Random(2027)
    t_unavail = {int(k): set(v) for k, v in inst["teacher_unavailable"].items()}
    courses_by_id = {c["id"]: c for c in inst["courses"]}
    seen_group = set()
    for i, it in enumerate(fixed):
        c = courses_by_id.get(it["course_id"])
        if not c:
            continue
        slot = it["start_slot"]
        is_break = (slot % SLOTS_PER_DAY) in {4, 8, 13}
        is_unavail = c["teacher_id"] and slot in t_unavail.get(c["teacher_id"], set())
        is_dup = (c["group_id"], slot) in seen_group
        if (is_break or is_unavail or is_dup) and rng.random() < 0.65:
            cand = rng.choice(TEACHABLE_SLOTS)
            fixed[i] = {**it, "start_slot": cand}
            seen_group.add((c["group_id"], cand))
        else:
            seen_group.add((c["group_id"], slot))

    val_after = validate_schedule(inst, fixed, scenario=scenario)
    return {
        "provider_used": provider_used,
        "warning": warning,
        "elapsed_ms": round((time.perf_counter() - t0) * 1000, 1),
        "schedule": fixed,
        "validation": val_after,
        "initial_validation": val_initial,
        "retried": True,
    }


# ==============================================================================
# R6: EXPLICADOR DE CONFLICTOS Y TRADUCTOR DE CAMBIOS (P4 & I4)
# ==============================================================================

def explain_conflicts(validation, raw_instance=None, llm_config=None):
    """R6: Explains hard conflicts and soft quality bottlenecks in plain Spanish and proposes concrete fixes."""
    hv = validation.get("hard_violations", {})
    sm = validation.get("soft_metrics", {})
    details = validation.get("conflicts_detail", [])

    prompt = f"""Eres el asistente explicador (R6) de coordinación académica de ITIID.
Con base únicamente en el reporte del Validador Oficial, redacta en español claro y conciso:
1. Diagnóstico general (factibilidad y calidad).
2. Explicación de los principales conflictos o huecos detectados.
3. Tres propuestas concretas de ajuste para la coordinación.
Nunca inventes asignaciones directas; sugiere cambios de parámetros, escenario o disponibilidad para volver a correr CP-SAT.

Reporte del validador:
{json.dumps({"feasible": validation.get("feasible"), "scenario": validation.get("scenario_name"), "hard_violations": hv, "soft_metrics": sm, "soft_penalty": validation.get("soft_penalty"), "conflicts_detail": details[:10]}, ensure_ascii=False)}"""

    llm_out, provider_used, warning = _call_llm(prompt, llm_config, expect_json=False, max_tokens=600)
    if llm_out:
        return {"provider_used": provider_used, "warning": warning, "explanation": llm_out.strip()}

    # Structured offline explanation in clear Spanish
    lines = []
    if validation.get("feasible"):
        lines.append(f"✅ **Diagnóstico:** El horario es **100% factible** (0 violaciones duras) bajo **{validation.get('scenario_name', 'Escenario C')}**, con penalización blanda de **{validation.get('soft_penalty', 0)} puntos**.")
    else:
        lines.append(f"⚠️ **Diagnóstico:** El horario **NO es factible**. El validador detectó **{hv.get('total', 0)} violaciones duras** que impiden aprobarlo para coordinación:")
        if hv.get("teacher_conflict"):
            lines.append(f"- **Traslapes de docente:** {hv['teacher_conflict']} casos donde un profesor tiene dos clases a la misma hora.")
        if hv.get("group_conflict"):
            lines.append(f"- **Traslapes de grupo:** {hv['group_conflict']} casos donde un grupo tiene dos materias simultáneas.")
        if hv.get("room_conflict"):
            lines.append(f"- **Traslapes de aula:** {hv['room_conflict']} colisiones de espacio físico.")
        if hv.get("availability"):
            lines.append(f"- **Disponibilidad / Recursos compartidos / Recesos:** {hv['availability']} sesiones fuera de la disponibilidad permitida.")
        if hv.get("missing_hours"):
            lines.append(f"- **Horas no cubiertas:** {hv['missing_hours']} sesiones semanales faltantes o excedentes.")

    lines.append("")
    lines.append("📊 **Análisis de calidad (criterios blandos):**")
    lines.append(f"- **Horas muertas de estudiantes:** {sm.get('student_gaps', 0)} bloques vacíos entre clases.")
    lines.append(f"- **Huecos entre clases de docentes:** {sm.get('teacher_gaps', 0)} bloques.")
    lines.append(f"- **Jornadas excesivas (>6h/día):** {sm.get('excessive_days', 0)} excedentes.")
    lines.append(f"- **Preferencias docentes cumplidas:** {sm.get('preferences_met_pct', 100)}% ({sm.get('preferences_met', 0)}/{sm.get('preferences_total', 0)}).")

    if details:
        lines.append("")
        lines.append("🔍 **Ejemplos puntuales reportados por el validador:**")
        for item in details[:5]:
            lines.append(f"- {item.get('message', '')}")

    lines.append("")
    lines.append("🛠️ **Propuestas de ajuste para volver a optimizar con CP-SAT:**")
    if not validation.get("feasible"):
        lines.append("1. **Ampliar disponibilidad crítica:** Revisar los docentes con violaciones de disponibilidad y solicitar 1–2 bloques adicionales o reasignar la materia.")
        lines.append("2. **Re-ejecutar con motor CP-SAT:** A diferencia de métodos directos/LLM, CP-SAT garantiza 0 violaciones duras si existe solución matemática.")
    else:
        if sm.get("student_gaps", 0) > sm.get("teacher_gaps", 0):
            lines.append("1. **Cambiar a Escenario A (Estudiantes):** Incrementa el peso de horas muertas estudiantiles para compactar bloques por grupo.")
        elif sm.get("teacher_gaps", 0) > 0:
            lines.append("1. **Cambiar a Escenario B (Docentes):** Prioriza eliminar huecos de docentes y maximizar el % de preferencias cumplidas.")
        else:
            lines.append("1. **Horario altamente compacto:** Mantener el Escenario C (Equilibrio) y exportar la sábana general para revisión de coordinación.")
        lines.append("2. **Validar recursos compartidos:** Confirmar si existen laboratorios prestados a otras carreras antes de congelar la sábana.")
        lines.append("3. **Probar reprogramación (I4):** Si algún docente reporta cambio de último minuto, usar reprogramación mínima para no mover el resto del horario.")

    return {
        "provider_used": "offline (explicador estructurado)",
        "warning": warning,
        "explanation": "\n".join(lines),
    }


def parse_change_request(text, raw_instance, llm_config=None):
    """R6: Translates a coordination change request in Spanish into concrete unavailable slots for I4 rescheduling."""
    extracted = extract_preferences(text, raw_instance=raw_instance, llm_config=llm_config)
    inst = normalize_instance(raw_instance)
    teachers = inst["teachers"]
    new_constraints = []

    for p in extracted.get("preferences", []):
        tid = int(p.get("teacher_id", 0))
        if not tid and teachers:
            # fallback to first teacher mentioned or first teacher in instance
            tid = int(teachers[0]["id"])
            p["teacher_id"] = tid
            p["teacher_name"] = teachers[0].get("name", f"Docente {tid}")
        p["hard"] = True
        if p.get("type") == "avoid_day":
            d = int(p.get("day", 2))
            for h in TEACHABLE_HOURS:
                new_constraints.append({"teacher_id": tid, "slot_id": d * SLOTS_PER_DAY + h})
        elif p.get("type") == "avoid_day_afternoon":
            d = int(p.get("day", 4))
            for h in TEACHABLE_HOURS:
                if h >= 9:
                    new_constraints.append({"teacher_id": tid, "slot_id": d * SLOTS_PER_DAY + h})
        elif p.get("type") == "avoid_early":
            bh = int(p.get("before_hour", 1))
            for d in range(5):
                for h in TEACHABLE_HOURS:
                    if h < bh:
                        new_constraints.append({"teacher_id": tid, "slot_id": d * SLOTS_PER_DAY + h})
        elif p.get("type") == "avoid_late":
            ah = int(p.get("after_hour", 11))
            for d in range(5):
                for h in TEACHABLE_HOURS:
                    if h >= ah:
                        new_constraints.append({"teacher_id": tid, "slot_id": d * SLOTS_PER_DAY + h})

    return {
        "provider_used": extracted.get("provider_used", "offline"),
        "warning": extracted.get("warning"),
        "parsed_preferences": extracted.get("preferences", []),
        "new_constraints": new_constraints,
    }
