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

    # 1) Sábana General ITIID (EXACT UPV horizontal side-by-side layout matching the official Excel!)
    ws_sabana = wb.active
    ws_sabana.title = "Sabana_General_ITIID"
    ws_sabana.cell(1, 1, f"SÁBANA GENERAL DE HORARIOS — {inst['name']}").font = Font(bold=True, size=13, color="1D4ED8")

    # Build quick lookup maps
    sched_by_room_slot = {}
    for it in schedule or []:
        sched_by_room_slot.setdefault((int(it["room_id"]), int(it["start_slot"])), []).append(it)
    blocked_room_slot = {}
    blocked_teacher_slot = {}
    for b in inst.get("blocked_slots", []) or []:
        if b.get("type") == "teacher" and b.get("teacher_id") is not None:
            blocked_teacher_slot[(int(b["teacher_id"]), int(b["slot_id"]))] = b
        elif b.get("room_id") is not None:
            blocked_room_slot[(int(b["room_id"]), int(b["slot_id"]))] = b

    eng_fill = PatternFill(start_color="E0F2FE", end_color="E0F2FE", fill_type="solid")
    class_fill = PatternFill(start_color="EFF6FF", end_color="EFF6FF", fill_type="solid")
    posg_fill = PatternFill(start_color="F3E8FF", end_color="F3E8FF", fill_type="solid")
    day_shorts = ["L", "M", "Mi", "J", "V"]

    # Row 3: Group headers side-by-side (each group uses 6 cols: Hora + 5 days + 1 spacer)
    col_cursor = 1
    room_col_starts = []
    for r in inst["rooms"]:
        room_col_starts.append((r, col_cursor))
        ws_sabana.cell(3, col_cursor, r["name"]).font = HEADER_FONT
        ws_sabana.merge_cells(start_row=3, start_column=col_cursor, end_row=3, end_column=col_cursor + 5)
        for cc in range(col_cursor, col_cursor + 6):
            cell = ws_sabana.cell(3, cc)
            cell.fill = HEADER_FILL
            cell.alignment = Alignment(horizontal="center", vertical="center")
            cell.border = THIN_BORDER
        ws_sabana.cell(4, col_cursor, "Hora").font = BOLD_FONT
        ws_sabana.cell(4, col_cursor).fill = SUBHEADER_FILL
        ws_sabana.cell(4, col_cursor).alignment = Alignment(horizontal="center", vertical="center")
        ws_sabana.cell(4, col_cursor).border = THIN_BORDER
        for d_i, ds in enumerate(day_shorts):
            c_day = ws_sabana.cell(4, col_cursor + 1 + d_i, ds)
            c_day.font = BOLD_FONT
            c_day.fill = SUBHEADER_FILL
            c_day.alignment = Alignment(horizontal="center", vertical="center")
            c_day.border = THIN_BORDER
        col_cursor += 7  # 1 empty separator column between groups

    # Rows 5..: time blocks matching UPV Excel (skip 13:55-14:00 micro-break; hide empty 18:00-20:45 evening rows)
    used_evening = any((int(it["start_slot"]) % SLOTS_PER_DAY) >= 14 for it in (schedule or []))
    visible_hours = [
        (h_idx, h_label) for h_idx, h_label in enumerate(TIME_SLOTS)
        if h_idx != 8 and (used_evening or h_idx <= 13)
    ]
    for vis_pos, (h_idx, h_label) in enumerate(visible_hours):
        row_i = 5 + vis_pos
        is_break = "Receso" in h_label
        ws_sabana.row_dimensions[row_i].height = 20 if is_break else 34
        for r, start_c in room_col_starts:
            c_hr = ws_sabana.cell(row_i, start_c, "Receso" if is_break else h_label)
            c_hr.font = BOLD_FONT
            c_hr.alignment = Alignment(horizontal="center", vertical="center")
            c_hr.border = THIN_BORDER
            if is_break:
                c_hr.fill = BREAK_FILL
            for d_i in range(5):
                cell = ws_sabana.cell(row_i, start_c + 1 + d_i)
                cell.border = THIN_BORDER
                cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
                if is_break:
                    cell.value = "Receso"
                    cell.fill = BREAK_FILL
                    continue
                slot = d_i * SLOTS_PER_DAY + h_idx
                items = sched_by_room_slot.get((r["id"], slot), [])
                blk = blocked_room_slot.get((r["id"], slot))
                if items:
                    parts = []
                    for it in items:
                        c_obj = courses_by_id.get(int(it["course_id"]), {})
                        t_nm = teachers_by_id.get(c_obj.get("teacher_id", 0), "")
                        parts.append(f"{c_obj.get('name', it['course_id'])}\n{t_nm}")
                    cell.value = "\n---\n".join(parts)
                    cell.fill = class_fill
                    cell.font = Font(size=8)
                elif blk:
                    cell.value = f"{blk.get('subject', 'INGLÉS')}\n{blk.get('teacher', blk.get('reason', ''))}"
                    cell.fill = eng_fill
                    cell.font = Font(size=8, italic=True, color="0369A1")
                else:
                    cell.value = ""

    for r, start_c in room_col_starts:
        ws_sabana.column_dimensions[ws_sabana.cell(4, start_c).column_letter].width = 14
        for d_i in range(5):
            ws_sabana.column_dimensions[ws_sabana.cell(4, start_c + 1 + d_i).column_letter].width = 18
        ws_sabana.column_dimensions[ws_sabana.cell(4, start_c + 6).column_letter].width = 3

    # 1B) Sábana por Docente Lado a Lado (matching Hoja 4 of UPV Excel!)
    ws_doc_sab = wb.create_sheet(title="Sabana_Docentes_UPV")
    ws_doc_sab.cell(1, 1, "HORARIOS POR DOCENTE (FORMATO SÁBANA UPV)").font = Font(bold=True, size=12, color="1D4ED8")
    sched_by_teacher_slot = {}
    for it in schedule or []:
        c_obj = courses_by_id.get(int(it["course_id"]), {})
        tid = c_obj.get("teacher_id", 0)
        if tid:
            sched_by_teacher_slot.setdefault((tid, int(it["start_slot"])), []).append(it)

    active_teachers = [
        t for t in inst["teachers"]
        if any(k[0] == int(t["id"]) for k in sched_by_teacher_slot) or any(k[0] == int(t["id"]) for k in blocked_teacher_slot)
    ]
    t_col = 1
    t_starts = []
    for t in active_teachers:
        tid = int(t["id"])
        t_starts.append((t, t_col))
        ws_doc_sab.cell(3, t_col, t.get("name", f"Docente {tid}")).font = HEADER_FONT
        ws_doc_sab.merge_cells(start_row=3, start_column=t_col, end_row=3, end_column=t_col + 5)
        for cc in range(t_col, t_col + 6):
            c_h = ws_doc_sab.cell(3, cc)
            c_h.fill = HEADER_FILL
            c_h.alignment = Alignment(horizontal="center", vertical="center")
            c_h.border = THIN_BORDER
        ws_doc_sab.cell(4, t_col, t.get("window", "Disponible")).font = Font(italic=True, size=9, color="1E3A8A")
        ws_doc_sab.merge_cells(start_row=4, start_column=t_col, end_row=4, end_column=t_col + 5)
        ws_doc_sab.cell(5, t_col, "Hora").fill = SUBHEADER_FILL
        ws_doc_sab.cell(5, t_col).font = BOLD_FONT
        ws_doc_sab.cell(5, t_col).border = THIN_BORDER
        for d_i, ds in enumerate(day_shorts):
            cd = ws_doc_sab.cell(5, t_col + 1 + d_i, ds)
            cd.fill = SUBHEADER_FILL
            cd.font = BOLD_FONT
            cd.alignment = Alignment(horizontal="center", vertical="center")
            cd.border = THIN_BORDER
        t_col += 7

    for h_idx, h_label in enumerate(TIME_SLOTS):
        row_i = 6 + h_idx
        is_break = "Receso" in h_label
        for t, start_c in t_starts:
            tid = int(t["id"])
            ch = ws_doc_sab.cell(row_i, start_c, "Receso" if is_break else h_label)
            ch.font = Font(size=8, bold=True)
            ch.border = THIN_BORDER
            if is_break:
                ch.fill = BREAK_FILL
            for d_i in range(5):
                cell = ws_doc_sab.cell(row_i, start_c + 1 + d_i)
                cell.border = THIN_BORDER
                cell.alignment = Alignment(horizontal="center", vertical="center")
                if is_break:
                    cell.fill = BREAK_FILL
                    continue
                slot = d_i * SLOTS_PER_DAY + h_idx
                its = sched_by_teacher_slot.get((tid, slot), [])
                blk = blocked_teacher_slot.get((tid, slot))
                if its:
                    codes = [rooms_by_id.get(int(it["room_id"]), {}).get("code") or rooms_by_id.get(int(it["room_id"]), {}).get("name", str(it["room_id"])) for it in its]
                    cell.value = "/".join(codes)
                    cell.fill = class_fill
                    cell.font = Font(size=9, bold=True)
                elif blk:
                    cell.value = blk.get("posgrado_code") or "COMP"
                    cell.fill = posg_fill
                    cell.font = Font(size=9, bold=True, color="6B21A8")
    for _, start_c in t_starts:
        ws_doc_sab.column_dimensions[ws_doc_sab.cell(5, start_c).column_letter].width = 13
        for d_i in range(5):
            ws_doc_sab.column_dimensions[ws_doc_sab.cell(5, start_c + 1 + d_i).column_letter].width = 8
        ws_doc_sab.column_dimensions[ws_doc_sab.cell(5, start_c + 6).column_letter].width = 2

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
            ("  - Asignación de Aula", hv.get("room_assignment", 0)),
            ("  - Límite Diario Docente", hv.get("teacher_daily_limit", 0)),
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
