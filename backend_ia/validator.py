import math
from collections import defaultdict

DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]
TIME_SLOTS = [
    "07:00 - 07:55",
    "07:55 - 08:50",
    "08:50 - 09:45",
    "09:45 - 10:40",
    "10:40 - 11:10 (Receso)",
    "11:10 - 12:05",
    "12:05 - 13:00",
    "13:00 - 13:55",
    "13:55 - 14:00 (Receso)",
    "14:00 - 14:55",
    "14:55 - 15:50",
    "15:50 - 16:45",
    "16:45 - 17:40",
    "17:40 - 18:00 (Receso)",
    "18:00 - 18:55",
    "18:55 - 19:50",
    "19:50 - 20:45",
]
SLOTS_PER_DAY = 17
NUM_DAYS = 5
TOTAL_SLOTS = SLOTS_PER_DAY * NUM_DAYS
BREAK_HOURS = {4, 8, 13}
TEACHABLE_HOURS = [h for h in range(SLOTS_PER_DAY) if h not in BREAK_HOURS]
TEACHABLE_SLOTS = [d * SLOTS_PER_DAY + h for d in range(NUM_DAYS) for h in TEACHABLE_HOURS]
# Position of each teachable hour within the 0..13 compact daily sequence (ignores breaks when measuring gaps)
HOUR_TO_POS = {h: idx for idx, h in enumerate(TEACHABLE_HOURS)}

SCENARIO_WEIGHTS = {
    "A": {  # Prioriza estudiantes
        "name": "Escenario A (Prioriza Estudiantes)",
        "student_gaps": 10,
        "excessive_days": 8,
        "spread_penalty": 6,
        "teacher_gaps": 2,
        "teacher_balance": 2,
        "preferences_violated": 3,
    },
    "B": {  # Prioriza docentes
        "name": "Escenario B (Prioriza Docentes)",
        "student_gaps": 2,
        "excessive_days": 3,
        "spread_penalty": 3,
        "teacher_gaps": 10,
        "teacher_balance": 8,
        "preferences_violated": 10,
    },
    "C": {  # Equilibrio
        "name": "Escenario C (Equilibrio)",
        "student_gaps": 6,
        "excessive_days": 5,
        "spread_penalty": 5,
        "teacher_gaps": 6,
        "teacher_balance": 5,
        "preferences_violated": 6,
    },
}


def slot_to_day_hour(slot):
    return slot // SLOTS_PER_DAY, slot % SLOTS_PER_DAY


def slot_label(slot):
    d, h = slot_to_day_hour(slot)
    day_name = DAYS[d] if 0 <= d < NUM_DAYS else f"Día {d}"
    time_name = TIME_SLOTS[h] if 0 <= h < SLOTS_PER_DAY else f"Slot {h}"
    return f"{day_name} {time_name}"


def normalize_instance(raw):
    """Normalizes data coming from original UPV storage OR built-in instances / Excel."""
    teachers = raw.get("teachers", [])
    rooms = raw.get("rooms", [])
    courses = raw.get("courses", [])
    constraints = raw.get("constraints", [])
    blocked_slots = raw.get("blocked_slots", [])
    preferences = raw.get("preferences", [])

    # Map course -> teacher from teacher.assignedCourses when course.teacher_id is missing
    assigned_map = {}
    for t in teachers:
        tid = int(t["id"])
        for cid in t.get("assignedCourses", []) or []:
            assigned_map[int(cid)] = tid

    norm_courses = []
    for c in courses:
        cid = int(c["id"])
        orig_cid = int(c.get("original_id", cid // 1000 if cid >= 1000 else cid))
        tid = c.get("teacher_id")
        if tid is None or tid == "" or tid == 0:
            tid = assigned_map.get(cid) or assigned_map.get(orig_cid) or 0
        else:
            tid = int(tid)
        gid = int(c.get("group_id") or c.get("cuatrimestre") or 1)
        ws = int(c.get("weekly_sessions") or c.get("duration") or 1)
        norm_courses.append({
            "id": cid,
            "name": c.get("name", f"Materia {cid}"),
            "teacher_id": tid,
            "group_id": gid,
            "cuatrimestre": int(c.get("cuatrimestre") or (gid // 100 if gid >= 100 else gid)),
            "weekly_sessions": ws,
            "students": int(c.get("students") or 30),
            "requires_lab": bool(c.get("requires_lab", False)),
        })

    # Ensure rooms exist for every group_id if rooms list is empty
    norm_rooms = []
    if rooms:
        for r in rooms:
            norm_rooms.append({
                "id": int(r["id"]),
                "code": r.get("code", ""),
                "name": r.get("name", f"Aula {r['id']}"),
                "capacity": int(r.get("capacity") or 35),
                "group_id": int(r.get("group_id") or 0),
                "type": r.get("type", "aula"),
                "shift": r.get("shift", "matutino"),
            })
    else:
        gids = sorted({c["group_id"] for c in norm_courses})
        for gid in gids:
            norm_rooms.append({
                "id": gid,
                "name": f"Grupo {gid}",
                "capacity": 35,
                "group_id": gid,
                "type": "aula",
            })

    # Build unavailable slots per teacher
    teacher_unavailable = defaultdict(set)
    for t in teachers:
        tid = int(t["id"])
        avail = t.get("availability")
        if isinstance(avail, dict) and len(avail) > 0:
            has_any_true = False
            available_set = set()
            for d_idx, d_name in enumerate(DAYS):
                day_dict = avail.get(d_name, {})
                if isinstance(day_dict, dict):
                    for h_idx, t_str in enumerate(TIME_SLOTS):
                        if h_idx in BREAK_HOURS:
                            continue
                        if day_dict.get(t_str) is True:
                            available_set.add(d_idx * SLOTS_PER_DAY + h_idx)
                            has_any_true = True
            if has_any_true:
                for s in TEACHABLE_SLOTS:
                    if s not in available_set:
                        teacher_unavailable[tid].add(s)

    for con in constraints or []:
        tid = int(con.get("teacher_id", 0))
        slot = int(con.get("slot_id", -1))
        if tid and 0 <= slot < TOTAL_SLOTS:
            teacher_unavailable[tid].add(slot)

    # Blocked shared resources (rooms or teachers occupied by other programs)
    room_blocked = defaultdict(set)
    for b in blocked_slots or []:
        slot = int(b.get("slot_id", -1))
        if not (0 <= slot < TOTAL_SLOTS):
            continue
        b_type = b.get("type", "room")
        if b_type == "teacher" and b.get("teacher_id") is not None:
            teacher_unavailable[int(b["teacher_id"])].add(slot)
        elif b.get("room_id") is not None:
            room_blocked[int(b["room_id"])].add(slot)
        elif b.get("id") is not None:
            if b_type == "teacher":
                teacher_unavailable[int(b["id"])].add(slot)
            else:
                room_blocked[int(b["id"])].add(slot)

    # Apply hard preferences into teacher_unavailable as well
    soft_preferences = []
    for p in preferences or []:
        if p.get("hard") is True:
            tid = int(p.get("teacher_id", 0))
            if tid:
                for s in preference_forbidden_slots(p):
                    teacher_unavailable[tid].add(s)
        else:
            soft_preferences.append(p)

    return {
        "name": raw.get("name", "Instancia ITIID"),
        "teachers": teachers,
        "rooms": norm_rooms,
        "courses": norm_courses,
        "teacher_unavailable": {k: sorted(v) for k, v in teacher_unavailable.items()},
        "room_blocked": {k: sorted(v) for k, v in room_blocked.items()},
        "blocked_slots": blocked_slots or [],
        "preferences": soft_preferences,
        "all_preferences": preferences or [],
    }


def preference_forbidden_slots(pref):
    """Translates a preference dict into the set of slots it prefers to AVOID."""
    ptype = pref.get("type", "")
    bad = set()
    if ptype == "avoid_day":
        d = int(pref.get("day", -1))
        if 0 <= d < NUM_DAYS:
            for h in TEACHABLE_HOURS:
                bad.add(d * SLOTS_PER_DAY + h)
    elif ptype == "avoid_early":
        cutoff = int(pref.get("before_hour", 2))  # default before 08:50 (slots 0, 1)
        for d in range(NUM_DAYS):
            for h in TEACHABLE_HOURS:
                if h < cutoff:
                    bad.add(d * SLOTS_PER_DAY + h)
    elif ptype == "avoid_late":
        cutoff = int(pref.get("after_hour", 11))  # default from 15:50 onwards
        for d in range(NUM_DAYS):
            for h in TEACHABLE_HOURS:
                if h >= cutoff:
                    bad.add(d * SLOTS_PER_DAY + h)
    elif ptype == "prefer_morning":
        for d in range(NUM_DAYS):
            for h in TEACHABLE_HOURS:
                if h >= 9:  # afternoon starts at 14:00 (slot 9)
                    bad.add(d * SLOTS_PER_DAY + h)
    elif ptype == "prefer_afternoon":
        for d in range(NUM_DAYS):
            for h in TEACHABLE_HOURS:
                if h < 9:
                    bad.add(d * SLOTS_PER_DAY + h)
    elif ptype == "avoid_day_afternoon":
        d = int(pref.get("day", 4))  # e.g. Friday afternoon
        for h in TEACHABLE_HOURS:
            if h >= 9:
                bad.add(d * SLOTS_PER_DAY + h)
    elif ptype == "avoid_slot":
        s = int(pref.get("slot_id", -1))
        if 0 <= s < TOTAL_SLOTS:
            bad.add(s)
    return bad


def validate_schedule(raw_instance, schedule, scenario="C", original_schedule=None):
    """Official common validator (arbiter): counts all hard violations, soft quality metrics, and I4 stability."""
    inst = normalize_instance(raw_instance) if "teacher_unavailable" not in raw_instance else raw_instance
    weights = SCENARIO_WEIGHTS.get(scenario, SCENARIO_WEIGHTS["C"])

    courses_by_id = {c["id"]: c for c in inst["courses"]}
    teachers_by_id = {int(t["id"]): t.get("name", f"Docente {t['id']}") for t in inst["teachers"]}
    rooms_by_id = {r["id"]: r for r in inst["rooms"]}
    t_unavail = {int(k): set(v) for k, v in inst["teacher_unavailable"].items()}
    r_blocked = {int(k): set(v) for k, v in inst["room_blocked"].items()}

    teacher_slot_map = defaultdict(list)
    group_slot_map = defaultdict(list)
    room_slot_map = defaultdict(list)
    course_counts = defaultdict(int)
    course_day_counts = defaultdict(lambda: defaultdict(int))
    group_day_hours = defaultdict(lambda: defaultdict(list))
    teacher_day_hours = defaultdict(lambda: defaultdict(list))
    teacher_assigned_slots = defaultdict(set)

    availability_violations = 0
    conflicts_detail = []

    for item in schedule or []:
        cid = int(item.get("course_id", -1))
        rid = int(item.get("room_id", -1))
        slot = int(item.get("start_slot", -1))
        course = courses_by_id.get(cid)
        if not course:
            availability_violations += 1
            conflicts_detail.append({
                "type": "availability",
                "message": f"Curso inexistente (ID {cid}) asignado en {slot_label(slot)}."
            })
            continue

        tid = course["teacher_id"]
        gid = course["group_id"]
        course_counts[cid] += 1

        if not (0 <= slot < TOTAL_SLOTS):
            availability_violations += 1
            conflicts_detail.append({
                "type": "availability",
                "message": f"{course['name']} asignada a un bloque fuera de rango ({slot})."
            })
            continue

        d, h = slot_to_day_hour(slot)
        if h in BREAK_HOURS:
            availability_violations += 1
            conflicts_detail.append({
                "type": "availability",
                "message": f"{course['name']} asignada en horario de receso ({slot_label(slot)})."
            })

        if tid and slot in t_unavail.get(tid, set()):
            availability_violations += 1
            tname = teachers_by_id.get(tid, f"Docente {tid}")
            conflicts_detail.append({
                "type": "availability",
                "message": f"Disponibilidad violada: {tname} no está disponible en {slot_label(slot)} ({course['name']})."
            })

        if slot in r_blocked.get(rid, set()):
            availability_violations += 1
            rname = rooms_by_id.get(rid, {}).get("name", f"Aula {rid}")
            conflicts_detail.append({
                "type": "availability",
                "message": f"Recurso compartido bloqueado: {rname} ocupado por otro programa en {slot_label(slot)}."
            })

        if tid:
            teacher_slot_map[(tid, slot)].append(cid)
            if h in HOUR_TO_POS:
                teacher_day_hours[tid][d].append(HOUR_TO_POS[h])
            teacher_assigned_slots[tid].add(slot)

        group_slot_map[(gid, slot)].append(cid)
        room_slot_map[(rid, slot)].append(cid)
        course_day_counts[cid][d] += 1
        if h in HOUR_TO_POS:
            group_day_hours[gid][d].append(HOUR_TO_POS[h])

    # Count overlaps
    teacher_conflicts = 0
    for (tid, slot), cids in teacher_slot_map.items():
        if len(cids) > 1:
            teacher_conflicts += len(cids) - 1
            tname = teachers_by_id.get(tid, f"Docente {tid}")
            names = ", ".join(courses_by_id[c]["name"] for c in cids)
            conflicts_detail.append({
                "type": "teacher_conflict",
                "message": f"Traslape docente: {tname} tiene {len(cids)} clases simultáneas en {slot_label(slot)} ({names})."
            })

    group_conflicts = 0
    for (gid, slot), cids in group_slot_map.items():
        if len(cids) > 1:
            group_conflicts += len(cids) - 1
            names = ", ".join(courses_by_id[c]["name"] for c in cids)
            conflicts_detail.append({
                "type": "group_conflict",
                "message": f"Traslape grupo {gid}: {len(cids)} materias simultáneas en {slot_label(slot)} ({names})."
            })

    room_conflicts = 0
    for (rid, slot), cids in room_slot_map.items():
        if len(cids) > 1:
            # Avoid double-counting purely virtual room == group only as separate report? No, PDF explicitly tracks room conflicts!
            room_conflicts += len(cids) - 1
            rname = rooms_by_id.get(rid, {}).get("name", f"Aula {rid}")
            conflicts_detail.append({
                "type": "room_conflict",
                "message": f"Traslape aula {rname}: {len(cids)} clases en {slot_label(slot)}."
            })

    missing_hours = 0
    for c in inst["courses"]:
        assigned = course_counts[c["id"]]
        req = c["weekly_sessions"]
        if assigned != req:
            diff = abs(req - assigned)
            missing_hours += diff
            conflicts_detail.append({
                "type": "missing_hours",
                "message": f"Horas incompletas en {c['name']} (Grupo {c['group_id']}): {assigned}/{req} sesiones asignadas."
            })

    total_hard = teacher_conflicts + group_conflicts + room_conflicts + availability_violations + missing_hours

    # --- Soft Quality Metrics ---
    student_gaps = 0
    excessive_days = 0
    for gid, days_dict in group_day_hours.items():
        for d, positions in days_dict.items():
            uniq = sorted(set(positions))
            if len(uniq) > 1:
                student_gaps += (uniq[-1] - uniq[0] + 1) - len(uniq)
            if len(positions) > 6:
                excessive_days += len(positions) - 6

    teacher_gaps = 0
    teacher_balance = 0
    for tid, days_dict in teacher_day_hours.items():
        counts_per_day = []
        for d, positions in days_dict.items():
            uniq = sorted(set(positions))
            if len(uniq) > 1:
                teacher_gaps += (uniq[-1] - uniq[0] + 1) - len(uniq)
            if len(positions) > 6:
                excessive_days += len(positions) - 6
            counts_per_day.append(len(positions))
        if len(counts_per_day) > 1:
            spread = max(counts_per_day) - min(counts_per_day)
            if spread > 2:
                teacher_balance += spread - 2

    spread_penalty = 0
    for c in inst["courses"]:
        max_per_day = math.ceil(c["weekly_sessions"] / 5.0)
        for d, cnt in course_day_counts[c["id"]].items():
            if cnt > max_per_day:
                spread_penalty += cnt - max_per_day

    # Soft preferences
    prefs = inst.get("preferences", [])
    pref_total = len(prefs)
    pref_violated = 0
    for p in prefs:
        tid = int(p.get("teacher_id", 0))
        if not tid:
            continue
        if p.get("type") == "max_daily_hours":
            limit = int(p.get("max_hours", 4))
            violated = any(len(pos) > limit for pos in teacher_day_hours[tid].values())
            if violated:
                pref_violated += 1
        else:
            bad = preference_forbidden_slots(p)
            if bad & teacher_assigned_slots.get(tid, set()):
                pref_violated += 1
    pref_met = pref_total - pref_violated
    pref_met_pct = round((pref_met / pref_total) * 100.0, 1) if pref_total > 0 else 100.0

    soft_penalty = (
        weights["student_gaps"] * student_gaps
        + weights["teacher_gaps"] * teacher_gaps
        + weights["excessive_days"] * excessive_days
        + weights["spread_penalty"] * spread_penalty
        + weights["teacher_balance"] * teacher_balance
        + weights["preferences_violated"] * pref_violated
    )

    # Stability (I4)
    stability = None
    if original_schedule is not None:
        orig_by_course = defaultdict(set)
        new_by_course = defaultdict(set)
        for it in original_schedule:
            orig_by_course[int(it["course_id"])].add((int(it["room_id"]), int(it["start_slot"])))
        for it in schedule or []:
            new_by_course[int(it["course_id"])].add((int(it["room_id"]), int(it["start_slot"])))
        moved = 0
        total_orig = len(original_schedule)
        for cid, orig_set in orig_by_course.items():
            kept = len(orig_set & new_by_course.get(cid, set()))
            moved += len(orig_set) - kept
        stability = {
            "moved_sessions": moved,
            "total_sessions": total_orig,
            "unchanged_pct": round(((total_orig - moved) / total_orig) * 100.0, 1) if total_orig > 0 else 100.0,
        }

    return {
        "feasible": total_hard == 0,
        "scenario": scenario,
        "scenario_name": weights["name"],
        "hard_violations": {
            "teacher_conflict": teacher_conflicts,
            "group_conflict": group_conflicts,
            "room_conflict": room_conflicts,
            "availability": availability_violations,
            "missing_hours": missing_hours,
            "total": total_hard,
        },
        "soft_metrics": {
            "student_gaps": student_gaps,
            "teacher_gaps": teacher_gaps,
            "excessive_days": excessive_days,
            "spread_penalty": spread_penalty,
            "teacher_balance": teacher_balance,
            "preferences_total": pref_total,
            "preferences_met": pref_met,
            "preferences_violated": pref_violated,
            "preferences_met_pct": pref_met_pct,
        },
        "soft_penalty": soft_penalty,
        "stability": stability,
        "conflicts_detail": conflicts_detail[:40],
        "total_assigned": len(schedule or []),
        "total_required": sum(c["weekly_sessions"] for c in inst["courses"]),
    }
