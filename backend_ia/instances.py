import copy
from validator import DAYS, TIME_SLOTS, SLOTS_PER_DAY, BREAK_HOURS, TEACHABLE_HOURS


def _make_avail(day_hours_map):
    avail = {}
    for d in DAYS:
        avail[d] = {}
        for h in day_hours_map.get(d, []):
            if h not in BREAK_HOURS and 0 <= h < len(TIME_SLOTS):
                avail[d][TIME_SLOTS[h]] = True
    return avail


def _all_morning():
    return _make_avail({d: [0, 1, 2, 3, 5, 6, 7] for d in DAYS})


def _all_afternoon():
    return _make_avail({d: [9, 10, 11, 12, 14, 15, 16] for d in DAYS})


def _all_day():
    return _make_avail({d: TEACHABLE_HOURS for d in DAYS})


def get_instance(instance_id):
    if instance_id == "I1":
        return _build_itc2007()
    if instance_id == "I2":
        return _build_itiid_q7()
    if instance_id == "I3":
        return _build_itiid_full()
    if instance_id == "I4":
        return _build_itiid_change()
    return _build_itiid_q7()


def _build_itc2007():
    """I1: Public ITC-2007 Curriculum-Based Timetabling benchmark (compact standard slice)."""
    teachers = [
        {"id": 1, "name": "Prof_T01", "availability": _make_avail({"Lunes": [0,1,2,3,5,6], "Martes": [0,1,2,3,5,6], "Miércoles": [0,1,2,3,5,6], "Jueves": [0,1,2,3], "Viernes": [0,1,2,3]})},
        {"id": 2, "name": "Prof_T02", "availability": _make_avail({"Lunes": [1,2,3,5,6,7], "Martes": [1,2,3,5,6,7], "Miércoles": [1,2,3,5], "Jueves": [1,2,3,5,6,7], "Viernes": [1,2,3]})},
        {"id": 3, "name": "Prof_T03", "availability": _all_morning()},
        {"id": 4, "name": "Prof_T04", "availability": _make_avail({"Lunes": [2,3,5,6,7,9,10], "Martes": [2,3,5,6,7,9], "Miércoles": [2,3,5,6,7], "Jueves": [2,3,5,6,7,9,10], "Viernes": [2,3,5,6]})},
        {"id": 5, "name": "Prof_T05", "availability": _all_day()},
        {"id": 6, "name": "Prof_T06", "availability": _make_avail({"Lunes": [0,1,2,3,5,6,7], "Martes": [0,1,2,3,5,6,7], "Miércoles": [], "Jueves": [0,1,2,3,5,6,7], "Viernes": [0,1,2,3,5]})},
    ]
    rooms = [
        {"id": 101, "name": "ITC-Room-A", "capacity": 40, "group_id": 101, "type": "aula"},
        {"id": 102, "name": "ITC-Room-B", "capacity": 40, "group_id": 102, "type": "lab"},
    ]
    courses = [
        # Curriculum 1 (group 101)
        {"id": 1001, "name": "c0001_Algorithms", "teacher_id": 1, "group_id": 101, "cuatrimestre": 1, "weekly_sessions": 4, "students": 32},
        {"id": 1002, "name": "c0002_DiscreteMath", "teacher_id": 2, "group_id": 101, "cuatrimestre": 1, "weekly_sessions": 4, "students": 32},
        {"id": 1003, "name": "c0004_ComputerArch", "teacher_id": 3, "group_id": 101, "cuatrimestre": 1, "weekly_sessions": 3, "students": 32},
        {"id": 1004, "name": "c0005_OperatingSys", "teacher_id": 4, "group_id": 101, "cuatrimestre": 1, "weekly_sessions": 4, "students": 32},
        {"id": 1005, "name": "c0014_Databases", "teacher_id": 5, "group_id": 101, "cuatrimestre": 1, "weekly_sessions": 3, "students": 32},
        # Curriculum 2 (group 102)
        {"id": 2001, "name": "c0015_AI_Search", "teacher_id": 1, "group_id": 102, "cuatrimestre": 2, "weekly_sessions": 4, "students": 28},
        {"id": 2002, "name": "c0016_Networks", "teacher_id": 2, "group_id": 102, "cuatrimestre": 2, "weekly_sessions": 4, "students": 28},
        {"id": 2003, "name": "c0017_SoftEng", "teacher_id": 6, "group_id": 102, "cuatrimestre": 2, "weekly_sessions": 4, "students": 28},
        {"id": 2004, "name": "c0018_Compilers", "teacher_id": 4, "group_id": 102, "cuatrimestre": 2, "weekly_sessions": 3, "students": 28},
        {"id": 2005, "name": "c0019_Security", "teacher_id": 5, "group_id": 102, "cuatrimestre": 2, "weekly_sessions": 3, "students": 28},
    ]
    preferences = [
        {"teacher_id": 1, "teacher_name": "Prof_T01", "type": "avoid_early", "before_hour": 1, "description": "Evitar primera hora 07:00"},
        {"teacher_id": 5, "teacher_name": "Prof_T05", "type": "prefer_morning", "description": "Preferencia por turno matutino"},
        {"teacher_id": 4, "teacher_name": "Prof_T04", "type": "avoid_day_afternoon", "day": 4, "description": "Evitar viernes por la tarde"},
    ]
    return {
        "id": "I1",
        "name": "I1 — Benchmark Público ITC-2007 (CB-CTT)",
        "description": "Instancia estándar inspirada en ITC-2007 para validar CP-SAT, Genético y Búsqueda Local antes de usar datos ITIID.",
        "teachers": teachers,
        "rooms": rooms,
        "courses": courses,
        "constraints": [],
        "blocked_slots": [],
        "preferences": preferences,
        "manual_schedule": None,
    }


def _build_itiid_q7():
    """I2: 7mo cuatrimestre de ITIID (periodo cerrado) con horario manual de referencia."""
    teachers = [
        {"id": 1, "name": "Docente_01 (Inglés VI)", "real_name": "Alma Delia Amaya", "availability": _make_avail({d: [0,1,2,3,5,6,7] for d in DAYS})},
        {"id": 2, "name": "Docente_02 (Hab. Gerenciales)", "real_name": "Myriam Ornelas", "availability": _make_avail({"Lunes": [1,2,3,5,6], "Martes": [1,2,3,5,6], "Miércoles": [1,2,3,5], "Jueves": [1,2,3,5], "Viernes": [1,2,3]})},
        {"id": 3, "name": "Docente_03 (Formulación Proy.)", "real_name": "José Fidencio", "availability": _make_avail({d: [0,1,2,3,5,6,7,9,10] for d in DAYS})},
        {"id": 4, "name": "Docente_04 (Fund. de IA)", "real_name": "Said P. Martagón", "availability": _make_avail({"Lunes": [0,1,2,3,5,6,7], "Martes": [0,1,2,3,5,6,7], "Miércoles": [0,1,2,3,5,6,7], "Jueves": [0,1,2,3,5,6,7], "Viernes": [0,1,2,3,5]})},
        {"id": 5, "name": "Docente_05 (Ética y Leg.)", "real_name": "Erendia Gutiérrez", "availability": _make_avail({d: [2,3,5,6,7,9] for d in DAYS})},
        {"id": 6, "name": "Docente_06 (Optativa I)", "real_name": "Hiram Herrera R.", "availability": _make_avail({d: [0,1,2,3,5,6,7] for d in DAYS})},
        {"id": 7, "name": "Docente_07 (Seguridad Info.)", "real_name": "Jorge A. Hernández", "availability": _make_avail({d: [1,2,3,5,6,7,9,10] for d in DAYS})},
    ]
    rooms = [
        {"id": 701, "name": "ITIID 7-1 (Aula B-104)", "capacity": 35, "group_id": 701, "type": "aula"},
    ]
    courses = [
        {"id": 37, "name": "Inglés VI", "teacher_id": 1, "group_id": 701, "cuatrimestre": 7, "weekly_sessions": 5, "students": 30},
        {"id": 38, "name": "Habilidades Gerenciales", "teacher_id": 2, "group_id": 701, "cuatrimestre": 7, "weekly_sessions": 4, "students": 30},
        {"id": 39, "name": "Formulación de Proyectos de Tecnología", "teacher_id": 3, "group_id": 701, "cuatrimestre": 7, "weekly_sessions": 4, "students": 30},
        {"id": 40, "name": "Fundamentos de Inteligencia Artificial", "teacher_id": 4, "group_id": 701, "cuatrimestre": 7, "weekly_sessions": 6, "students": 30},
        {"id": 41, "name": "Ética y Legislación en TI", "teacher_id": 5, "group_id": 701, "cuatrimestre": 7, "weekly_sessions": 4, "students": 30},
        {"id": 42, "name": "Optativa I", "teacher_id": 6, "group_id": 701, "cuatrimestre": 7, "weekly_sessions": 6, "students": 30},
        {"id": 43, "name": "Seguridad Informática", "teacher_id": 7, "group_id": 701, "cuatrimestre": 7, "weekly_sessions": 6, "students": 30},
    ]
    preferences = [
        {"teacher_id": 4, "teacher_name": "Docente_04 (Fund. de IA)", "type": "avoid_early", "before_hour": 1, "description": "Evitar clase a las 07:00"},
        {"teacher_id": 2, "teacher_name": "Docente_02 (Hab. Gerenciales)", "type": "avoid_day", "day": 4, "description": "Preferir no dar clase los viernes"},
        {"teacher_id": 7, "teacher_name": "Docente_07 (Seguridad Info.)", "type": "prefer_morning", "description": "Preferencia matutina antes de las 14:00"},
    ]
    # Realistic manual reference schedule (valid hard constraints, but has student gaps & afternoon spillovers)
    manual_schedule = [
        # Inglés VI (5): Mon 0, Tue 0, Wed 0, Thu 0, Fri 0
        {"course_id": 37, "room_id": 701, "start_slot": 0 * 17 + 0},
        {"course_id": 37, "room_id": 701, "start_slot": 1 * 17 + 0},
        {"course_id": 37, "room_id": 701, "start_slot": 2 * 17 + 0},
        {"course_id": 37, "room_id": 701, "start_slot": 3 * 17 + 0},
        {"course_id": 37, "room_id": 701, "start_slot": 4 * 17 + 0},
        # Hab Gerenciales (4): Mon 2, Tue 2, Thu 2, Fri 2 (leaves gap at slot 1 on Mon/Tue/Thu/Fri unless filled)
        {"course_id": 38, "room_id": 701, "start_slot": 0 * 17 + 2},
        {"course_id": 38, "room_id": 701, "start_slot": 1 * 17 + 2},
        {"course_id": 38, "room_id": 701, "start_slot": 3 * 17 + 2},
        {"course_id": 38, "room_id": 701, "start_slot": 4 * 17 + 2},
        # Formulación (4): Mon 9, Tue 9, Wed 9, Thu 9 (leaves big gap between morning and afternoon!)
        {"course_id": 39, "room_id": 701, "start_slot": 0 * 17 + 9},
        {"course_id": 39, "room_id": 701, "start_slot": 1 * 17 + 9},
        {"course_id": 39, "room_id": 701, "start_slot": 2 * 17 + 9},
        {"course_id": 39, "room_id": 701, "start_slot": 3 * 17 + 9},
        # Fundamentos IA (6): Mon 3, Tue 3, Wed 2, Wed 3, Thu 3, Fri 3
        {"course_id": 40, "room_id": 701, "start_slot": 0 * 17 + 3},
        {"course_id": 40, "room_id": 701, "start_slot": 1 * 17 + 3},
        {"course_id": 40, "room_id": 701, "start_slot": 2 * 17 + 2},
        {"course_id": 40, "room_id": 701, "start_slot": 2 * 17 + 3},
        {"course_id": 40, "room_id": 701, "start_slot": 3 * 17 + 3},
        {"course_id": 40, "room_id": 701, "start_slot": 4 * 17 + 3},
        # Ética (4): Mon 6, Tue 6, Wed 6, Thu 6
        {"course_id": 41, "room_id": 701, "start_slot": 0 * 17 + 6},
        {"course_id": 41, "room_id": 701, "start_slot": 1 * 17 + 6},
        {"course_id": 41, "room_id": 701, "start_slot": 2 * 17 + 6},
        {"course_id": 41, "room_id": 701, "start_slot": 3 * 17 + 6},
        # Optativa I (6): Mon 5, Tue 5, Wed 5, Thu 5, Fri 5, Fri 6
        {"course_id": 42, "room_id": 701, "start_slot": 0 * 17 + 5},
        {"course_id": 42, "room_id": 701, "start_slot": 1 * 17 + 5},
        {"course_id": 42, "room_id": 701, "start_slot": 2 * 17 + 5},
        {"course_id": 42, "room_id": 701, "start_slot": 3 * 17 + 5},
        {"course_id": 42, "room_id": 701, "start_slot": 4 * 17 + 5},
        {"course_id": 42, "room_id": 701, "start_slot": 4 * 17 + 6},
        # Seguridad Info (6): Mon 7, Tue 7, Wed 7, Thu 7, Fri 7, Mon 10
        {"course_id": 43, "room_id": 701, "start_slot": 0 * 17 + 7},
        {"course_id": 43, "room_id": 701, "start_slot": 1 * 17 + 7},
        {"course_id": 43, "room_id": 701, "start_slot": 2 * 17 + 7},
        {"course_id": 43, "room_id": 701, "start_slot": 3 * 17 + 7},
        {"course_id": 43, "room_id": 701, "start_slot": 4 * 17 + 7},
        {"course_id": 43, "room_id": 701, "start_slot": 0 * 17 + 10},
    ]
    return {
        "id": "I2",
        "name": "I2 — ITIID 7.º Cuatrimestre (Periodo Cerrado + Referencia Manual)",
        "description": "Caso de 1 cuatrimestre de ITIID (7 materias, 35 sesiones/semana) con horario manual de coordinación para comparar calidad.",
        "teachers": teachers,
        "rooms": rooms,
        "courses": courses,
        "constraints": [],
        "blocked_slots": [],
        "preferences": preferences,
        "manual_schedule": manual_schedule,
    }


def _build_itiid_full():
    """I3: Multi-cuatrimestre completo ITIID (1°, 4°, 7°, 9°) con recursos compartidos bloqueados."""
    teachers = [
        {"id": 1, "name": "Docente_01 (Inglés)", "availability": _all_day()},
        {"id": 2, "name": "Docente_02 (Valores/Ética)", "availability": _all_morning()},
        {"id": 3, "name": "Docente_03 (Matemáticas)", "availability": _all_day()},
        {"id": 4, "name": "Docente_04 (Redes/Seguridad)", "availability": _all_day()},
        {"id": 5, "name": "Docente_05 (Programación/ED)", "availability": _all_day()},
        {"id": 6, "name": "Docente_06 (IA/Ciencia Datos)", "availability": _make_avail({d: [0,1,2,3,5,6,7,9,10,11] for d in DAYS})},
        {"id": 7, "name": "Docente_07 (Web/Móviles)", "availability": _all_day()},
        {"id": 8, "name": "Docente_08 (Proyectos/Gestión)", "availability": _make_avail({d: [1,2,3,5,6,7,9,10] for d in DAYS})},
        {"id": 9, "name": "Docente_09 (Física/IoT)", "availability": _all_day()},
        {"id": 10, "name": "Docente_10 (Inglés II)", "availability": _all_day()},
    ]
    rooms = [
        {"id": 101, "name": "ITIID 1-1 (Aula A-101)", "capacity": 35, "group_id": 101, "type": "aula"},
        {"id": 401, "name": "ITIID 4-1 (Lab C-201)", "capacity": 35, "group_id": 401, "type": "lab"},
        {"id": 701, "name": "ITIID 7-1 (Lab IA-301)", "capacity": 35, "group_id": 701, "type": "lab"},
        {"id": 901, "name": "ITIID 9-1 (Aula B-205)", "capacity": 35, "group_id": 901, "type": "aula"},
    ]
    courses = [
        # 1er Cuatrimestre (101)
        {"id": 1, "name": "Inglés I", "teacher_id": 1, "group_id": 101, "cuatrimestre": 1, "weekly_sessions": 5, "students": 34},
        {"id": 2, "name": "Desarrollo Humano y Valores", "teacher_id": 2, "group_id": 101, "cuatrimestre": 1, "weekly_sessions": 4, "students": 34},
        {"id": 3, "name": "Fundamentos Matemáticos", "teacher_id": 3, "group_id": 101, "cuatrimestre": 1, "weekly_sessions": 6, "students": 34},
        {"id": 4, "name": "Fundamentos de Redes", "teacher_id": 4, "group_id": 101, "cuatrimestre": 1, "weekly_sessions": 4, "students": 34},
        {"id": 5, "name": "Física", "teacher_id": 9, "group_id": 101, "cuatrimestre": 1, "weekly_sessions": 5, "students": 34},
        {"id": 6, "name": "Fundamentos de Programación", "teacher_id": 5, "group_id": 101, "cuatrimestre": 1, "weekly_sessions": 5, "students": 34},
        # 4to Cuatrimestre (401)
        {"id": 22, "name": "Inglés IV", "teacher_id": 10, "group_id": 401, "cuatrimestre": 4, "weekly_sessions": 5, "students": 30},
        {"id": 23, "name": "Ética Profesional", "teacher_id": 2, "group_id": 401, "cuatrimestre": 4, "weekly_sessions": 4, "students": 30},
        {"id": 24, "name": "Cálculo de Varias Variables", "teacher_id": 3, "group_id": 401, "cuatrimestre": 4, "weekly_sessions": 5, "students": 30},
        {"id": 25, "name": "Aplicaciones Web", "teacher_id": 7, "group_id": 401, "cuatrimestre": 4, "weekly_sessions": 5, "students": 30},
        {"id": 26, "name": "Estructura de Datos", "teacher_id": 5, "group_id": 401, "cuatrimestre": 4, "weekly_sessions": 5, "students": 30},
        {"id": 27, "name": "Desarrollo de Apps Móviles", "teacher_id": 7, "group_id": 401, "cuatrimestre": 4, "weekly_sessions": 5, "students": 30},
        # 7mo Cuatrimestre (701)
        {"id": 37, "name": "Inglés VI", "teacher_id": 1, "group_id": 701, "cuatrimestre": 7, "weekly_sessions": 5, "students": 28},
        {"id": 39, "name": "Formulación de Proyectos", "teacher_id": 8, "group_id": 701, "cuatrimestre": 7, "weekly_sessions": 4, "students": 28},
        {"id": 40, "name": "Fundamentos de IA", "teacher_id": 6, "group_id": 701, "cuatrimestre": 7, "weekly_sessions": 6, "students": 28},
        {"id": 41, "name": "Ética y Legislación TI", "teacher_id": 2, "group_id": 701, "cuatrimestre": 7, "weekly_sessions": 4, "students": 28},
        {"id": 42, "name": "Optativa I", "teacher_id": 5, "group_id": 701, "cuatrimestre": 7, "weekly_sessions": 5, "students": 28},
        {"id": 43, "name": "Seguridad Informática", "teacher_id": 4, "group_id": 701, "cuatrimestre": 7, "weekly_sessions": 5, "students": 28},
        # 9no Cuatrimestre (901)
        {"id": 51, "name": "Inglés VIII", "teacher_id": 10, "group_id": 901, "cuatrimestre": 9, "weekly_sessions": 5, "students": 25},
        {"id": 52, "name": "Internet de las Cosas", "teacher_id": 9, "group_id": 901, "cuatrimestre": 9, "weekly_sessions": 5, "students": 25},
        {"id": 53, "name": "Evaluación de Proyectos", "teacher_id": 8, "group_id": 901, "cuatrimestre": 9, "weekly_sessions": 4, "students": 25},
        {"id": 54, "name": "Ciencia de Datos", "teacher_id": 6, "group_id": 901, "cuatrimestre": 9, "weekly_sessions": 6, "students": 25},
        {"id": 55, "name": "Tecnologías Disruptivas", "teacher_id": 7, "group_id": 901, "cuatrimestre": 9, "weekly_sessions": 5, "students": 25},
        {"id": 57, "name": "Proyecto Integrador III", "teacher_id": 8, "group_id": 901, "cuatrimestre": 9, "weekly_sessions": 4, "students": 25},
    ]
    # Shared resources occupied by OTHER programs (ISA, IM, PyMES)
    blocked_slots = [
        {"type": "room", "room_id": 401, "slot_id": 0 * 17 + 0, "reason": "Lab C-201 ocupado por Mecatrónica (Lun 07:00)"},
        {"type": "room", "room_id": 401, "slot_id": 2 * 17 + 0, "reason": "Lab C-201 ocupado por Mecatrónica (Mié 07:00)"},
        {"type": "room", "room_id": 701, "slot_id": 1 * 17 + 5, "reason": "Lab IA-301 ocupado por ISA (Mar 11:10)"},
        {"type": "room", "room_id": 701, "slot_id": 3 * 17 + 5, "reason": "Lab IA-301 ocupado por ISA (Jue 11:10)"},
        {"type": "teacher", "teacher_id": 1, "slot_id": 4 * 17 + 9, "reason": "Docente_01 en clase de Inglés de PyMES (Vie 14:00)"},
        {"type": "teacher", "teacher_id": 3, "slot_id": 0 * 17 + 9, "reason": "Docente_03 en Álgebra de Manufactura (Lun 14:00)"},
    ]
    preferences = [
        {"teacher_id": 6, "teacher_name": "Docente_06 (IA/Ciencia Datos)", "type": "avoid_early", "before_hour": 1, "description": "Evitar 07:00"},
        {"teacher_id": 8, "teacher_name": "Docente_08 (Proyectos/Gestión)", "type": "avoid_day_afternoon", "day": 4, "description": "Evitar viernes por la tarde"},
        {"teacher_id": 5, "teacher_name": "Docente_05 (Programación/ED)", "type": "prefer_morning", "description": "Preferencia matutina"},
    ]
    return {
        "id": "I3",
        "name": "I3 — Programa Completo ITIID + Recursos Compartidos Bloqueados",
        "description": "Cuatrimestres 1°, 4°, 7° y 9° (24 materias, 116 sesiones/semana) con aulas y docentes compartidos bloqueados por otros programas.",
        "teachers": teachers,
        "rooms": rooms,
        "courses": courses,
        "constraints": [],
        "blocked_slots": blocked_slots,
        "preferences": preferences,
        "manual_schedule": None,
    }


def _build_itiid_change():
    """I4: Escenario de cambio - El docente A (Docente_04 Fund. IA) ya no puede los miércoles."""
    base = _build_itiid_q7()
    base["id"] = "I4"
    base["name"] = "I4 — Escenario de Cambio (Docente_04 sin disponibilidad miércoles)"
    base["description"] = "Parte del horario de I2 y bloquea todos los miércoles para Docente_04 (Fund. de IA). Evalúa reprogramación con mínima perturbación (Estabilidad)."
    base["change_request"] = "El docente Docente_04 (Fund. de IA) ya no puede impartir clases los miércoles."
    base["change_teacher_id"] = 4
    base["change_day"] = 2  # Miércoles
    return base


def anonymize_instance(raw):
    """Replaces personal teacher names and room names with neutral IDs before sending to external LLMs."""
    anon = copy.deepcopy(raw)
    t_map = {}
    for idx, t in enumerate(anon.get("teachers", []), start=1):
        old_name = t.get("name", f"Docente_{idx:02d}")
        new_name = f"Docente_{idx:02d}"
        t_map[old_name] = new_name
        t["name"] = new_name
        t.pop("real_name", None)
    r_map = {}
    for idx, r in enumerate(anon.get("rooms", []), start=1):
        old_name = r.get("name", f"Aula_{idx:02d}")
        new_name = f"Aula_{idx:02d}"
        r_map[old_name] = new_name
        r["name"] = new_name
    for p in anon.get("preferences", []):
        if p.get("teacher_name") in t_map:
            p["teacher_name"] = t_map[p["teacher_name"]]
    return anon, {"teachers": t_map, "rooms": r_map}
