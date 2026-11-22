import base64
import io
import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill, Border, Side

from validator import DAYS, TIME_SLOTS, SLOTS_PER_DAY, normalize_instance


HEADER_FILL = PatternFill(start_color="1D4ED8", end_color="1D4ED8", fill_type="solid")
SUBHEADER_FILL = PatternFill(start_color="DBEAFE", end_color="DBEAFE", fill_type="solid")
BREAK_FILL = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")
HEADER_FONT = Font(color="FFFFFF", bold=True, size=10)
BOLD_FONT = Font(bold=True, size=10)
THIN_BORDER = Border(
    left=Side(style="thin", color="D1D5DB"),
    right=Side(style="thin", color="D1D5DB"),
    top=Side(style="thin", color="D1D5DB"),
    bottom=Side(style="thin", color="D1D5DB"),
)


def _style_header_row(ws, row_idx, max_col):
    for c in range(1, max_col + 1):
        cell = ws.cell(row=row_idx, column=c)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = THIN_BORDER


def _auto_fit(ws, min_w=14, max_w=34):
    for col in ws.columns:
        max_len = 0
        col_letter = col[0].column_letter
        for cell in col:
            val = str(cell.value or "")
            longest_line = max((len(line) for line in val.split("\n")), default=0)
            if longest_line > max_len:
                max_len = longest_line
        ws.column_dimensions[col_letter].width = max(min_w, min(max_w, max_len + 4))


def export_schedule_excel_b64(raw_instance, schedule, validation=None):
    """Exports multi-sheet Excel: Sabana General ITIID, Por Grupo, Por Docente, Por Aula, Validador."""
    inst = normalize_instance(raw_instance)
    courses_by_id = {c["id"]: c for c in inst["courses"]}
    teachers_by_id = {int(t["id"]): t.get("name", f"Docente {t['id']}") for t in inst["teachers"]}
    rooms_by_id = {r["id"]: r for r in inst["rooms"]}

    wb = Workbook()

    # 1) Sábana General ITIID (Master Schedule)
    ws_sabana = wb.active
    ws_sabana.title = "Sabana_General_ITIID"
    ws_sabana.append(["SÁBANA GENERAL DE HORARIOS — ITIID", f"Instancia: {inst['name']}"])
    ws_sabana.cell(1, 1).font = Font(bold=True, size=13, color="1D4ED8")
    ws_sabana.append([])

    headers = ["Grupo / Aula", "Día", "Hora", "Materia", "Docente", "Cuatrimestre"]
    ws_sabana.append(headers)
    _style_header_row(ws_sabana, 3, len(headers))

    rows_sabana = []
    for it in schedule or []:
        c = courses_by_id.get(int(it["course_id"]), {})
        r = rooms_by_id.get(int(it["room_id"]), {})
        slot = int(it["start_slot"])
        d = slot // SLOTS_PER_DAY
        h = slot % SLOTS_PER_DAY
        rows_sabana.append((
            r.get("name", f"Grupo {it['room_id']}"),
            d,
            h,
            DAYS[d] if 0 <= d < len(DAYS) else f"Día {d}",
            TIME_SLOTS[h] if 0 <= h < len(TIME_SLOTS) else str(h),
            c.get("name", f"Curso {it['course_id']}"),
            teachers_by_id.get(c.get("teacher_id", 0), "Sin docente"),
            c.get("cuatrimestre", ""),
        ))
    rows_sabana.sort(key=lambda x: (x[0], x[1], x[2]))
    for row in rows_sabana:
        ws_sabana.append([row[0], row[3], row[4], row[5], row[6], row[7]])
    _auto_fit(ws_sabana)

    # Helper to render grid sheets (Por Grupo / Por Docente / Por Aula)
    def build_grid_sheet(title, entity_list, key_fn, cell_fn):
        ws = wb.create_sheet(title=title)
        r_cursor = 1
        for ent_id, ent_label in entity_list:
            ws.cell(r_cursor, 1, f"{title.replace('_', ' ')}: {ent_label}").font = Font(bold=True, size=11, color="1E3A8A")
            r_cursor += 1
            ws.append(["Hora"] + DAYS)
            _style_header_row(ws, r_cursor, 1 + len(DAYS))
            r_cursor += 1

            grid = {}
            for it in schedule or []:
                if key_fn(it) == ent_id:
                    slot = int(it["start_slot"])
                    grid[(slot // SLOTS_PER_DAY, slot % SLOTS_PER_DAY)] = cell_fn(it)

            for h_idx, h_label in enumerate(TIME_SLOTS):
                is_break = "Receso" in h_label
                row_vals = [h_label]
                for d_idx in range(len(DAYS)):
                    row_vals.append("RECESO" if is_break else grid.get((d_idx, h_idx), "-"))
                ws.append(row_vals)
                for col_i in range(1, 2 + len(DAYS)):
                    cell = ws.cell(r_cursor, col_i)
                    cell.border = THIN_BORDER
                    cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
                    if is_break:
                        cell.fill = BREAK_FILL
                r_cursor += 1
            r_cursor += 2
        _auto_fit(ws)

    # 2) Por Grupo
    groups_seen = []
    seen_gids = set()
    for r in inst["rooms"]:
        gid = r["group_id"] or r["id"]
        if gid not in seen_gids:
            seen_gids.add(gid)
            groups_seen.append((gid, r["name"]))
    build_grid_sheet(
        "Por_Grupo",
        groups_seen,
        lambda it: courses_by_id.get(int(it["course_id"]), {}).get("group_id", it["room_id"]),
        lambda it: f"{courses_by_id.get(int(it['course_id']), {}).get('name', '')}\n({teachers_by_id.get(courses_by_id.get(int(it['course_id']), {}).get('teacher_id', 0), 'Sin docente')})",
    )

    # 3) Por Docente
    used_tids = sorted({courses_by_id.get(int(it["course_id"]), {}).get("teacher_id", 0) for it in (schedule or [])} - {0})
    teacher_list = [(tid, teachers_by_id.get(tid, f"Docente {tid}")) for tid in used_tids]
    build_grid_sheet(
        "Por_Docente",
        teacher_list,
        lambda it: courses_by_id.get(int(it["course_id"]), {}).get("teacher_id", 0),
        lambda it: f"{courses_by_id.get(int(it['course_id']), {}).get('name', '')}\n[{rooms_by_id.get(int(it['room_id']), {}).get('name', it['room_id'])}]",
    )

    # 4) Por Aula
    room_list = [(r["id"], r["name"]) for r in inst["rooms"]]
    build_grid_sheet(
        "Por_Aula",
        room_list,
        lambda it: int(it["room_id"]),
        lambda it: f"{courses_by_id.get(int(it['course_id']), {}).get('name', '')}\n({teachers_by_id.get(courses_by_id.get(int(it['course_id']), {}).get('teacher_id', 0), 'Sin docente')})",
    )

    # 5) Reporte Validador
    ws_val = wb.create_sheet(title="Reporte_Validador")
    ws_val.append(["Métrica", "Valor"])
    _style_header_row(ws_val, 1, 2)
    if validation:
        hv = validation.get("hard_violations", {})
        sm = validation.get("soft_metrics", {})
        rows_v = [
            ("Factible (0 violaciones duras)", "SÍ" if validation.get("feasible") else "NO"),
            ("Escenario", validation.get("scenario_name", "C")),
            ("Violaciones Duras Totales", hv.get("total", 0)),
            ("  - Traslape Docente", hv.get("teacher_conflict", 0)),
            ("  - Traslape Grupo", hv.get("group_conflict", 0)),
            ("  - Traslape Aula", hv.get("room_conflict", 0)),
            ("  - Disponibilidad / Bloqueos", hv.get("availability", 0)),
            ("  - Horas No Cubiertas", hv.get("missing_hours", 0)),
            ("Penalización Blanda Total", validation.get("soft_penalty", 0)),
            ("  - Horas Muertas (Estudiantes)", sm.get("student_gaps", 0)),
            ("  - Huecos (Docentes)", sm.get("teacher_gaps", 0)),
            ("  - Jornadas Excesivas (>6h)", sm.get("excessive_days", 0)),
            ("  - Penalización Reparto Semanal", sm.get("spread_penalty", 0)),
            ("  - Desbalance Carga Docente", sm.get("teacher_balance", 0)),
            ("  - % Preferencias Cumplidas", f"{sm.get('preferences_met_pct', 100)}%"),
        ]
        if validation.get("stability"):
            rows_v.append(("Estabilidad I4 (Sesiones Movidas)", validation["stability"]["moved_sessions"]))
        for k, v in rows_v:
            ws_val.append([k, v])
    _auto_fit(ws_val)

    buf = io.BytesIO()
    wb.save(buf)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def export_template_excel_b64():
    """Generates a clean Excel input template for R1 (Docentes, Materias, Grupos_Aulas, Recursos_Compartidos)."""
    wb = Workbook()

    ws_t = wb.active
    ws_t.title = "Docentes"
    ws_t.append(["id", "name", "turno_disponible"])
    _style_header_row(ws_t, 1, 3)
    ws_t.append([1, "Docente_01", "completo"])
    ws_t.append([2, "Docente_02", "matutino"])
    ws_t.append([3, "Docente_03", "completo"])
    ws_t.append([4, "Docente_04", "matutino"])
    _auto_fit(ws_t)

    ws_r = wb.create_sheet("Grupos_Aulas")
    ws_r.append(["id", "name", "capacity", "group_id", "type"])
    _style_header_row(ws_r, 1, 5)
    ws_r.append([701, "ITIID 7-1 (Aula B-104)", 35, 701, "aula"])
    _auto_fit(ws_r)

    ws_c = wb.create_sheet("Materias")
    ws_c.append(["id", "name", "teacher_id", "group_id", "cuatrimestre", "weekly_sessions", "students"])
    _style_header_row(ws_c, 1, 7)
    ws_c.append([37, "Inglés VI", 1, 701, 7, 5, 30])
    ws_c.append([40, "Fundamentos de Inteligencia Artificial", 2, 701, 7, 6, 30])
    ws_c.append([42, "Optativa I", 3, 701, 7, 6, 30])
    ws_c.append([43, "Seguridad Informática", 4, 701, 7, 6, 30])
    _auto_fit(ws_c)

    ws_b = wb.create_sheet("Recursos_Compartidos")
    ws_b.append(["type", "id", "day_index", "hour_index", "reason"])
    _style_header_row(ws_b, 1, 5)
    ws_b.append(["room", 701, 0, 0, "Ocupado por otro programa Lun 07:00"])
    _auto_fit(ws_b)

    buf = io.BytesIO()
    wb.save(buf)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def import_excel_b64(file_b64, filename="plantilla.xlsx"):
    """Imports Excel using pandas + openpyxl, checks missing data (R1), returns unified JSON instance."""
    raw_bytes = base64.b64decode(file_b64)
    xl = pd.ExcelFile(io.BytesIO(raw_bytes), engine="openpyxl")
    sheets = xl.sheet_names
    warnings = []

    def _avail_from_shift(shift_str):
        s = str(shift_str or "completo").strip().lower()
        if "matut" in s or "mañ" in s:
            hrs = [0, 1, 2, 3, 5, 6, 7]
        elif "vesp" in s or "tard" in s:
            hrs = [9, 10, 11, 12, 14, 15, 16]
        else:
            hrs = [0, 1, 2, 3, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16]
        return {d: {TIME_SLOTS[h]: True for h in hrs} for d in DAYS}

    teachers = []
    if "Docentes" in sheets:
        df_t = xl.parse("Docentes")
        for idx, row in df_t.iterrows():
            if pd.isna(row.get("id")) or pd.isna(row.get("name")):
                warnings.append(f"Hoja Docentes fila {idx + 2}: faltan campos 'id' o 'name' (omitida).")
                continue
            teachers.append({
                "id": int(row["id"]),
                "name": str(row["name"]).strip(),
                "availability": _avail_from_shift(row.get("turno_disponible", "completo")),
            })
    else:
        warnings.append("Falta hoja 'Docentes' en el archivo Excel.")

    rooms = []
    if "Grupos_Aulas" in sheets:
        df_r = xl.parse("Grupos_Aulas")
        for idx, row in df_r.iterrows():
            if pd.isna(row.get("id")) or pd.isna(row.get("name")):
                warnings.append(f"Hoja Grupos_Aulas fila {idx + 2}: faltan campos 'id' o 'name' (omitida).")
                continue
            rid = int(row["id"])
            rooms.append({
                "id": rid,
                "name": str(row["name"]).strip(),
                "capacity": int(row["capacity"]) if not pd.isna(row.get("capacity")) else 35,
                "group_id": int(row["group_id"]) if not pd.isna(row.get("group_id")) else rid,
                "type": str(row.get("type", "aula") or "aula"),
            })
    else:
        warnings.append("Falta hoja 'Grupos_Aulas' en el archivo Excel.")

    courses = []
    if "Materias" in sheets:
        df_c = xl.parse("Materias")
        for idx, row in df_c.iterrows():
            if pd.isna(row.get("id")) or pd.isna(row.get("name")) or pd.isna(row.get("weekly_sessions")):
                warnings.append(f"Hoja Materias fila {idx + 2}: faltan campos obligatorios (omitida).")
                continue
            courses.append({
                "id": int(row["id"]),
                "name": str(row["name"]).strip(),
                "teacher_id": int(row["teacher_id"]) if not pd.isna(row.get("teacher_id")) else 0,
                "group_id": int(row["group_id"]) if not pd.isna(row.get("group_id")) else (rooms[0]["group_id"] if rooms else 1),
                "cuatrimestre": int(row["cuatrimestre"]) if not pd.isna(row.get("cuatrimestre")) else 7,
                "weekly_sessions": int(row["weekly_sessions"]),
                "students": int(row["students"]) if not pd.isna(row.get("students")) else 30,
            })
    else:
        warnings.append("Falta hoja 'Materias' en el archivo Excel.")

    blocked_slots = []
    if "Recursos_Compartidos" in sheets:
        df_b = xl.parse("Recursos_Compartidos")
        for idx, row in df_b.iterrows():
            if pd.isna(row.get("id")) or pd.isna(row.get("day_index")) or pd.isna(row.get("hour_index")):
                continue
            b_type = str(row.get("type", "room")).strip().lower()
            slot = int(row["day_index"]) * SLOTS_PER_DAY + int(row["hour_index"])
            entry = {
                "type": b_type,
                "slot_id": slot,
                "reason": str(row.get("reason", "Ocupado por otro programa")),
            }
            if b_type == "teacher":
                entry["teacher_id"] = int(row["id"])
            else:
                entry["room_id"] = int(row["id"])
            blocked_slots.append(entry)

    instance = {
        "id": "EXCEL",
        "name": f"Excel Importado ({filename})",
        "description": f"Instancia cargada desde {filename} vía pandas/openpyxl ({len(teachers)} docentes, {len(courses)} materias, {len(rooms)} aulas).",
        "teachers": teachers,
        "rooms": rooms,
        "courses": courses,
        "constraints": [],
        "blocked_slots": blocked_slots,
        "preferences": [],
    }
    return {"instance": instance, "warnings": warnings, "sheets_found": sheets}
