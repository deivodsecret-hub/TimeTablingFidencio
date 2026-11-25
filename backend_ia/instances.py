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
    if instance_id == "ITIID_2026":
        return _build_itiid_sep_dic_2026()
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


def _build_itiid_sep_dic_2026():
    """Official ITIID Sep-Dic 2026 dataset matching the user's UPV Excel workbook (10 groups, 25 teachers, English bands & MI/DC blocks)."""
    def _hours(h_list):
        return _make_avail({d: h_list for d in DAYS})

    teachers = [
        # Profesores de Tiempo Completo (FTC)
        {"id": 1, "name": "Avilés", "window": "08:00 - 16:00", "type": "FTC", "availability": _hours([1, 2, 3, 5, 6, 7, 9, 10])},
        {"id": 2, "name": "Said", "window": "07:00 - 15:00", "type": "FTC", "availability": _hours([0, 1, 2, 3, 5, 6, 7, 9, 10])},
        {"id": 3, "name": "Marco", "window": "07:50 - 15:50", "type": "FTC", "availability": _hours([1, 2, 3, 5, 6, 7, 9, 10])},
        {"id": 4, "name": "Jorge", "window": "08:50 - 17:00", "type": "FTC", "availability": _hours([2, 3, 5, 6, 7, 9, 10, 11])},
        {"id": 5, "name": "Hiram", "window": "09:30 - 17:30", "type": "FTC", "availability": _hours([2, 3, 5, 6, 7, 9, 10, 11, 12])},
        {"id": 6, "name": "Fide", "window": "07:00 - 15:00", "type": "FTC", "availability": _hours([0, 1, 2, 3, 5, 6, 7, 9])},
        # Profesores de Asignatura
        {"id": 7, "name": "Humberto", "window": "07:00 - 08:50", "type": "PA", "availability": _hours([0, 1])},
        {"id": 8, "name": "Israel", "window": "07:00 - 08:50", "type": "PA", "availability": _hours([0, 1])},
        {"id": 9, "name": "Mascorro", "window": "07:00 - 08:50", "type": "PA", "availability": _hours([0, 1])},
        {"id": 10, "name": "Roberto", "window": "07:00 - 10:40", "type": "PA", "availability": _hours([0, 1, 2, 3])},
        {"id": 11, "name": "Ernesto", "window": "Variado", "type": "PA", "availability": _hours([0, 1, 2, 3, 5, 6, 7, 9, 10, 11, 12])},
        {"id": 12, "name": "Diego", "window": "09:45 - 15:00", "type": "PA", "availability": _hours([3, 5, 6, 7, 9])},
        {"id": 13, "name": "Christan", "window": "07:55 - 14:00", "type": "PA", "availability": _hours([1, 2, 3, 5, 6, 7])},
        {"id": 14, "name": "Alberto", "window": "08:50 - 14:00", "type": "PA", "availability": _hours([2, 3, 5, 6, 7])},
        {"id": 15, "name": "Gloria", "window": "07:00 - 08:50", "type": "PA", "availability": _hours([0, 1])},
        {"id": 16, "name": "Lidia", "window": "07:00 - 08:50", "type": "PA", "availability": _hours([0, 1])},
        {"id": 17, "name": "Hugo", "window": "07:00 - 15:00", "type": "PA", "availability": _hours([0, 1, 2, 3, 5, 6, 7, 9])},
        {"id": 18, "name": "Emanuel", "window": "08:00 - 16:00", "type": "PA", "availability": _hours([1, 2, 3, 5, 6, 7, 9, 10])},
        {"id": 19, "name": "Alejandro", "window": "11:10 - 14:00", "type": "PA", "availability": _hours([5, 6, 7])},
        {"id": 20, "name": "Jameth", "window": "07:00 - 10:40", "type": "PA", "availability": _hours([0, 1, 2, 3])},
        {"id": 21, "name": "GERARDO", "window": "08:50 - 12:05", "type": "PA", "availability": _hours([2, 3, 5])},
        {"id": 22, "name": "IRIS", "window": "07:00 - 10:40", "type": "PA", "availability": _hours([0, 1, 2, 3])},
        {"id": 23, "name": "Pendiente", "window": "08:50 - 15:00", "type": "PA", "availability": _hours([2, 3, 5, 6, 7, 9])},
        {"id": 24, "name": "Ramiro", "window": "14:00 - 17:40", "type": "PA", "availability": _hours([9, 10, 11, 12])},
        {"id": 25, "name": "Badillo (Comp. IM)", "window": "14:00 - 17:40", "type": "PA", "availability": _hours([9, 10, 11, 12])},
    ]

    rooms = [
        {"id": 100, "code": "Inn", "name": "ITIID Inmersión", "capacity": 35, "group_id": 100, "type": "aula"},
        {"id": 101, "code": "1_1", "name": "ITIID 1-1 (sin inglés)", "capacity": 35, "group_id": 101, "type": "aula"},
        {"id": 102, "code": "1_2", "name": "ITIID 1-2", "capacity": 35, "group_id": 102, "type": "aula"},
        {"id": 103, "code": "1_3", "name": "ITIID 1-3", "capacity": 35, "group_id": 103, "type": "aula"},
        {"id": 301, "code": "3_1", "name": "ITIID 3-1", "capacity": 35, "group_id": 301, "type": "aula"},
        {"id": 401, "code": "4_1", "name": "ITIID 4-1 (sin inglés)", "capacity": 32, "group_id": 401, "type": "aula"},
        {"id": 402, "code": "4_2", "name": "ITIID 4-2", "capacity": 32, "group_id": 402, "type": "aula"},
        {"id": 403, "code": "4_3", "name": "ITIID 4-3", "capacity": 34, "group_id": 403, "type": "aula"},
        {"id": 701, "code": "7_1", "name": "ITIID 7-1", "capacity": 32, "group_id": 701, "type": "aula"},
        {"id": 702, "code": "7_2", "name": "ITIID 7-2", "capacity": 32, "group_id": 702, "type": "aula"},
    ]

    courses = [
        # Inmersión (100)
        {"id": 1001, "name": "ALGORITMOS Y PROGRAMACIÓN", "teacher_id": 4, "group_id": 100, "cuatrimestre": 0, "weekly_sessions": 5, "students": 30},
        {"id": 1002, "name": "DESARROLLO HABILIDADES PARA APRENDER", "teacher_id": 11, "group_id": 100, "cuatrimestre": 0, "weekly_sessions": 4, "students": 30},
        {"id": 1003, "name": "TUTORÍA", "teacher_id": 11, "group_id": 100, "cuatrimestre": 0, "weekly_sessions": 1, "students": 30},
        {"id": 1004, "name": "GEOMETRÍA Y TRIGONOMETRÍA (COMP. IM)", "teacher_id": 25, "group_id": 100, "cuatrimestre": 0, "weekly_sessions": 5, "students": 30},
        {"id": 1005, "name": "ARITMÉTICA Y ÁLGEBRA", "teacher_id": 24, "group_id": 100, "cuatrimestre": 0, "weekly_sessions": 5, "students": 30},
        # ITIID 1-1 (101)
        {"id": 1101, "name": "DESARROLLO HUMANO Y VALORES", "teacher_id": 19, "group_id": 101, "cuatrimestre": 1, "weekly_sessions": 4, "students": 32},
        {"id": 1102, "name": "FUNDAMENTOS MATEMÁTICOS", "teacher_id": 13, "group_id": 101, "cuatrimestre": 1, "weekly_sessions": 7, "students": 32},
        {"id": 1103, "name": "FUNDAMENTOS DE REDES", "teacher_id": 5, "group_id": 101, "cuatrimestre": 1, "weekly_sessions": 4, "students": 32},
        {"id": 1104, "name": "FÍSICA", "teacher_id": 9, "group_id": 101, "cuatrimestre": 1, "weekly_sessions": 6, "students": 32},
        {"id": 1105, "name": "FUNDAMENTOS DE PROGRAMACIÓN", "teacher_id": 16, "group_id": 101, "cuatrimestre": 1, "weekly_sessions": 4, "students": 32},
        {"id": 1106, "name": "COMUNICACIÓN Y HABILIDADES DIGITALES", "teacher_id": 11, "group_id": 101, "cuatrimestre": 1, "weekly_sessions": 5, "students": 32},
        {"id": 1107, "name": "TUTORÍA", "teacher_id": 13, "group_id": 101, "cuatrimestre": 1, "weekly_sessions": 1, "students": 32},
        # ITIID 1-2 (102)
        {"id": 1201, "name": "DESARROLLO HUMANO Y VALORES", "teacher_id": 23, "group_id": 102, "cuatrimestre": 1, "weekly_sessions": 4, "students": 32},
        {"id": 1202, "name": "FUNDAMENTOS MATEMÁTICOS", "teacher_id": 13, "group_id": 102, "cuatrimestre": 1, "weekly_sessions": 7, "students": 32},
        {"id": 1203, "name": "FUNDAMENTOS DE REDES", "teacher_id": 8, "group_id": 102, "cuatrimestre": 1, "weekly_sessions": 4, "students": 32},
        {"id": 1204, "name": "FÍSICA", "teacher_id": 18, "group_id": 102, "cuatrimestre": 1, "weekly_sessions": 6, "students": 32},
        {"id": 1205, "name": "FUNDAMENTOS DE PROGRAMACIÓN", "teacher_id": 10, "group_id": 102, "cuatrimestre": 1, "weekly_sessions": 4, "students": 32},
        {"id": 1206, "name": "COMUNICACIÓN Y HABILIDADES DIGITALES", "teacher_id": 1, "group_id": 102, "cuatrimestre": 1, "weekly_sessions": 5, "students": 32},
        {"id": 1207, "name": "TUTORÍA", "teacher_id": 1, "group_id": 102, "cuatrimestre": 1, "weekly_sessions": 1, "students": 32},
        # ITIID 1-3 (103)
        {"id": 1301, "name": "DESARROLLO HUMANO Y VALORES", "teacher_id": 19, "group_id": 103, "cuatrimestre": 1, "weekly_sessions": 4, "students": 32},
        {"id": 1302, "name": "FUNDAMENTOS MATEMÁTICOS", "teacher_id": 13, "group_id": 103, "cuatrimestre": 1, "weekly_sessions": 7, "students": 32},
        {"id": 1303, "name": "FUNDAMENTOS DE REDES", "teacher_id": 5, "group_id": 103, "cuatrimestre": 1, "weekly_sessions": 4, "students": 32},
        {"id": 1304, "name": "FÍSICA", "teacher_id": 18, "group_id": 103, "cuatrimestre": 1, "weekly_sessions": 6, "students": 32},
        {"id": 1305, "name": "FUNDAMENTOS DE PROGRAMACIÓN", "teacher_id": 9, "group_id": 103, "cuatrimestre": 1, "weekly_sessions": 4, "students": 32},
        {"id": 1306, "name": "COMUNICACIÓN Y HABILIDADES DIGITALES", "teacher_id": 1, "group_id": 103, "cuatrimestre": 1, "weekly_sessions": 5, "students": 32},
        {"id": 1307, "name": "TUTORÍA", "teacher_id": 5, "group_id": 103, "cuatrimestre": 1, "weekly_sessions": 1, "students": 32},
        # ITIID 3-1 (301)
        {"id": 3101, "name": "DESARROLLO DEL PENSAMIENTO Y TOMA DE DECISIONES", "teacher_id": 21, "group_id": 301, "cuatrimestre": 3, "weekly_sessions": 4, "students": 30},
        {"id": 3102, "name": "CÁLCULO INTEGRAL", "teacher_id": 18, "group_id": 301, "cuatrimestre": 3, "weekly_sessions": 4, "students": 30},
        {"id": 3103, "name": "TÓPICOS DE CALIDAD PARA EL DISEÑO DE SOFTWARE", "teacher_id": 11, "group_id": 301, "cuatrimestre": 3, "weekly_sessions": 6, "students": 30},
        {"id": 3104, "name": "BASES DE DATOS", "teacher_id": 17, "group_id": 301, "cuatrimestre": 3, "weekly_sessions": 5, "students": 30},
        {"id": 3105, "name": "PROGRAMACIÓN ORIENTADA A OBJETOS", "teacher_id": 2, "group_id": 301, "cuatrimestre": 3, "weekly_sessions": 7, "students": 30},
        {"id": 3106, "name": "PROYECTO INTEGRADOR I", "teacher_id": 1, "group_id": 301, "cuatrimestre": 3, "weekly_sessions": 4, "students": 30},
        {"id": 3107, "name": "TUTORÍA", "teacher_id": 2, "group_id": 301, "cuatrimestre": 3, "weekly_sessions": 1, "students": 30},
        # ITIID 4-1 (401)
        {"id": 4101, "name": "ÉTICA PROFESIONAL", "teacher_id": 19, "group_id": 401, "cuatrimestre": 4, "weekly_sessions": 4, "students": 32},
        {"id": 4102, "name": "CÁLCULO DE VARIAS VARIABLES", "teacher_id": 18, "group_id": 401, "cuatrimestre": 4, "weekly_sessions": 5, "students": 32},
        {"id": 4103, "name": "APLICACIONES WEB", "teacher_id": 14, "group_id": 401, "cuatrimestre": 4, "weekly_sessions": 5, "students": 32},
        {"id": 4104, "name": "ESTRUCTURA DE DATOS", "teacher_id": 12, "group_id": 401, "cuatrimestre": 4, "weekly_sessions": 5, "students": 32},
        {"id": 4105, "name": "DESARROLLO DE APLICACIONES MÓVILES", "teacher_id": 17, "group_id": 401, "cuatrimestre": 4, "weekly_sessions": 6, "students": 32},
        {"id": 4106, "name": "ANÁLISIS Y DISEÑO DE SOFTWARE", "teacher_id": 10, "group_id": 401, "cuatrimestre": 4, "weekly_sessions": 5, "students": 32},
        {"id": 4107, "name": "TUTORÍA", "teacher_id": 18, "group_id": 401, "cuatrimestre": 4, "weekly_sessions": 1, "students": 32},
        # ITIID 4-2 (402)
        {"id": 4201, "name": "ÉTICA PROFESIONAL", "teacher_id": 20, "group_id": 402, "cuatrimestre": 4, "weekly_sessions": 4, "students": 32},
        {"id": 4202, "name": "CÁLCULO DE VARIAS VARIABLES", "teacher_id": 15, "group_id": 402, "cuatrimestre": 4, "weekly_sessions": 5, "students": 32},
        {"id": 4203, "name": "APLICACIONES WEB", "teacher_id": 7, "group_id": 402, "cuatrimestre": 4, "weekly_sessions": 5, "students": 32},
        {"id": 4204, "name": "ESTRUCTURA DE DATOS", "teacher_id": 14, "group_id": 402, "cuatrimestre": 4, "weekly_sessions": 5, "students": 32},
        {"id": 4205, "name": "DESARROLLO DE APLICACIONES MÓVILES", "teacher_id": 3, "group_id": 402, "cuatrimestre": 4, "weekly_sessions": 6, "students": 32},
        {"id": 4206, "name": "ANÁLISIS Y DISEÑO DE SOFTWARE", "teacher_id": 12, "group_id": 402, "cuatrimestre": 4, "weekly_sessions": 5, "students": 32},
        {"id": 4207, "name": "TUTORÍA", "teacher_id": 3, "group_id": 402, "cuatrimestre": 4, "weekly_sessions": 1, "students": 32},
        # ITIID 4-3 (403)
        {"id": 4301, "name": "ÉTICA PROFESIONAL", "teacher_id": 23, "group_id": 403, "cuatrimestre": 4, "weekly_sessions": 4, "students": 34},
        {"id": 4302, "name": "CÁLCULO DE VARIAS VARIABLES", "teacher_id": 15, "group_id": 403, "cuatrimestre": 4, "weekly_sessions": 5, "students": 34},
        {"id": 4303, "name": "APLICACIONES WEB", "teacher_id": 7, "group_id": 403, "cuatrimestre": 4, "weekly_sessions": 5, "students": 34},
        {"id": 4304, "name": "ESTRUCTURA DE DATOS", "teacher_id": 14, "group_id": 403, "cuatrimestre": 4, "weekly_sessions": 5, "students": 34},
        {"id": 4305, "name": "DESARROLLO DE APLICACIONES MÓVILES", "teacher_id": 3, "group_id": 403, "cuatrimestre": 4, "weekly_sessions": 6, "students": 34},
        {"id": 4306, "name": "ANÁLISIS Y DISEÑO DE SOFTWARE", "teacher_id": 12, "group_id": 403, "cuatrimestre": 4, "weekly_sessions": 5, "students": 34},
        {"id": 4307, "name": "TUTORÍA", "teacher_id": 23, "group_id": 403, "cuatrimestre": 4, "weekly_sessions": 1, "students": 34},
        # ITIID 7-1 (701)
        {"id": 7101, "name": "HABILIDADES GERENCIALES", "teacher_id": 20, "group_id": 701, "cuatrimestre": 7, "weekly_sessions": 4, "students": 32},
        {"id": 7102, "name": "FORMULACIÓN DE PROYECTOS DE TECNOLOGÍA", "teacher_id": 4, "group_id": 701, "cuatrimestre": 7, "weekly_sessions": 4, "students": 32},
        {"id": 7103, "name": "FUNDAMENTOS DE INTELIGENCIA ARTIFICIAL", "teacher_id": 2, "group_id": 701, "cuatrimestre": 7, "weekly_sessions": 6, "students": 32},
        {"id": 7104, "name": "ÉTICA Y LEGISLACIÓN EN TI", "teacher_id": 1, "group_id": 701, "cuatrimestre": 7, "weekly_sessions": 4, "students": 32},
        {"id": 7105, "name": "BASES DE DATOS EN LA NUBE", "teacher_id": 14, "group_id": 701, "cuatrimestre": 7, "weekly_sessions": 6, "students": 32},
        {"id": 7106, "name": "SEGURIDAD INFORMÁTICA", "teacher_id": 8, "group_id": 701, "cuatrimestre": 7, "weekly_sessions": 6, "students": 32},
        {"id": 7107, "name": "TUTORÍA", "teacher_id": 4, "group_id": 701, "cuatrimestre": 7, "weekly_sessions": 1, "students": 32},
        # ITIID 7-2 (702)
        {"id": 7201, "name": "HABILIDADES GERENCIALES", "teacher_id": 22, "group_id": 702, "cuatrimestre": 7, "weekly_sessions": 4, "students": 32},
        {"id": 7202, "name": "FORMULACIÓN DE PROYECTOS DE TECNOLOGÍA", "teacher_id": 4, "group_id": 702, "cuatrimestre": 7, "weekly_sessions": 4, "students": 32},
        {"id": 7203, "name": "FUNDAMENTOS DE INTELIGENCIA ARTIFICIAL", "teacher_id": 6, "group_id": 702, "cuatrimestre": 7, "weekly_sessions": 6, "students": 32},
        {"id": 7204, "name": "ÉTICA Y LEGISLACIÓN EN TI", "teacher_id": 16, "group_id": 702, "cuatrimestre": 7, "weekly_sessions": 4, "students": 32},
        {"id": 7205, "name": "BASES DE DATOS EN LA NUBE", "teacher_id": 10, "group_id": 702, "cuatrimestre": 7, "weekly_sessions": 6, "students": 32},
        {"id": 7206, "name": "SEGURIDAD INFORMÁTICA", "teacher_id": 5, "group_id": 702, "cuatrimestre": 7, "weekly_sessions": 6, "students": 32},
        {"id": 7207, "name": "TUTORÍA", "teacher_id": 10, "group_id": 702, "cuatrimestre": 7, "weekly_sessions": 1, "students": 32},
    ]

    # Fixed English bands (Hoja 1: FRANJAS DE INGLÉS SEP DIC 2026) + Shared Posgrado MI/DC (Hoja 4)
    blocked_slots = []
    english_bands = [
        (100, 7, "INGLÉS Inm", "Jonathan"),
        (102, 1, "INGLÉS I", "Carlos"),
        (103, 1, "INGLÉS I", "Mtro. Miguel"),
        (301, 11, "INGLÉS III (Comp. ISA)", "Mtra. Ericka"),
        (401, 2, "INGLÉS IV", "Prado"),
        (402, 2, "INGLÉS IV", "Miguel"),
        (701, 3, "INGLÉS VI", "Claudia"),
        (702, 3, "INGLÉS VI", "Pablo"),
    ]
    for rid, hour_idx, subj, eng_teacher in english_bands:
        for d in range(5):
            blocked_slots.append({
                "type": "room",
                "room_id": rid,
                "slot_id": d * SLOTS_PER_DAY + hour_idx,
                "is_english": True,
                "subject": subj,
                "teacher": eng_teacher,
                "reason": f"{subj} — {eng_teacher}",
            })

    # Posgrado shared teacher blocks (Hoja 4: MI = Maestría, DC = Doctorado)
    posgrado_blocks = [
        # Jorge: MI Lun-Jue 9:45-10:40 (hour 3)
        *[(4, d, 3, "MI") for d in (0, 1, 2, 3)],
        # Marco: MI Lun/Mié 12:05-13:55 (hours 6, 7)
        (3, 0, 6, "MI"), (3, 2, 6, "MI"), (3, 0, 7, "MI"), (3, 2, 7, "MI"),
        # Hiram: DC Lun-Vie 8:50-9:45 (hour 2)
        *[(5, d, 2, "DC") for d in range(5)],
        # Fide: MI Lun-Jue 7:00-8:50 (hours 0, 1)
        *[(6, d, h, "MI") for d in (0, 1, 2, 3) for h in (0, 1)],
    ]
    for tid, d, h, code in posgrado_blocks:
        blocked_slots.append({
            "type": "teacher",
            "teacher_id": tid,
            "slot_id": d * SLOTS_PER_DAY + h,
            "posgrado_code": code,
            "reason": f"Posgrado ({code})",
        })

    return {
        "id": "ITIID_2026",
        "name": "ITIID Sep–Dic 2026 (Excel Oficial UPV — 10 Grupos)",
        "description": "Instancia oficial del Excel ITIID Sep–Dic 2026: 10 grupos (Inmersión, 1-1..1-3, 3-1, 4-1..4-3, 7-1..7-2), 25 docentes con ventanas reales, Franjas de Inglés fijas y bloques compartidos de Posgrado (MI/DC).",
        "teachers": teachers,
        "rooms": rooms,
        "courses": courses,
        "constraints": [],
        "blocked_slots": blocked_slots,
        "preferences": [],
        "manual_schedule": None,
    }


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
