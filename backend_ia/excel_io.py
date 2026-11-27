import base64
import io
import re
import unicodedata
from collections import defaultdict
import pandas as pd
from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill, Border, Side

from validator import DAYS, TIME_SLOTS, SLOTS_PER_DAY, BREAK_HOURS, TEACHABLE_HOURS, normalize_instance


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


def _norm_txt(s):
    txt = str(s or "").strip()
    txt = "".join(c for c in unicodedata.normalize("NFD", txt) if unicodedata.category(c) != "Mn")
    return " ".join(txt.upper().split())


def _parse_day_idx(raw):
    t = _norm_txt(raw)
    if not t:
        return None
    if t.startswith("LUN") or t == "L":
        return 0
    if t.startswith("MAR"):
        return 1
    if t.startswith("MIE") or t == "MI":
        return 2
    if t.startswith("JUE") or t == "J":
        return 3
    if t.startswith("VIE") or t == "V":
        return 4
    return None


_SLOT_START_MINS = [
    (0, 7 * 60 + 0),
    (1, 7 * 60 + 55),
    (2, 8 * 60 + 50),
    (3, 9 * 60 + 45),
    (5, 11 * 60 + 10),
    (6, 12 * 60 + 5),
    (7, 13 * 60 + 0),
    (9, 14 * 60 + 0),
    (10, 14 * 60 + 55),
    (11, 15 * 60 + 50),
    (12, 16 * 60 + 45),
    (14, 18 * 60 + 0),
    (15, 18 * 60 + 55),
    (16, 19 * 60 + 50),
]


def _parse_hour_idx(raw):
    txt = str(raw or "").strip()
    if not txt or "receso" in txt.lower():
        return None
    m = re.search(r"(\d{1,2})\s*[:.]\s*(\d{2})", txt)
    if not m:
        return None
    mins = int(m.group(1)) * 60 + int(m.group(2))
    best_idx, best_mins = min(_SLOT_START_MINS, key=lambda pair: abs(pair[1] - mins))
    return best_idx if abs(best_mins - mins) <= 20 else None


_TEACHER_ALIASES = {
    "JANETH": "JAMETH",
    "RAMIRO MARTINEZ JARAMILLO": "RAMIRO",
    "MTRO RAMIRO": "RAMIRO",
    "MTRO RAMIRO MARTINEZ JARAMILLO": "RAMIRO",
    "PROFESOR PENDIENTE": "PENDIENTE",
    "DR HECTOR H AVILES ARRIAGA": "AVILES",
    "DR SAID POLANCO MARTAGON": "SAID",
    "DR MARCO A NUNO MAGANDA": "MARCO",
    "DR JORGE A HERNANDEZ ALMAZAN": "JORGE",
    "DR HIRAM HERRERA RIVAS": "HIRAM",
    "DR JOSE FIDENCIO LOPEZ LUNA": "FIDE",
}

_SUBJECT_ALIASES = {
    "BASE DE DATOS EN LA NUBE": "BASES DE DATOS EN LA NUBE",
    "OPTATIVA I": "BASES DE DATOS EN LA NUBE",
    "OPTATIVA I MODELACION DE DATOS EN LA NUBE": "BASES DE DATOS EN LA NUBE",
    "MODELACION DE DATOS EN LA NUBE": "BASES DE DATOS EN LA NUBE",
    "OPTATIVA II": "PROGRAMACION MOVIL AVANZADA",
    "OPTATIVA II PROGRAMACION MOVIL AVANZADA": "PROGRAMACION MOVIL AVANZADA",
    "OPTATIVA II — PROGRAMACION MOVIL AVANZADA": "PROGRAMACION MOVIL AVANZADA",
    "FORMULACION DE PROYECTOS DE TECNOLOGIAS DE LA INFORMACION": "FORMULACION DE PROYECTOS DE TECNOLOGIA",
    "FORMULARIO DE PROYECTOS DE TECNOLOGIA": "FORMULACION DE PROYECTOS DE TECNOLOGIA",
    "FUNDAMENTOS DE INTELIGENCIA ARTIFICIALD": "FUNDAMENTOS DE INTELIGENCIA ARTIFICIAL",
    "DESARROLLO DELPENSAMIENTO Y TOMA DE DECISIONES": "DESARROLLO DEL PENSAMIENTO Y TOMA DE DECISIONES",
    "HABILIDADES PARA APRENDER": "DESARROLLO HABILIDADES PARA APRENDER",
    "GEOMETRIA Y TRIGONOMETRIA": "TRIGONOMETRIA Y GEOMETRIA ANALITICA",
    "GEOMETRIA Y TRIGONOMETRIA COMP IM": "TRIGONOMETRIA Y GEOMETRIA ANALITICA",
}

_OFFICIAL_CURRICULUM_1_8 = [
    (1, "DESARROLLO HUMANO Y VALORES"),
    (1, "FUNDAMENTOS MATEMATICOS"),
    (1, "FUNDAMENTOS DE REDES"),
    (1, "FISICA"),
    (1, "FUNDAMENTOS DE PROGRAMACION"),
    (1, "COMUNICACION Y HABILIDADES DIGITALES"),
    (2, "HABILIDADES SOCIOEMOCIONALES Y MANEJO DE CONFLICTOS"),
    (2, "CALCULO DIFERENCIAL"),
    (2, "CONMUTACION Y ENRUTAMIENTO DE REDES"),
    (2, "PROBABILIDAD Y ESTADISTICA"),
    (2, "PROGRAMACION ESTRUCTURADA"),
    (2, "SISTEMAS OPERATIVOS"),
    (3, "DESARROLLO DEL PENSAMIENTO Y TOMA DE DECISIONES"),
    (3, "CALCULO INTEGRAL"),
    (3, "TOPICOS DE CALIDAD PARA EL DISENO DE SOFTWARE"),
    (3, "BASES DE DATOS"),
    (3, "PROGRAMACION ORIENTADA A OBJETOS"),
    (3, "PROYECTO INTEGRADOR I"),
    (4, "ETICA PROFESIONAL"),
    (4, "CALCULO DE VARIAS VARIABLES"),
    (4, "APLICACIONES WEB"),
    (4, "ESTRUCTURA DE DATOS"),
    (4, "DESARROLLO DE APLICACIONES MOVILES"),
    (4, "ANALISIS Y DISENO DE SOFTWARE"),
    (5, "LIDERAZGO DE EQUIPOS DE ALTO DESEMPENO"),
    (5, "ECUACIONES DIFERENCIALES"),
    (5, "APLICACIONES WEB ORIENTADAS A SERVICIOS"),
    (5, "BASES DE DATOS AVANZADAS"),
    (5, "ESTANDARES Y METRICAS PARA EL DESARROLLO DE SOFTWARE"),
    (5, "PROYECTO INTEGRADOR II"),
    (7, "HABILIDADES GERENCIALES"),
    (7, "FORMULACION DE PROYECTOS DE TECNOLOGIA"),
    (7, "FUNDAMENTOS DE INTELIGENCIA ARTIFICIAL"),
    (7, "ETICA Y LEGISLACION EN TECNOLOGIAS DE LA INFORMACION"),
    (7, "BASES DE DATOS EN LA NUBE"),
    (7, "SEGURIDAD INFORMATICA"),
    (8, "ELECTRONICA DIGITAL"),
    (8, "GESTION DE PROYECTOS DE TECNOLOGIA"),
    (8, "PROGRAMACION PARA INTELIGENCIA ARTIFICIAL"),
    (8, "ADMINISTRACION DE SERVIDORES"),
    (8, "PROGRAMACION MOVIL AVANZADA"),
    (8, "INFORMATICA FORENSE"),
]
_OFFICIAL_Q_BY_SUBJ = {subj: q for q, subj in _OFFICIAL_CURRICULUM_1_8}

_RED_FILLS = {"FFFF9981", "FFFF5353", "FFFF552D", "FFFF9F9F", "FFFF0000", "FFEA9999", "FFE06666"}
_GRAY_FILLS = {"FFC0C0C0", "FFB7B7B7", "FFBFBFBF", "FF969696", "FFD9D9D9"}


def _canon_teacher(raw):
    k = _norm_txt(raw).replace(".", "")
    return _TEACHER_ALIASES.get(k, k)


def _canon_subject(raw):
    k = _norm_txt(raw)
    return _SUBJECT_ALIASES.get(k, k)


def _find_sheet(wb, candidates):
    norm_map = {_norm_txt(n): n for n in wb.sheetnames}
    for cand in candidates:
        nc = _norm_txt(cand)
        if nc in norm_map:
            return wb[norm_map[nc]]
        for k, real_name in norm_map.items():
            if nc in k:
                return wb[real_name]
    return None


def _import_upv_planeacion_excel(wb, filename):
    """Imports official UPV PlaneaciónITIAula workbooks (FormatoDispProfesores, DisponibilidadProfeores, AsignaturasxDocente, Matriz, Franjas inglés)."""
    warnings = []
    sheets = list(wb.sheetnames)

    teacher_display = {}
    teacher_window = {}
    teacher_avail_formato = defaultdict(set)
    teacher_avail_color = defaultdict(set)
    posgrado_blocks_raw = []

    # 1) FormatoDispProfesores (DOCENTE | DIA | HORA) — priority #1
    ws_fmt = _find_sheet(wb, ["FormatoDispProfesores", "FormatoDisp"])
    fmt_rows_count = 0
    if ws_fmt is not None:
        hdr_row, col_doc, col_dia, col_hora = None, None, None, None
        for r in range(1, min(15, ws_fmt.max_row + 1)):
            row_map = {_norm_txt(ws_fmt.cell(r, c).value): c for c in range(1, min(12, ws_fmt.max_column + 1))}
            if "DOCENTE" in row_map and "DIA" in row_map and "HORA" in row_map:
                hdr_row, col_doc, col_dia, col_hora = r, row_map["DOCENTE"], row_map["DIA"], row_map["HORA"]
                break
        if hdr_row is not None:
            for r in range(hdr_row + 1, ws_fmt.max_row + 1):
                raw_doc = ws_fmt.cell(r, col_doc).value
                raw_dia = ws_fmt.cell(r, col_dia).value
                raw_hora = ws_fmt.cell(r, col_hora).value
                if not raw_doc or not raw_dia or not raw_hora:
                    continue
                d_idx = _parse_day_idx(raw_dia)
                h_idx = _parse_hour_idx(raw_hora)
                if d_idx is None or h_idx is None:
                    continue
                ck = _canon_teacher(raw_doc)
                if not ck or len(ck) > 40:
                    continue
                teacher_display.setdefault(ck, str(raw_doc).strip())
                teacher_avail_formato[ck].add((d_idx, h_idx))
                fmt_rows_count += 1

    # 2) DisponibilidadProfeores (fallback colors + Posgrado MI/DC blocks)
    ws_disp = _find_sheet(wb, ["DisponibilidadProfeores", "DisponibilidadProfesores", "Disponibilidad"])
    if ws_disp is not None:
        seen_header_names = {}
        max_top_row = min(20, ws_disp.max_row)
        teacher_cols = []
        for c in range(1, ws_disp.max_column + 1):
            raw_name = ws_disp.cell(1, c).value
            if not raw_name or not str(raw_name).strip():
                continue
            if _norm_txt(ws_disp.cell(3, c).value) != "L":
                continue
            teacher_cols.append((c, str(raw_name).strip(), str(ws_disp.cell(2, c).value or "").strip()))

        has_christan_hdr = any(_canon_teacher(nm) == "CHRISTAN" for _, nm, _ in teacher_cols)
        alejandro_cols = [c for c, nm, _ in teacher_cols if _canon_teacher(nm) == "ALEJANDRO"]

        for c, raw_name, win_str in teacher_cols:
            ck = _canon_teacher(raw_name)
            if ck == "ALEJANDRO" and len(alejandro_cols) >= 2 and c == alejandro_cols[0] and not has_christan_hdr:
                ck = "CHRISTAN"
                raw_name = "Christan"
                warnings.append("En DisponibilidadProfeores se detectó 'Alejandro' duplicado (07:55-10:40); se vinculó automáticamente con Christan.")
            if ck in seen_header_names:
                continue
            seen_header_names[ck] = c
            teacher_display.setdefault(ck, raw_name)
            if win_str:
                teacher_window[ck] = win_str

            for r in range(4, max_top_row + 1):
                hr_val = ws_disp.cell(r, 1).value
                h_idx = _parse_hour_idx(hr_val)
                if h_idx is None:
                    continue
                for d in range(5):
                    cell = ws_disp.cell(r, c + d)
                    val = _norm_txt(cell.value)
                    fg = cell.fill.fgColor.rgb if cell.fill and cell.fill.fgColor else None
                    if val in ("MI", "DC"):
                        posgrado_blocks_raw.append((ck, d, h_idx, val))
                    elif fg in _RED_FILLS:
                        continue
                    elif (fg and fg not in _GRAY_FILLS and fg != "00000000") or val:
                        teacher_avail_color[ck].add((d, h_idx))

    # 3) AsignaturasxDocente (DOCENTE | PRIORIDAD | ASIGNATURA | CUATRIMESTRE)
    ws_asig = _find_sheet(wb, ["AsignaturasxDocente", "Asignaturas por Docente", "Asignaturas"])
    candidates_by_subj = defaultdict(list)
    seen_doc_subj = set()
    if ws_asig is not None:
        hdr_row, col_doc, col_prio, col_asig, col_cuat = None, None, None, None, None
        for r in range(1, min(15, ws_asig.max_row + 1)):
            row_map = {_norm_txt(ws_asig.cell(r, c).value): c for c in range(1, min(12, ws_asig.max_column + 1))}
            if "DOCENTE" in row_map and "ASIGNATURA" in row_map:
                hdr_row = r
                col_doc = row_map["DOCENTE"]
                col_prio = row_map.get("PRIORIDAD")
                col_asig = row_map["ASIGNATURA"]
                col_cuat = row_map.get("CUATRIMESTRE")
                break
        if hdr_row is not None:
            for r in range(hdr_row + 1, ws_asig.max_row + 1):
                raw_doc = ws_asig.cell(r, col_doc).value
                raw_asig = ws_asig.cell(r, col_asig).value
                if not raw_doc or not raw_asig:
                    continue
                raw_prio = ws_asig.cell(r, col_prio).value if col_prio else None
                raw_cuat = ws_asig.cell(r, col_cuat).value if col_cuat else None
                ck_doc = _canon_teacher(raw_doc)
                ck_subj = _canon_subject(raw_asig)
                if not ck_doc or not ck_subj:
                    continue
                if raw_prio is None and raw_cuat is None and "TUTORIA" not in ck_subj:
                    warnings.append(f"Hoja AsignaturasxDocente fila {r}: '{str(raw_doc).strip()} / {str(raw_asig).strip()}' sin prioridad ni cuatrimestre (omitida).")
                    continue
                teacher_display.setdefault(ck_doc, str(raw_doc).strip())
                try:
                    prio_num = int(float(raw_prio)) if raw_prio is not None and str(raw_prio).strip() != "" else 9
                except (TypeError, ValueError):
                    prio_num = 9
                if (ck_doc, ck_subj) not in seen_doc_subj:
                    seen_doc_subj.add((ck_doc, ck_subj))
                    candidates_by_subj[ck_subj].append((prio_num, ck_doc))
                if raw_cuat is not None and ck_subj in _OFFICIAL_Q_BY_SUBJ:
                    try:
                        q_val = int(float(raw_cuat))
                        if q_val != _OFFICIAL_Q_BY_SUBJ[ck_subj]:
                            warnings.append(
                                f"AsignaturasxDocente: '{str(raw_asig).strip()}' ({str(raw_doc).strip()}) marca cuatrimestre {q_val}, oficial {_OFFICIAL_Q_BY_SUBJ[ck_subj]}."
                            )
                    except (TypeError, ValueError):
                        pass

        for ck_subj in candidates_by_subj:
            candidates_by_subj[ck_subj].sort(key=lambda pair: pair[0])

        missing_official = [
            f"{q}° {subj}" for q, subj in _OFFICIAL_CURRICULUM_1_8 if not candidates_by_subj.get(subj)
        ]
        if missing_official:
            warnings.append(
                f"Materias del plan 1°–8° sin docente en AsignaturasxDocente: {', '.join(missing_official)}."
            )

    # 4) Matriz (active groups, courses, weekly hours, and any pre-assigned teachers)
    ws_mat = _find_sheet(wb, ["Matriz", "Planeacion"])
    rooms = []
    raw_courses = []
    matriz_teachers_by_col = {}
    if ws_mat is not None:
        hdr_row, col_hrs, col_alum = None, None, None
        for r in range(1, min(15, ws_mat.max_row + 1)):
            for c in range(1, min(12, ws_mat.max_column + 1)):
                v = _norm_txt(ws_mat.cell(r, c).value)
                if "HORAS X SEMANA" in v or "HORAS POR SEMANA" in v:
                    hdr_row, col_hrs = r, c
                elif "ALUMNOS" in v:
                    col_alum = c
            if hdr_row is not None:
                break

        if hdr_row is not None:
            for c in range(col_hrs + 1, ws_mat.max_column + 1):
                v = ws_mat.cell(hdr_row, c).value
                if not v or not str(v).strip():
                    continue
                vn = _norm_txt(v)
                if vn in ("RESTA", "¿HORARIO?", "HORARIO", "TOTAL"):
                    continue
                ck = _canon_teacher(v)
                if ck:
                    matriz_teachers_by_col[c] = ck
                    teacher_display.setdefault(ck, str(v).strip())

            cur_group = None
            group_seq = {}
            course_id_seq = 1
            for r in range(hdr_row + 1, ws_mat.max_row + 1):
                label = ws_mat.cell(r, 1).value
                if not label or not str(label).strip():
                    continue
                label_str = str(label).strip()
                label_norm = _norm_txt(label_str)
                if label_norm.startswith("HORAS ASIGNADAS") or label_norm.startswith("TOTAL"):
                    continue
                hrs_val = ws_mat.cell(r, col_hrs).value
                has_hrs = False
                hrs_num = 0
                if hrs_val is not None and str(hrs_val).strip() != "":
                    try:
                        hrs_num = int(round(float(hrs_val)))
                        has_hrs = hrs_num > 0
                    except (TypeError, ValueError):
                        has_hrs = False

                if not has_hrs:
                    m_grp = re.search(r"(\d+)\s*[-_]\s*(\d+)", label_str)
                    if "INMER" in label_norm:
                        q_num, g_num = 0, 1
                        gid = 100
                        code = "Inn"
                        shift = "vespertino"
                    elif m_grp:
                        q_num, g_num = int(m_grp.group(1)), int(m_grp.group(2))
                        gid = q_num * 100 + g_num
                        code = f"{q_num}_{g_num}"
                        shift = "vespertino" if q_num == 3 else "matutino"
                    else:
                        continue
                    if gid in group_seq:
                        gid = max(group_seq.values()) + 1
                    group_seq[gid] = gid
                    cur_group = {
                        "id": gid,
                        "code": code,
                        "name": label_str,
                        "cuatrimestre": q_num,
                        "group_num": g_num,
                        "capacity": 35,
                        "group_id": gid,
                        "type": "aula",
                        "shift": shift,
                        "sin_ingles": "SIN INGLES" in label_norm,
                    }
                    rooms.append(cur_group)
                elif cur_group is not None:
                    ck_subj = _canon_subject(label_str)
                    assigned_ck = None
                    for tc, tck in matriz_teachers_by_col.items():
                        val = ws_mat.cell(r, tc).value
                        if val is not None and str(val).strip() != "":
                            try:
                                if float(val) > 0:
                                    assigned_ck = tck
                                    break
                            except (TypeError, ValueError):
                                pass
                    if ck_subj.startswith("INGLES") and assigned_ck is None:
                        continue
                    students_cnt = 32
                    if col_alum is not None:
                        av = ws_mat.cell(r, col_alum).value
                        if av is not None and str(av).strip() != "":
                            try:
                                students_cnt = max(1, int(round(float(av))))
                            except (TypeError, ValueError):
                                pass
                    raw_courses.append({
                        "id": cur_group["id"] * 100 + course_id_seq,
                        "name": label_str,
                        "canon_subj": ck_subj,
                        "group_id": cur_group["id"],
                        "cuatrimestre": cur_group["cuatrimestre"],
                        "weekly_sessions": hrs_num,
                        "students": students_cnt,
                        "assigned_ck": assigned_ck,
                    })
                    course_id_seq += 1

    canon_to_tid = {}
    teachers = []
    for idx, ck in enumerate(sorted(teacher_display.keys()), start=1):
        canon_to_tid[ck] = idx
        slots_set = teacher_avail_formato.get(ck) or teacher_avail_color.get(ck) or set()
        avail_dict = {}
        if slots_set:
            avail_dict = {d: {} for d in DAYS}
            for d_i, h_i in sorted(slots_set):
                if 0 <= d_i < len(DAYS) and 0 <= h_i < len(TIME_SLOTS) and h_i not in BREAK_HOURS:
                    avail_dict[DAYS[d_i]][TIME_SLOTS[h_i]] = True
        teachers.append({
            "id": idx,
            "name": teacher_display[ck],
            "window": teacher_window.get(ck, "FormatoDispProfesores" if ck in teacher_avail_formato else "Disponible"),
            "availability": avail_dict,
        })

    # Precompute each teacher's teachable hours set so unassigned courses only pick shift-compatible candidates
    t_hours_map = {}
    t_cap = {}
    for t in teachers:
        hrs_set = set()
        cnt = 0
        for day_map in (t.get("availability") or {}).values():
            for ts, ok in day_map.items():
                if ok and ts in TIME_SLOTS:
                    cnt += 1
                    hrs_set.add(TIME_SLOTS.index(ts))
        t_hours_map[t["id"]] = hrs_set if hrs_set else set(TEACHABLE_HOURS)
        t_cap[t["id"]] = cnt if cnt > 0 else len(TEACHABLE_HOURS) * 5

    room_by_id = {r["id"]: r for r in rooms}
    t_load = defaultdict(int)
    for rc in raw_courses:
        if rc["assigned_ck"] and rc["assigned_ck"] in canon_to_tid:
            t_load[canon_to_tid[rc["assigned_ck"]]] += rc["weekly_sessions"]

    courses = []
    auto_assigned_cnt = 0
    next_tid = (max((t["id"] for t in teachers), default=0)) + 1
    for rc in raw_courses:
        cand_tids = [canon_to_tid[tck] for _, tck in candidates_by_subj.get(rc["canon_subj"], []) if tck in canon_to_tid]
        titular_tid = canon_to_tid.get(rc["assigned_ck"]) if rc["assigned_ck"] else None

        if titular_tid is None:
            r_obj = room_by_id.get(rc["group_id"], {})
            if r_obj.get("shift") == "vespertino":
                room_hrs = {3, 5, 6, 7, 9, 10, 11, 12} if r_obj.get("cuatrimestre") == 3 else {7, 9, 10, 11, 12}
            else:
                room_hrs = {0, 1, 2, 3, 5, 6, 7, 9}

            chosen = None
            for cand_tid in cand_tids:
                compat_days_hrs = len(t_hours_map.get(cand_tid, set()) & room_hrs) * 5
                if compat_days_hrs >= rc["weekly_sessions"] and (t_cap[cand_tid] - t_load[cand_tid] >= rc["weekly_sessions"]):
                    chosen = cand_tid
                    break

            if chosen is None:
                short_lbl = rc["name"].title()
                if len(short_lbl) > 26:
                    short_lbl = short_lbl[:24].rstrip() + "…"
                placeholder_id = next_tid
                next_tid += 1
                teachers.append({
                    "id": placeholder_id,
                    "name": f"Por Asignar ({short_lbl})",
                    "window": "Disponible",
                    "availability": {},
                })
                t_hours_map[placeholder_id] = set(TEACHABLE_HOURS)
                t_cap[placeholder_id] = len(TEACHABLE_HOURS) * 5
                chosen = placeholder_id
                warnings.append(f"Materia '{rc['name']}' (grupo {rc['group_id']}) sin docente asignado; marcada como 'Por Asignar ({short_lbl})'.")
            else:
                auto_assigned_cnt += 1
            titular_tid = chosen
            t_load[titular_tid] += rc["weekly_sessions"]

        ordered_cands = []
        if titular_tid:
            ordered_cands.append(titular_tid)
        for cid in cand_tids:
            if cid not in ordered_cands:
                ordered_cands.append(cid)

        courses.append({
            "id": rc["id"],
            "name": rc["name"],
            "teacher_id": titular_tid,
            "teacher_ids": ordered_cands,
            "group_id": rc["group_id"],
            "cuatrimestre": rc["cuatrimestre"],
            "weekly_sessions": rc["weekly_sessions"],
            "students": rc["students"],
        })

    # 5) Franjas inglés -> blocked_slots (type=room, is_english=True)
    blocked_slots = []
    room_by_qg = {(r["cuatrimestre"], r["group_num"]): r for r in rooms}
    ws_eng = _find_sheet(wb, ["Franjas ingles", "Franjas inglés", "Ingles"])
    if ws_eng is not None:
        for r in range(1, min(35, ws_eng.max_row + 1)):
            for c in range(1, ws_eng.max_column + 1):
                val = ws_eng.cell(r, c).value
                if not val or not str(val).strip():
                    continue
                vn = _norm_txt(val)
                if not (vn.startswith("ITI") or "INMERSION" in vn):
                    continue
                target_room = None
                if "INMER" in vn:
                    target_room = room_by_qg.get((0, 1))
                else:
                    m_g = re.search(r"(\d+)\s*[-_]\s*(\d+)", vn)
                    if m_g:
                        q_n, g_n = int(m_g.group(1)), int(m_g.group(2))
                        target_room = room_by_qg.get((q_n, g_n))
                        if target_room is None and q_n == 6:
                            target_room = room_by_qg.get((7, g_n))
                if target_room is None or target_room.get("sin_ingles"):
                    continue
                for rr in range(r + 2, min(r + 16, ws_eng.max_row + 1)):
                    h_idx = _parse_hour_idx(ws_eng.cell(rr, c).value)
                    if h_idx is None:
                        continue
                    eng_teacher = None
                    for dc in range(1, 6):
                        tv = ws_eng.cell(rr, c + dc).value
                        if tv and str(tv).strip() and _norm_txt(tv) not in ("L", "M", "MI", "J", "V", "RECESO"):
                            eng_teacher = str(tv).strip()
                            break
                    if eng_teacher:
                        for d_i in range(5):
                            blocked_slots.append({
                                "type": "room",
                                "room_id": target_room["id"],
                                "slot_id": d_i * SLOTS_PER_DAY + h_idx,
                                "is_english": True,
                                "subject": f"INGLÉS {target_room['code']}",
                                "teacher": eng_teacher,
                                "reason": f"INGLÉS — {eng_teacher}",
                            })

    # Add Posgrado (MI / DC) teacher blocks
    for ck, d_i, h_idx, code in posgrado_blocks_raw:
        if ck in canon_to_tid:
            blocked_slots.append({
                "type": "teacher",
                "teacher_id": canon_to_tid[ck],
                "slot_id": d_i * SLOTS_PER_DAY + h_idx,
                "posgrado_code": code,
                "reason": f"Posgrado ({code})",
            })

    teacher_by_id = {t["id"]: t for t in teachers}
    for r in rooms:
        r_courses = [c for c in courses if c["group_id"] == r["id"]]
        needed_evening = False
        for c in r_courses:
            t = teacher_by_id.get(c["teacher_id"], {})
            t_hours = {
                TIME_SLOTS.index(ts)
                for day_map in (t.get("availability") or {}).values()
                for ts, ok in day_map.items()
                if ok and ts in TIME_SLOTS
            }
            if t_hours and t_hours.issubset({9, 10, 11, 12, 14, 15, 16}):
                needed_evening = True
        if r["shift"] == "vespertino":
            r["allowed_hours"] = [3, 5, 6, 7, 9, 10, 11, 12] if r["cuatrimestre"] == 3 else [7, 9, 10, 11, 12]
            extra_order = [6, 14, 15, 16, 5, 3, 2, 1, 0]
        elif needed_evening:
            r["allowed_hours"] = [0, 1, 2, 3, 5, 6, 7, 9, 10, 11, 12]
            extra_order = [14, 15, 16]
        else:
            r["allowed_hours"] = [0, 1, 2, 3, 5, 6, 7, 9]
            extra_order = [10, 11, 12, 14, 15, 16]

        # Ensure the room's allowed hours actually have enough non-blocked slots for its required sessions
        r_req = sum(c["weekly_sessions"] for c in r_courses)
        r_blk_slots = {b["slot_id"] for b in blocked_slots if b.get("type") != "teacher" and b.get("room_id") == r["id"]}
        for cand_h in extra_order:
            avail_slots_cnt = sum(
                1 for d_i in range(5) for h_i in r["allowed_hours"]
                if (d_i * SLOTS_PER_DAY + h_i) not in r_blk_slots
            )
            if avail_slots_cnt >= r_req:
                break
            if cand_h not in r["allowed_hours"]:
                r["allowed_hours"] = sorted(r["allowed_hours"] + [cand_h])

        r.pop("sin_ingles", None)
        r.pop("cuatrimestre", None)
        r.pop("group_num", None)

    src_note = (
        f"FormatoDispProfesores ({fmt_rows_count} filas) + DisponibilidadProfeores"
        if fmt_rows_count > 0
        else "DisponibilidadProfeores"
    )
    instance = {
        "id": "EXCEL",
        "name": f"Planeación UPV Importada ({filename})",
        "description": (
            f"Importado automáticamente desde {filename} ({len(rooms)} grupos, {len(courses)} materias, "
            f"{len(teachers)} docentes vía {src_note}, {len(blocked_slots)} bloqueos Inglés/Posgrado"
            + (f", {auto_assigned_cnt} materias auto-asignadas por prioridad" if auto_assigned_cnt else "")
            + ")."
        ),
        "teachers": teachers,
        "rooms": rooms,
        "courses": courses,
        "constraints": [],
        "blocked_slots": blocked_slots,
        "preferences": [],
    }
    return {"instance": instance, "warnings": warnings, "sheets_found": sheets, "format_detected": "UPV_PLANEACION"}


def import_excel_b64(file_b64, filename="plantilla.xlsx"):
    """Imports Excel using pandas + openpyxl, supporting BOTH official UPV PlaneaciónITIAula and R1 4-sheet template."""
    raw_bytes = base64.b64decode(file_b64)
    wb_probe = load_workbook(io.BytesIO(raw_bytes), data_only=True)
    norm_sheets = {_norm_txt(s) for s in wb_probe.sheetnames}
    is_r1_template = {"DOCENTES", "MATERIAS"}.issubset(norm_sheets)
    is_upv_planeacion = (not is_r1_template) and any(
        any(k in s for k in ("FORMATODISP", "DISPONIBILIDADPROF", "ASIGNATURASXDOC", "MATRIZ", "FRANJAS"))
        for s in norm_sheets
    )
    if is_upv_planeacion:
        return _import_upv_planeacion_excel(wb_probe, filename)

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
