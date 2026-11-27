import math
import re
import unicodedata
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


def room_assignment_problem(course, room):
    if room is None:
        return "el aula no existe"
    if room["capacity"] < course["students"]:
        return f"el aula {room['name']} tiene {room['capacity']} lugares para {course['students']} alumnos"
    if course["requires_lab"] and room["type"] != "lab":
        return f"el aula {room['name']} no es un laboratorio"
    return None


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
        raw_tids = []
        for cand in (c.get("teacher_ids") or []):
            try:
                val = int(cand)
                if val > 0 and val not in raw_tids:
                    raw_tids.append(val)
            except (TypeError, ValueError):
                pass
        tid = c.get("teacher_id")
        if tid is None or tid == "" or tid == 0:
            tid = raw_tids[0] if raw_tids else (assigned_map.get(cid) or assigned_map.get(orig_cid) or 0)
        else:
            tid = int(tid)
        if tid > 0 and tid not in raw_tids:
            raw_tids.insert(0, tid)
        gid = int(c.get("group_id") or c.get("cuatrimestre") or 1)
        ws = int(c.get("weekly_sessions") or c.get("duration") or 1)
        norm_courses.append({
            "id": cid,
            "name": c.get("name", f"Materia {cid}"),
            "teacher_id": tid,
            "teacher_ids": raw_tids,
            "group_id": gid,
            "cuatrimestre": int(c["cuatrimestre"]) if c.get("cuatrimestre") is not None else (gid // 100 if gid >= 100 else gid),
            "weekly_sessions": ws,
            "students": int(c.get("students") or 30),
            "requires_lab": bool(c.get("requires_lab", False)),
        })

    # Ensure rooms exist for every group_id if rooms list is empty
    norm_rooms = []
    if rooms:
        for r in rooms:
            capacity = r.get("capacity")
            norm_rooms.append({
                "id": int(r["id"]),
                "code": r.get("code", ""),
                "name": r.get("name", f"Aula {r['id']}"),
                "capacity": int(capacity) if capacity not in (None, "") else 35,
                "group_id": int(r.get("group_id") or 0),
                "type": r.get("type", "aula"),
                "shift": r.get("shift", "matutino"),
                "allowed_hours": r.get("allowed_hours"),
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
            configured = False
            available_set = set()
            for d_idx, d_name in enumerate(DAYS):
                day_dict = avail.get(d_name, {})
                if isinstance(day_dict, dict):
                    for h_idx, t_str in enumerate(TIME_SLOTS):
                        if h_idx in BREAK_HOURS:
                            continue
                        cell = day_dict.get(t_str)
                        if isinstance(cell, bool):
                            configured = True
                            if cell:
                                available_set.add(d_idx * SLOTS_PER_DAY + h_idx)
            if configured:
                teacher_unavailable[tid].update(set(TEACHABLE_SLOTS) - available_set)

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

    # Hard preferences can restrict individual slots or the teacher's daily load.
    soft_preferences = []
    teacher_daily_limits = {}
    for p in preferences or []:
        if p.get("hard") is True:
            tid = int(p.get("teacher_id", 0))
            if tid and p.get("type") == "max_daily_hours":
                limit = max(0, int(p.get("max_hours", 4)))
                teacher_daily_limits[tid] = min(teacher_daily_limits.get(tid, limit), limit)
            elif tid:
                teacher_unavailable[tid].update(preference_forbidden_slots(p))
        else:
            soft_preferences.append(p)

    # Rebalance courses when a teacher is explicitly excluded (whole quarter or specific course)
    # or lacks room-compatible free slots (e.g., after blocking 1, 2 or more teachers in contingencies).
    def _norm_subject_key(name):
        s = unicodedata.normalize("NFD", str(name or "").lower())
        s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
        return re.sub(r"[^a-z0-9]+", " ", s).strip()

    excluded_teachers = set()
    for tid_val in (raw.get("excluded_teachers") or []):
        try:
            v = int(tid_val)
            if v > 0:
                excluded_teachers.add(v)
        except (TypeError, ValueError):
            pass
    for t in teachers:
        if t.get("active") is False or t.get("no_classes") is True:
            try:
                excluded_teachers.add(int(t["id"]))
            except (TypeError, ValueError):
                pass

    excluded_by_course_id = defaultdict(set)
    excluded_by_subject = defaultdict(set)
    for exc in (raw.get("teacher_course_exclusions") or []):
        try:
            etid = int(exc.get("teacher_id") or 0)
        except (TypeError, ValueError):
            etid = 0
        if etid <= 0:
            continue
        if exc.get("course_id") not in (None, ""):
            try:
                excluded_by_course_id[int(exc["course_id"])].add(etid)
            except (TypeError, ValueError):
                pass
        if exc.get("course_name"):
            key = _norm_subject_key(exc["course_name"])
            if key:
                excluded_by_subject[key].add(etid)

    def _is_teacher_excluded_for(tid, course):
        if not tid:
            return False
        if tid in excluded_teachers:
            return True
        if tid in excluded_by_course_id.get(course["id"], set()):
            return True
        if tid in excluded_by_subject.get(_norm_subject_key(course["name"]), set()):
            return True
        return False

    # Discover sibling teachers who teach the exact same subject & quarter in other groups
    sibling_teachers_by_key = defaultdict(list)
    for c in norm_courses:
        skey = (c["cuatrimestre"], _norm_subject_key(c["name"]))
        for t_cand in (c.get("teacher_ids") or ([c["teacher_id"]] if c["teacher_id"] else [])):
            if t_cand > 0 and t_cand not in sibling_teachers_by_key[skey]:
                sibling_teachers_by_key[skey].append(t_cand)

    rooms_by_gid = defaultdict(list)
    for r in norm_rooms:
        rooms_by_gid[r["group_id"]].append(r)

    def _course_valid_slots(tid, course):
        if _is_teacher_excluded_for(tid, course):
            return set()
        unavail = teacher_unavailable.get(tid, set())
        cand_rooms = rooms_by_gid.get(course["group_id"]) or rooms_by_gid.get(0) or norm_rooms
        best_slots = set()
        for r in cand_rooms:
            if room_assignment_problem(course, r):
                continue
            allowed_h = r.get("allowed_hours")
            r_blk = room_blocked.get(r["id"], set())
            slots = {
                s for s in TEACHABLE_SLOTS
                if (allowed_h is None or s % SLOTS_PER_DAY in allowed_h)
                and s not in unavail
                and s not in r_blk
            }
            if len(slots) > len(best_slots):
                best_slots = slots
        return best_slots

    def _effective_capacity(tid, course_list):
        """Slots usable by teacher `tid` across their assigned courses (bounded by daily limits)."""
        union_slots = set()
        for item in course_list:
            union_slots.update(_course_valid_slots(tid, item))
        dlim = teacher_daily_limits.get(tid)
        if dlim is not None:
            by_day = defaultdict(int)
            for s in union_slots:
                by_day[s // SLOTS_PER_DAY] += 1
            return sum(min(cnt, dlim) for cnt in by_day.values())
        return len(union_slots)

    # Strip explicitly excluded teachers from each course's candidate pool
    for c in norm_courses:
        c["teacher_ids"] = [tid for tid in (c.get("teacher_ids") or []) if not _is_teacher_excluded_for(tid, c)]

    courses_by_tid = defaultdict(list)
    load_by_teacher = defaultdict(int)
    for c in norm_courses:
        if c["teacher_id"]:
            courses_by_tid[c["teacher_id"]].append(c)
            load_by_teacher[c["teacher_id"]] += c["weekly_sessions"]

    reassigned = []
    unassigned_courses = []
    # Up to 2 passes so cascading reassignments (when 2-3 teachers are excluded/blocked) settle cleanly
    for _ in range(2):
        changed = False
        for c in norm_courses:
            cur_tid = c["teacher_id"]
            explicitly_excluded = _is_teacher_excluded_for(cur_tid, c)
            skey = (c["cuatrimestre"], _norm_subject_key(c["name"]))
            cands = list(c.get("teacher_ids") or [])
            for sib in sibling_teachers_by_key.get(skey, []):
                if sib not in cands and not _is_teacher_excluded_for(sib, c):
                    cands.append(sib)

            cur_course_slots = len(_course_valid_slots(cur_tid, c)) if cur_tid else 0
            cur_cap = _effective_capacity(cur_tid, courses_by_tid[cur_tid]) if cur_tid else 0
            needs_move = explicitly_excluded or (cur_tid > 0 and ((cur_course_slots < c["weekly_sessions"]) or (cur_cap < load_by_teacher[cur_tid])))
            if not needs_move:
                continue

            best_tid = cur_tid
            best_score = None
            for prio_idx, t_cand in enumerate(cands):
                if t_cand == cur_tid or _is_teacher_excluded_for(t_cand, c):
                    continue
                cand_course_slots = len(_course_valid_slots(t_cand, c))
                if cand_course_slots < c["weekly_sessions"]:
                    continue
                cand_cap = _effective_capacity(t_cand, courses_by_tid[t_cand] + [c])
                slack = cand_cap - (load_by_teacher[t_cand] + c["weekly_sessions"])
                score = (1 if slack >= 0 else 0, -prio_idx if slack >= 0 else slack, slack)
                if best_score is None or score > best_score:
                    best_score = score
                    best_tid = t_cand

            if best_tid != cur_tid and best_score is not None and best_score[0] == 1:
                if cur_tid and c in courses_by_tid[cur_tid]:
                    courses_by_tid[cur_tid].remove(c)
                    load_by_teacher[cur_tid] -= c["weekly_sessions"]
                c["teacher_id"] = best_tid
                if best_tid not in c["teacher_ids"]:
                    c["teacher_ids"].insert(0, best_tid)
                courses_by_tid[best_tid].append(c)
                load_by_teacher[best_tid] += c["weekly_sessions"]
                reassigned.append({
                    "course_id": c["id"],
                    "course_name": c["name"],
                    "group_id": c["group_id"],
                    "from_teacher_id": cur_tid,
                    "to_teacher_id": best_tid,
                })
                changed = True
            elif explicitly_excluded and cur_tid:
                # Never keep an explicitly excluded teacher on a course even if no backup exists
                if c in courses_by_tid[cur_tid]:
                    courses_by_tid[cur_tid].remove(c)
                    load_by_teacher[cur_tid] -= c["weekly_sessions"]
                c["teacher_id"] = 0
                unassigned_courses.append({
                    "course_id": c["id"],
                    "course_name": c["name"],
                    "group_id": c["group_id"],
                    "from_teacher_id": cur_tid,
                })
                changed = True
        if not changed:
            break

    return {
        "name": raw.get("name", "Instancia ITIID"),
        "teachers": teachers,
        "rooms": norm_rooms,
        "courses": norm_courses,
        "teacher_unavailable": {k: sorted(v) for k, v in teacher_unavailable.items()},
        "room_blocked": {k: sorted(v) for k, v in room_blocked.items()},
        "teacher_daily_limits": teacher_daily_limits,
        "blocked_slots": blocked_slots or [],
        "preferences": soft_preferences,
        "all_preferences": preferences or [],
        "reassigned": reassigned,
        "unassigned_courses": unassigned_courses,
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


def english_bridge_positions(inst):
    """Returns {(group_id, day_idx): set(compact_pos)} for fixed English bands so they are never miscounted as student gaps."""
    rooms_by_id = {int(r["id"]): r for r in (inst.get("rooms") or [])}
    bridges = defaultdict(set)
    for b in inst.get("blocked_slots") or []:
        if not b.get("is_english") or b.get("type") == "teacher":
            continue
        rid = b.get("room_id")
        slot = b.get("slot_id")
        if rid is None or slot is None:
            continue
        slot = int(slot)
        if not (0 <= slot < TOTAL_SLOTS):
            continue
        d, h = slot_to_day_hour(slot)
        if h in HOUR_TO_POS:
            r = rooms_by_id.get(int(rid), {})
            gid = int(r.get("group_id") or rid)
            bridges[(gid, d)].add(HOUR_TO_POS[h])
    return bridges


def validate_schedule(raw_instance, schedule, scenario="C", original_schedule=None):
    """Official common validator (arbiter): counts all hard violations, soft quality metrics, and I4 stability."""
    inst = normalize_instance(raw_instance) if "teacher_unavailable" not in raw_instance else raw_instance
    weights = SCENARIO_WEIGHTS.get(scenario, SCENARIO_WEIGHTS["C"])

    courses_by_id = {c["id"]: c for c in inst["courses"]}
    teachers_by_id = {int(t["id"]): t.get("name", f"Docente {t['id']}") for t in inst["teachers"]}
    rooms_by_id = {r["id"]: r for r in inst["rooms"]}
    t_unavail = {int(k): set(v) for k, v in inst["teacher_unavailable"].items()}
    r_blocked = {int(k): set(v) for k, v in inst["room_blocked"].items()}
    daily_limits = {int(k): v for k, v in inst.get("teacher_daily_limits", {}).items()}

    teacher_slot_map = defaultdict(list)
    group_slot_map = defaultdict(list)
    room_slot_map = defaultdict(list)
    course_counts = defaultdict(int)
    course_day_counts = defaultdict(lambda: defaultdict(int))
    group_day_hours = defaultdict(lambda: defaultdict(list))
    teacher_day_hours = defaultdict(lambda: defaultdict(list))
    teacher_assigned_slots = defaultdict(set)

    availability_violations = 0
    room_assignment_violations = 0
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

        room = rooms_by_id.get(rid)
        room_problem = room_assignment_problem(course, room)
        if room_problem is None and room.get("allowed_hours") is not None and h not in room["allowed_hours"]:
            room_problem = f"el aula {room['name']} no permite la franja {slot_label(slot)}"
        if room_problem:
            room_assignment_violations += 1
            conflicts_detail.append({
                "type": "room_assignment",
                "message": f"{course['name']} (aula {rid}): {room_problem}."
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

    teacher_daily_violations = 0
    for tid, limit in daily_limits.items():
        for day, positions in teacher_day_hours[tid].items():
            if len(positions) > limit:
                teacher_daily_violations += len(positions) - limit
                conflicts_detail.append({
                    "type": "teacher_daily_limit",
                    "message": f"{teachers_by_id.get(tid, tid)} tiene {len(positions)} sesiones el {DAYS[day]} y su máximo es {limit}."
                })

    total_hard = (
        teacher_conflicts + group_conflicts + room_conflicts + room_assignment_violations
        + availability_violations + teacher_daily_violations + missing_hours
    )

    # --- Soft Quality Metrics ---
    eng_bridges = english_bridge_positions(inst)
    student_gaps = 0
    excessive_days = 0
    for gid, days_dict in group_day_hours.items():
        for d, positions in days_dict.items():
            uniq = sorted(set(positions))
            if len(uniq) > 1:
                min_p, max_p = uniq[0], uniq[-1]
                day_bridges = {p for p in eng_bridges.get((gid, d), ()) if min_p < p < max_p}
                student_gaps += (max_p - min_p + 1) - len(set(uniq) | day_bridges)
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
            "room_assignment": room_assignment_violations,
            "availability": availability_violations,
            "teacher_daily_limit": teacher_daily_violations,
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
