import math
import random
import statistics
import time
from collections import defaultdict
from ortools.sat.python import cp_model

from validator import (
    DAYS,
    NUM_DAYS,
    SLOTS_PER_DAY,
    TEACHABLE_HOURS,
    TEACHABLE_SLOTS,
    HOUR_TO_POS,
    SCENARIO_WEIGHTS,
    normalize_instance,
    preference_forbidden_slots,
    validate_schedule,
)


def _get_course_room_map(inst):
    """Maps each course_id to its room_id (by matching group_id, fallback to first room)."""
    rooms_by_group = {}
    for r in inst["rooms"]:
        if r["group_id"] not in rooms_by_group:
            rooms_by_group[r["group_id"]] = r["id"]
    fallback_room = inst["rooms"][0]["id"] if inst["rooms"] else 1
    mapping = {}
    for c in inst["courses"]:
        mapping[c["id"]] = rooms_by_group.get(c["group_id"], fallback_room)
    return mapping


def _get_valid_slots_per_course(inst, room_map):
    t_unavail = {int(k): set(v) for k, v in inst["teacher_unavailable"].items()}
    r_blocked = {int(k): set(v) for k, v in inst["room_blocked"].items()}
    domains = {}
    for c in inst["courses"]:
        tid = c["teacher_id"]
        rid = room_map[c["id"]]
        bad = set()
        if tid:
            bad |= t_unavail.get(tid, set())
        bad |= r_blocked.get(rid, set())
        domains[c["id"]] = [s for s in TEACHABLE_SLOTS if s not in bad]
    return domains


# ==============================================================================
# R2: OR-TOOLS CP-SAT SOLVER (Escenarios A, B, C + Reprogramación I4)
# ==============================================================================

def _build_and_solve_cpsat(inst, scenario="C", time_limit_sec=6.0, original_schedule=None, relaxed_avail=False):
    weights = SCENARIO_WEIGHTS.get(scenario, SCENARIO_WEIGHTS["C"])
    room_map = _get_course_room_map(inst)
    domains = _get_valid_slots_per_course(inst, room_map)
    t_unavail = {int(k): set(v) for k, v in inst["teacher_unavailable"].items()}
    r_blocked = {int(k): set(v) for k, v in inst["room_blocked"].items()}

    model = cp_model.CpModel()
    courses = inst["courses"]
    if not courses:
        return [], "OPTIMAL"

    # Decision variables x[(cid, slot)] in {0, 1}
    x = {}
    avail_penalties = []
    for c in courses:
        cid = c["id"]
        tid = c["teacher_id"]
        rid = room_map[cid]
        allowed = TEACHABLE_SLOTS if relaxed_avail else domains[cid]
        for s in allowed:
            var = model.NewBoolVar(f"x_{cid}_{s}")
            x[(cid, s)] = var
            if relaxed_avail:
                if (tid and s in t_unavail.get(tid, set())) or (s in r_blocked.get(rid, set())):
                    avail_penalties.append(var)

    # Hard 1: Exact weekly sessions per course (or slack if relaxed)
    missing_slacks = []
    for c in courses:
        cid = c["id"]
        req = min(c["weekly_sessions"], len(TEACHABLE_SLOTS))
        vars_c = [x[(cid, s)] for s in TEACHABLE_SLOTS if (cid, s) in x]
        if not relaxed_avail:
            model.Add(sum(vars_c) == req)
        else:
            slack = model.NewIntVar(0, req, f"miss_{cid}")
            model.Add(sum(vars_c) + slack == req)
            missing_slacks.append(slack)

    # Hard 2: No group overlap
    courses_by_group = defaultdict(list)
    for c in courses:
        courses_by_group[c["group_id"]].append(c)
    for gid, clist in courses_by_group.items():
        for s in TEACHABLE_SLOTS:
            v = [x[(c["id"], s)] for c in clist if (c["id"], s) in x]
            if len(v) > 1:
                model.Add(sum(v) <= 1)

    # Hard 3: No room overlap (when multiple groups share a physical room)
    courses_by_room = defaultdict(list)
    for c in courses:
        courses_by_room[room_map[c["id"]]].append(c)
    for rid, clist in courses_by_room.items():
        if len({c["group_id"] for c in clist}) > 1:
            for s in TEACHABLE_SLOTS:
                v = [x[(c["id"], s)] for c in clist if (c["id"], s) in x]
                if len(v) > 1:
                    model.Add(sum(v) <= 1)

    # Hard 4: No teacher overlap
    courses_by_teacher = defaultdict(list)
    for c in courses:
        if c["teacher_id"]:
            courses_by_teacher[c["teacher_id"]].append(c)
    for tid, clist in courses_by_teacher.items():
        if len(clist) > 1:
            for s in TEACHABLE_SLOTS:
                v = [x[(c["id"], s)] for c in clist if (c["id"], s) in x]
                if len(v) > 1:
                    model.Add(sum(v) <= 1)

    # --- Soft Objectives ---
    obj_terms = []
    if relaxed_avail:
        for v in avail_penalties:
            obj_terms.append(10000 * v)
        for sl in missing_slacks:
            obj_terms.append(20000 * sl)

    n_pos = len(TEACHABLE_HOURS)  # 14

    # Soft 1 & 3: Student gaps & excessive daily load per group
    for gid, clist in courses_by_group.items():
        for d in range(NUM_DAYS):
            active = []
            for p_idx, h in enumerate(TEACHABLE_HOURS):
                s = d * SLOTS_PER_DAY + h
                v = [x[(c["id"], s)] for c in clist if (c["id"], s) in x]
                if v:
                    a = model.NewBoolVar(f"ga_{gid}_{d}_{p_idx}")
                    model.Add(a == sum(v))
                    active.append((p_idx, a))
            if not active:
                continue

            cnt = model.NewIntVar(0, n_pos, f"gcnt_{gid}_{d}")
            model.Add(cnt == sum(a for _, a in active))

            # Excessive day (> 6 hours)
            exc = model.NewIntVar(0, n_pos, f"gexc_{gid}_{d}")
            model.Add(exc >= cnt - 6)
            obj_terms.append(weights["excessive_days"] * exc)

            # Linear gap formulation: span = last - first + 1 - cnt (when day used)
            used = model.NewBoolVar(f"gused_{gid}_{d}")
            model.Add(cnt >= 1).OnlyEnforceIf(used)
            model.Add(cnt == 0).OnlyEnforceIf(used.Not())

            first_p = model.NewIntVar(0, n_pos - 1, f"gfirst_{gid}_{d}")
            last_p = model.NewIntVar(0, n_pos - 1, f"glast_{gid}_{d}")
            for p_idx, a in active:
                model.Add(first_p <= p_idx).OnlyEnforceIf(a)
                model.Add(last_p >= p_idx).OnlyEnforceIf(a)
            model.Add(last_p >= first_p).OnlyEnforceIf(used)

            gap = model.NewIntVar(0, n_pos, f"ggap_{gid}_{d}")
            model.Add(gap >= last_p - first_p + 1 - cnt).OnlyEnforceIf(used)
            obj_terms.append(weights["student_gaps"] * gap)

    # Soft 2, 3, 5: Teacher gaps, excessive days, and daily load balance
    for tid, clist in courses_by_teacher.items():
        day_cnts = []
        for d in range(NUM_DAYS):
            active = []
            for p_idx, h in enumerate(TEACHABLE_HOURS):
                s = d * SLOTS_PER_DAY + h
                v = [x[(c["id"], s)] for c in clist if (c["id"], s) in x]
                if v:
                    a = model.NewBoolVar(f"ta_{tid}_{d}_{p_idx}")
                    model.Add(a == sum(v))
                    active.append((p_idx, a))
            if not active:
                continue

            cnt = model.NewIntVar(0, n_pos, f"tcnt_{tid}_{d}")
            model.Add(cnt == sum(a for _, a in active))
            day_cnts.append(cnt)

            exc = model.NewIntVar(0, n_pos, f"texc_{tid}_{d}")
            model.Add(exc >= cnt - 6)
            obj_terms.append(weights["excessive_days"] * exc)

            used = model.NewBoolVar(f"tused_{tid}_{d}")
            model.Add(cnt >= 1).OnlyEnforceIf(used)
            model.Add(cnt == 0).OnlyEnforceIf(used.Not())

            first_p = model.NewIntVar(0, n_pos - 1, f"tfirst_{tid}_{d}")
            last_p = model.NewIntVar(0, n_pos - 1, f"tlast_{tid}_{d}")
            for p_idx, a in active:
                model.Add(first_p <= p_idx).OnlyEnforceIf(a)
                model.Add(last_p >= p_idx).OnlyEnforceIf(a)
            model.Add(last_p >= first_p).OnlyEnforceIf(used)

            gap = model.NewIntVar(0, n_pos, f"tgap_{tid}_{d}")
            model.Add(gap >= last_p - first_p + 1 - cnt).OnlyEnforceIf(used)
            obj_terms.append(weights["teacher_gaps"] * gap)

        if len(day_cnts) > 1:
            max_dc = model.NewIntVar(0, n_pos, f"tmaxd_{tid}")
            min_dc = model.NewIntVar(0, n_pos, f"tmind_{tid}")
            model.AddMaxEquality(max_dc, day_cnts)
            model.AddMinEquality(min_dc, day_cnts)
            bal = model.NewIntVar(0, n_pos, f"tbal_{tid}")
            model.Add(bal >= max_dc - min_dc - 2)
            obj_terms.append(weights["teacher_balance"] * bal)

    # Soft 4: Weekly spread per course (max ceil(ws/5) per day)
    for c in courses:
        cid = c["id"]
        max_d = math.ceil(c["weekly_sessions"] / 5.0)
        for d in range(NUM_DAYS):
            v = [x[(cid, d * SLOTS_PER_DAY + h)] for h in TEACHABLE_HOURS if (cid, d * SLOTS_PER_DAY + h) in x]
            if len(v) > max_d:
                ov = model.NewIntVar(0, len(v), f"sp_{cid}_{d}")
                model.Add(ov >= sum(v) - max_d)
                obj_terms.append(weights["spread_penalty"] * ov)

    # Soft 6: Teacher preferences (from R5 LLM)
    for idx, pref in enumerate(inst.get("preferences", [])):
        tid = int(pref.get("teacher_id", 0))
        if not tid or tid not in courses_by_teacher:
            continue
        clist = courses_by_teacher[tid]
        if pref.get("type") == "max_daily_hours":
            limit = int(pref.get("max_hours", 4))
            viol_flags = []
            for d in range(NUM_DAYS):
                v = [x[(c["id"], d * SLOTS_PER_DAY + h)] for c in clist for h in TEACHABLE_HOURS if (c["id"], d * SLOTS_PER_DAY + h) in x]
                if v:
                    vf = model.NewBoolVar(f"pmax_{idx}_{d}")
                    model.Add(sum(v) > limit).OnlyEnforceIf(vf)
                    model.Add(sum(v) <= limit).OnlyEnforceIf(vf.Not())
                    viol_flags.append(vf)
            if viol_flags:
                pv = model.NewBoolVar(f"pv_{idx}")
                model.AddMaxEquality(pv, viol_flags)
                obj_terms.append(weights["preferences_violated"] * pv)
        else:
            bad_slots = preference_forbidden_slots(pref)
            bad_vars = [x[(c["id"], s)] for c in clist for s in bad_slots if (c["id"], s) in x]
            if bad_vars:
                pv = model.NewBoolVar(f"pv_{idx}")
                model.AddMaxEquality(pv, bad_vars)
                obj_terms.append(weights["preferences_violated"] * pv)

    # Stability Objective (I4 Rescheduling: freeze untouched sessions!)
    if original_schedule:
        orig_pairs = {(int(it["course_id"]), int(it["start_slot"])) for it in original_schedule}
        for (cid, s) in orig_pairs:
            if (cid, s) in x:
                # Penalty 50 for every original session NOT kept at its exact slot
                obj_terms.append(50 * (1 - x[(cid, s)]))

    if obj_terms:
        model.Minimize(sum(obj_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(time_limit_sec)
    solver.parameters.num_search_workers = 4
    status = solver.Solve(model)
    status_name = solver.StatusName(status)

    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        sched = []
        for (cid, s), var in x.items():
            if solver.Value(var) == 1:
                sched.append({"course_id": cid, "room_id": room_map[cid], "start_slot": s})
        sched.sort(key=lambda it: (it["room_id"], it["start_slot"]))
        return sched, status_name

    return None, status_name


def solve_cpsat(raw_instance, scenario="C", time_limit_sec=6.0, original_schedule=None):
    t0 = time.perf_counter()
    inst = normalize_instance(raw_instance)
    sched, status_name = _build_and_solve_cpsat(
        inst, scenario=scenario, time_limit_sec=time_limit_sec, original_schedule=original_schedule, relaxed_avail=False
    )
    relaxed_used = False
    if sched is None:
        # Run diagnostic relaxed pass so R6 can explain exact infeasibility causes
        sched, status_name = _build_and_solve_cpsat(
            inst, scenario=scenario, time_limit_sec=min(4.0, time_limit_sec), original_schedule=original_schedule, relaxed_avail=True
        )
        relaxed_used = True
        sched = sched or []

    elapsed_ms = round((time.perf_counter() - t0) * 1000, 1)
    validation = validate_schedule(inst, sched, scenario=scenario, original_schedule=original_schedule)
    return {
        "method": "CP-SAT (OR-Tools)",
        "method_id": "cpsat",
        "status": f"{status_name} (diagnóstico relajado)" if relaxed_used else status_name,
        "elapsed_ms": elapsed_ms,
        "schedule": sched,
        "validation": validation,
    }


# ==============================================================================
# SHARED FAST EVALUATOR FOR METAHEURISTICS (AG & LOCAL SEARCH)
# ==============================================================================

def _build_session_list(inst, room_map):
    """Expands each course into individual session units to schedule."""
    sessions = []
    for c in inst["courses"]:
        req = min(c["weekly_sessions"], len(TEACHABLE_SLOTS))
        for k in range(req):
            sessions.append({
                "course_id": c["id"],
                "teacher_id": c["teacher_id"],
                "group_id": c["group_id"],
                "room_id": room_map[c["id"]],
                "weekly_sessions": req,
                "max_per_day": math.ceil(req / 5.0),
            })
    return sessions


def _fast_score(assign, sessions, domains_set, pref_bad_by_teacher, weights, orig_slot_map=None):
    """Fast objective matching validator.py: returns (hard_total, soft_penalty, total_cost)."""
    t_used = defaultdict(int)
    g_used = defaultdict(int)
    r_used = defaultdict(int)
    g_day_pos = defaultdict(list)
    t_day_pos = defaultdict(list)
    c_day_cnt = defaultdict(int)
    t_slots = defaultdict(set)

    hard = 0
    for idx, slot in enumerate(assign):
        s_info = sessions[idx]
        cid = s_info["course_id"]
        tid = s_info["teacher_id"]
        gid = s_info["group_id"]
        rid = s_info["room_id"]

        if slot not in domains_set[cid]:
            hard += 1
        if tid:
            t_used[(tid, slot)] += 1
            if t_used[(tid, slot)] > 1:
                hard += 1
            t_slots[tid].add(slot)
        g_used[(gid, slot)] += 1
        if g_used[(gid, slot)] > 1:
            hard += 1
        r_used[(rid, slot)] += 1
        if r_used[(rid, slot)] > 1:
            hard += 1

        d = slot // SLOTS_PER_DAY
        h = slot % SLOTS_PER_DAY
        pos = HOUR_TO_POS.get(h, 0)
        g_day_pos[(gid, d)].append(pos)
        if tid:
            t_day_pos[(tid, d)].append(pos)
        c_day_cnt[(cid, d)] += 1

    student_gaps = 0
    excessive = 0
    for (gid, d), pos_list in g_day_pos.items():
        u = set(pos_list)
        if len(u) > 1:
            student_gaps += (max(u) - min(u) + 1) - len(u)
        if len(pos_list) > 6:
            excessive += len(pos_list) - 6

    teacher_gaps = 0
    t_day_counts = defaultdict(list)
    for (tid, d), pos_list in t_day_pos.items():
        u = set(pos_list)
        if len(u) > 1:
            teacher_gaps += (max(u) - min(u) + 1) - len(u)
        if len(pos_list) > 6:
            excessive += len(pos_list) - 6
        t_day_counts[tid].append(len(pos_list))

    t_balance = 0
    for tid, cnts in t_day_counts.items():
        if len(cnts) > 1:
            sp = max(cnts) - min(cnts)
            if sp > 2:
                t_balance += sp - 2

    spread = 0
    seen_c = {}
    for s_info in sessions:
        seen_c[s_info["course_id"]] = s_info["max_per_day"]
    for (cid, d), cnt in c_day_cnt.items():
        if cnt > seen_c[cid]:
            spread += cnt - seen_c[cid]

    pref_viol = 0
    for tid, bad_sets in pref_bad_by_teacher.items():
        assigned = t_slots.get(tid, set())
        for bset in bad_sets:
            if bset & assigned:
                pref_viol += 1

    soft = (
        weights["student_gaps"] * student_gaps
        + weights["teacher_gaps"] * teacher_gaps
        + weights["excessive_days"] * excessive
        + weights["spread_penalty"] * spread
        + weights["teacher_balance"] * t_balance
        + weights["preferences_violated"] * pref_viol
    )

    move_pen = 0
    if orig_slot_map:
        assigned_by_c = defaultdict(list)
        for idx, slot in enumerate(assign):
            assigned_by_c[sessions[idx]["course_id"]].append(slot)
        for cid, orig_slots in orig_slot_map.items():
            cur_set = set(assigned_by_c.get(cid, []))
            for s in orig_slots:
                if s not in cur_set:
                    move_pen += 50

    return hard, soft, hard * 10000 + soft + move_pen


def _construct_mrv(sessions, domains, rng, jitter=0.0):
    """Constructive heuristic with MRV (Minimum Remaining Values / menor dominio)."""
    n = len(sessions)
    order = list(range(n))
    # Sort primarily by smallest domain size (MRV), with optional jitter for restarts
    order.sort(key=lambda i: (len(domains[sessions[i]["course_id"]]), rng.random() * jitter))

    assign = [0] * n
    t_busy = set()
    g_busy = set()
    r_busy = set()
    c_day = defaultdict(int)
    g_day_hours = defaultdict(list)

    for idx in order:
        s_info = sessions[idx]
        cid = s_info["course_id"]
        tid = s_info["teacher_id"]
        gid = s_info["group_id"]
        rid = s_info["room_id"]
        dom = domains[cid] if domains[cid] else TEACHABLE_SLOTS

        best_slot = None
        best_sc = 10**9
        # Sample or inspect domain
        candidates = dom if len(dom) <= 40 else rng.sample(dom, 40)
        for slot in candidates:
            sc = 0
            if tid and (tid, slot) in t_busy:
                sc += 10000
            if (gid, slot) in g_busy:
                sc += 10000
            if (rid, slot) in r_busy:
                sc += 10000
            d = slot // SLOTS_PER_DAY
            h = slot % SLOTS_PER_DAY
            pos = HOUR_TO_POS.get(h, 0)
            if c_day[(cid, d)] >= s_info["max_per_day"]:
                sc += 25
            # Encourage compact days (near existing group classes)
            prev = g_day_hours[(gid, d)]
            if prev:
                dist = min(abs(pos - p) for p in prev)
                sc += dist * 3
            else:
                sc += pos  # mildly prefer earlier slots
            sc += rng.random() * (jitter * 12 + 0.5)
            if sc < best_sc:
                best_sc = sc
                best_slot = slot

        assign[idx] = best_slot
        if tid:
            t_busy.add((tid, best_slot))
        g_busy.add((gid, best_slot))
        r_busy.add((rid, best_slot))
        d = best_slot // SLOTS_PER_DAY
        c_day[(cid, d)] += 1
        g_day_hours[(gid, d)].append(HOUR_TO_POS.get(best_slot % SLOTS_PER_DAY, 0))

    return assign


def _repair_conflicts(assign, sessions, domains, domains_set, rng, max_steps=60):
    """Targeted repair operator: resolves conflicting sessions by moving them to free slots."""
    assign = list(assign)
    for _ in range(max_steps):
        t_map = defaultdict(list)
        g_map = defaultdict(list)
        r_map = defaultdict(list)
        for idx, slot in enumerate(assign):
            si = sessions[idx]
            if si["teacher_id"]:
                t_map[(si["teacher_id"], slot)].append(idx)
            g_map[(si["group_id"], slot)].append(idx)
            r_map[(si["room_id"], slot)].append(idx)

        bad_indices = set()
        for lst in list(t_map.values()) + list(g_map.values()) + list(r_map.values()):
            if len(lst) > 1:
                bad_indices.update(lst[1:])
        for idx, slot in enumerate(assign):
            if slot not in domains_set[sessions[idx]["course_id"]]:
                bad_indices.add(idx)

        if not bad_indices:
            break

        idx = rng.choice(list(bad_indices))
        si = sessions[idx]
        dom = domains[si["course_id"]] or TEACHABLE_SLOTS
        best_slot = assign[idx]
        best_conf = 10**9
        for cand in dom:
            conf = 0
            if si["teacher_id"] and len(t_map.get((si["teacher_id"], cand), [])) > (1 if cand == assign[idx] else 0):
                conf += 1
            if len(g_map.get((si["group_id"], cand), [])) > (1 if cand == assign[idx] else 0):
                conf += 1
            if len(r_map.get((si["room_id"], cand), [])) > (1 if cand == assign[idx] else 0):
                conf += 1
            if conf < best_conf:
                best_conf = conf
                best_slot = cand
                if conf == 0:
                    break
        assign[idx] = best_slot
    return assign


def _assign_to_schedule(assign, sessions):
    sched = [
        {"course_id": sessions[i]["course_id"], "room_id": sessions[i]["room_id"], "start_slot": assign[i]}
        for i in range(len(sessions))
    ]
    sched.sort(key=lambda it: (it["room_id"], it["start_slot"]))
    return sched


def _extract_pref_map(inst):
    pref_map = defaultdict(list)
    for p in inst.get("preferences", []):
        tid = int(p.get("teacher_id", 0))
        if tid and p.get("type") != "max_daily_hours":
            bset = preference_forbidden_slots(p)
            if bset:
                pref_map[tid].append(bset)
    return pref_map


# ==============================================================================
# R3: ALGORITMO GENÉTICO (Con N corridas por instancia)
# ==============================================================================

def solve_genetic(
    raw_instance,
    scenario="C",
    runs=10,
    population_size=24,
    generations=35,
    mutation_rate=0.12,
    original_schedule=None,
):
    t0 = time.perf_counter()
    inst = normalize_instance(raw_instance)
    weights = SCENARIO_WEIGHTS.get(scenario, SCENARIO_WEIGHTS["C"])
    room_map = _get_course_room_map(inst)
    domains = _get_valid_slots_per_course(inst, room_map)
    domains_set = {k: set(v) for k, v in domains.items()}
    sessions = _build_session_list(inst, room_map)
    pref_map = _extract_pref_map(inst)

    orig_slot_map = None
    if original_schedule:
        orig_slot_map = defaultdict(list)
        for it in original_schedule:
            orig_slot_map[int(it["course_id"])].append(int(it["start_slot"]))

    if not sessions:
        val = validate_schedule(inst, [], scenario=scenario, original_schedule=original_schedule)
        return {"method": "Algoritmo Genético (AG)", "method_id": "genetic", "elapsed_ms": 0, "schedule": [], "validation": val, "runs_summary": []}

    runs = max(1, min(int(runs), 10))
    # Keep total time snappy for large instances (I3 ~116 sessions)
    if len(sessions) > 60:
        population_size = min(population_size, 16)
        generations = min(generations, 22)

    runs_summary = []
    best_overall_assign = None
    best_overall_cost = 10**18

    for run_idx in range(runs):
        rt0 = time.perf_counter()
        rng = random.Random(42 + run_idx * 137)

        # Initialize population: mix MRV-seeded + randomized chromosomes
        pop = []
        for p in range(population_size):
            jitter = 0.2 + (p / max(1, population_size)) * 3.0
            ind = _construct_mrv(sessions, domains, rng, jitter=jitter)
            ind = _repair_conflicts(ind, sessions, domains, domains_set, rng, max_steps=15)
            pop.append(ind)

        scored = [(ind, _fast_score(ind, sessions, domains_set, pref_map, weights, orig_slot_map)) for ind in pop]

        for gen in range(generations):
            scored.sort(key=lambda x: x[1][2])
            # Elitism: keep top 2
            new_pop = [list(scored[0][0]), list(scored[1][0])]

            while len(new_pop) < population_size:
                # Tournament selection (size 3)
                p1 = min(rng.sample(scored, min(3, len(scored))), key=lambda x: x[1][2])[0]
                p2 = min(rng.sample(scored, min(3, len(scored))), key=lambda x: x[1][2])[0]

                # Uniform crossover
                child = [p1[i] if rng.random() < 0.5 else p2[i] for i in range(len(sessions))]

                # Mutation
                for i in range(len(sessions)):
                    if rng.random() < mutation_rate:
                        dom = domains[sessions[i]["course_id"]] or TEACHABLE_SLOTS
                        child[i] = rng.choice(dom)

                # Lightweight repair on offspring
                child = _repair_conflicts(child, sessions, domains, domains_set, rng, max_steps=10)
                new_pop.append(child)

            scored = [(ind, _fast_score(ind, sessions, domains_set, pref_map, weights, orig_slot_map)) for ind in new_pop]

        scored.sort(key=lambda x: x[1][2])
        best_ind, (hard_v, soft_v, total_cost) = scored[0]
        run_ms = round((time.perf_counter() - rt0) * 1000, 1)
        runs_summary.append({
            "run": run_idx + 1,
            "hard_violations": hard_v,
            "soft_penalty": soft_v,
            "elapsed_ms": run_ms,
        })
        if total_cost < best_overall_cost:
            best_overall_cost = total_cost
            best_overall_assign = best_ind

    sched = _assign_to_schedule(best_overall_assign, sessions)
    elapsed_ms = round((time.perf_counter() - t0) * 1000, 1)
    validation = validate_schedule(inst, sched, scenario=scenario, original_schedule=original_schedule)

    softs = [r["soft_penalty"] for r in runs_summary]
    hards = [r["hard_violations"] for r in runs_summary]
    return {
        "method": f"Algoritmo Genético ({runs} corridas)",
        "method_id": "genetic",
        "elapsed_ms": elapsed_ms,
        "schedule": sched,
        "validation": validation,
        "runs_summary": runs_summary,
        "runs_stats": {
            "runs": runs,
            "best_soft": min(softs),
            "avg_soft": round(statistics.mean(softs), 1),
            "std_soft": round(statistics.pstdev(softs), 1) if len(softs) > 1 else 0.0,
            "avg_hard": round(statistics.mean(hards), 2),
        },
    }


# ==============================================================================
# R4: BÚSQUEDA LOCAL Y HEURÍSTICA (MRV + Hill Climbing con Reinicios + Reparación)
# ==============================================================================

def solve_local_search(
    raw_instance,
    scenario="C",
    restarts=5,
    max_iterations=180,
    original_schedule=None,
):
    t0 = time.perf_counter()
    inst = normalize_instance(raw_instance)
    weights = SCENARIO_WEIGHTS.get(scenario, SCENARIO_WEIGHTS["C"])
    room_map = _get_course_room_map(inst)
    domains = _get_valid_slots_per_course(inst, room_map)
    domains_set = {k: set(v) for k, v in domains.items()}
    sessions = _build_session_list(inst, room_map)
    pref_map = _extract_pref_map(inst)

    orig_slot_map = None
    if original_schedule:
        orig_slot_map = defaultdict(list)
        for it in original_schedule:
            orig_slot_map[int(it["course_id"])].append(int(it["start_slot"]))

    if not sessions:
        val = validate_schedule(inst, [], scenario=scenario, original_schedule=original_schedule)
        return {"method": "Búsqueda Local (MRV + Hill Climbing)", "method_id": "local_search", "elapsed_ms": 0, "schedule": [], "validation": val}

    restarts = max(1, min(int(restarts), 10))
    if len(sessions) > 60:
        max_iterations = min(max_iterations, 110)

    best_assign = None
    best_cost = 10**18
    restart_logs = []

    for r in range(restarts):
        rng = random.Random(101 + r * 53)
        # Phase 1: MRV constructive + repair
        cur = _construct_mrv(sessions, domains, rng, jitter=0.3 + r * 0.6)
        cur = _repair_conflicts(cur, sessions, domains, domains_set, rng, max_steps=60)
        cur_h, cur_s, cur_cost = _fast_score(cur, sessions, domains_set, pref_map, weights, orig_slot_map)

        # Phase 2: Stochastic Hill Climbing (single-slot moves + pairwise swaps)
        for _ in range(max_iterations):
            idx = rng.randrange(len(sessions))
            si = sessions[idx]
            dom = domains[si["course_id"]] or TEACHABLE_SLOTS
            old_slot = cur[idx]

            # Try a small neighborhood sample of moves
            improved = False
            cand_slots = rng.sample(dom, min(8, len(dom)))
            for ns in cand_slots:
                if ns == old_slot:
                    continue
                cur[idx] = ns
                nh, nsoft, ncost = _fast_score(cur, sessions, domains_set, pref_map, weights, orig_slot_map)
                if ncost < cur_cost:
                    cur_h, cur_s, cur_cost = nh, nsoft, ncost
                    improved = True
                    break
                else:
                    cur[idx] = old_slot

            # Also try swap with another session of same group if move didn't improve
            if not improved and len(sessions) > 1:
                idx2 = rng.randrange(len(sessions))
                if idx2 != idx and sessions[idx2]["group_id"] == si["group_id"]:
                    s1, s2 = cur[idx], cur[idx2]
                    if s2 in domains_set[si["course_id"]] and s1 in domains_set[sessions[idx2]["course_id"]]:
                        cur[idx], cur[idx2] = s2, s1
                        nh, nsoft, ncost = _fast_score(cur, sessions, domains_set, pref_map, weights, orig_slot_map)
                        if ncost < cur_cost:
                            cur_h, cur_s, cur_cost = nh, nsoft, ncost
                        else:
                            cur[idx], cur[idx2] = s1, s2

        restart_logs.append({"restart": r + 1, "hard_violations": cur_h, "soft_penalty": cur_s})
        if cur_cost < best_cost:
            best_cost = cur_cost
            best_assign = list(cur)

    sched = _assign_to_schedule(best_assign, sessions)
    elapsed_ms = round((time.perf_counter() - t0) * 1000, 1)
    validation = validate_schedule(inst, sched, scenario=scenario, original_schedule=original_schedule)

    return {
        "method": "Búsqueda Local (MRV + Hill Climbing)",
        "method_id": "local_search",
        "elapsed_ms": elapsed_ms,
        "schedule": sched,
        "validation": validation,
        "restart_logs": restart_logs,
    }
