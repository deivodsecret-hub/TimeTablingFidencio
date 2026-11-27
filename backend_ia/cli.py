import json
import sys
import traceback
import time


def _sync_reassigned_courses(raw_inst):
    """If normalize_instance rebalanced or unassigned courses, sync updated teacher_id/teacher_ids back to raw_inst."""
    from validator import normalize_instance
    norm = normalize_instance(raw_inst)
    reassigned = norm.get("reassigned") or []
    unassigned = norm.get("unassigned_courses") or []
    if not reassigned and not unassigned:
        return raw_inst, [], []
    patched = json.loads(json.dumps(raw_inst))
    t_names = {int(t["id"]): t.get("name", f"Docente {t['id']}") for t in patched.get("teachers", [])}
    norm_by_cid = {c["id"]: c for c in norm["courses"]}
    for c in patched.get("courses", []):
        nc = norm_by_cid.get(int(c["id"]))
        if nc is not None:
            c["teacher_id"] = nc["teacher_id"]
            c["teacher_ids"] = list(nc.get("teacher_ids") or [])
    readable_reassigned = [
        {
            **r,
            "from_teacher_name": t_names.get(r["from_teacher_id"], str(r["from_teacher_id"])),
            "to_teacher_name": t_names.get(r["to_teacher_id"], str(r["to_teacher_id"])),
        }
        for r in reassigned
    ]
    readable_unassigned = [
        {
            **u,
            "from_teacher_name": t_names.get(u["from_teacher_id"], str(u["from_teacher_id"])),
        }
        for u in unassigned
    ]
    return patched, readable_reassigned, readable_unassigned


def handle_action(payload):
    action = payload.get("action")
    scenario = payload.get("scenario", "C")
    instance = payload.get("instance")

    if action == "llm_status":
        from llm_service import check_ollama_status
        cfg = payload.get("llm_config") or {}
        return check_ollama_status(cfg.get("base_url") or "http://127.0.0.1:11434")

    if action == "instance":
        from instances import get_instance
        inst_id = payload.get("instance_id", "I2")
        return {"instance": get_instance(inst_id)}

    if action == "anonymize":
        from instances import anonymize_instance
        anon, mapping = anonymize_instance(instance or {})
        return {"anonymized": anon, "mapping": mapping}

    if action == "validate":
        from validator import validate_schedule
        schedule = payload.get("schedule", [])
        orig = payload.get("original_schedule")
        return {"validation": validate_schedule(instance, schedule, scenario=scenario, original_schedule=orig)}

    if action == "solve":
        method = payload.get("method", "cpsat")
        orig = payload.get("original_schedule")
        if method == "llm_local":
            from llm_service import llm_direct_schedule
            res = llm_direct_schedule(
                instance,
                scenario=scenario,
                llm_config=payload.get("llm_config") or {"provider": "ollama"},
                with_validator_retry=bool(payload.get("with_validator_retry", True)),
            )
            return {
                "method": f"LLM Local ({res.get('provider_used', 'ollama')})",
                "method_id": "llm_local",
                "elapsed_ms": res.get("elapsed_ms", 0),
                "schedule": res.get("schedule", []),
                "validation": res.get("validation"),
                "provider_used": res.get("provider_used"),
                "warning": res.get("warning"),
            }
        from solvers import solve_cpsat, solve_genetic, solve_local_search
        synced_inst, reassigned, unassigned = _sync_reassigned_courses(instance)
        if method == "cpsat":
            res = solve_cpsat(
                synced_inst,
                scenario=scenario,
                time_limit_sec=float(payload.get("time_limit_sec", 15.0)),
                original_schedule=orig,
            )
        elif method == "genetic":
            res = solve_genetic(
                synced_inst,
                scenario=scenario,
                runs=int(payload.get("runs", 10)),
                population_size=int(payload.get("population_size", 24)),
                generations=int(payload.get("generations", 35)),
                mutation_rate=float(payload.get("mutation_rate", 0.12)),
                original_schedule=orig,
            )
        elif method == "local_search":
            res = solve_local_search(
                synced_inst,
                scenario=scenario,
                restarts=int(payload.get("restarts", 5)),
                max_iterations=int(payload.get("max_iterations", 180)),
                original_schedule=orig,
            )
        else:
            return {"error": f"Método no soportado: {method}"}
        if reassigned:
            res["reassigned_teachers"] = reassigned
        if unassigned:
            res["unassigned_courses"] = unassigned
        if reassigned or unassigned:
            res["patched_instance"] = synced_inst
        return res

    if action == "reschedule":
        from solvers import solve_cpsat
        from validator import validate_schedule, TEACHABLE_HOURS, SLOTS_PER_DAY
        orig = payload.get("original_schedule")
        if not orig:
            base = solve_cpsat(instance, scenario=scenario, time_limit_sec=4.0)
            orig = base["schedule"]
        patched = json.loads(json.dumps(instance))
        extra_constraints = list(payload.get("new_constraints") or [])
        if not extra_constraints and payload.get("teacher_id") is not None and not payload.get("exclude_teachers") and not payload.get("exclude_course_assignments"):
            tid = int(payload["teacher_id"])
            raw_days = payload.get("days")
            if raw_days is None and payload.get("day") is not None:
                raw_days = [payload["day"]]
            days_list = [int(d) for d in (raw_days or []) if 0 <= int(d) < 5]
            raw_hours = payload.get("hours")
            hours_list = [int(h) for h in raw_hours if int(h) in TEACHABLE_HOURS] if raw_hours else list(TEACHABLE_HOURS)
            for day in days_list:
                for h in hours_list:
                    extra_constraints.append({"teacher_id": tid, "slot_id": day * SLOTS_PER_DAY + h})
        existing = {(int(c["teacher_id"]), int(c["slot_id"])) for c in patched.get("constraints", []) if "teacher_id" in c and "slot_id" in c}
        for c in extra_constraints:
            key = (int(c["teacher_id"]), int(c["slot_id"]))
            if key not in existing:
                existing.add(key)
                patched.setdefault("constraints", []).append({"teacher_id": key[0], "slot_id": key[1]})

        # Teacher whole-quarter exclusions and per-course exclusions
        excl_t = {int(t) for t in (patched.get("excluded_teachers") or []) if int(t) > 0}
        for t in (payload.get("exclude_teachers") or []):
            if int(t) > 0:
                excl_t.add(int(t))
        if excl_t:
            patched["excluded_teachers"] = sorted(excl_t)

        excl_c = list(patched.get("teacher_course_exclusions") or [])
        seen_ec = {(int(e.get("teacher_id") or 0), e.get("course_id"), e.get("course_name")) for e in excl_c}
        for e in (payload.get("exclude_course_assignments") or []):
            etid = int(e.get("teacher_id") or 0)
            if etid <= 0:
                continue
            item = {"teacher_id": etid}
            if e.get("course_id") not in (None, ""):
                item["course_id"] = int(e["course_id"])
            if e.get("course_name"):
                item["course_name"] = str(e["course_name"])
            k = (etid, item.get("course_id"), item.get("course_name"))
            if k not in seen_ec:
                seen_ec.add(k)
                excl_c.append(item)
        if excl_c:
            patched["teacher_course_exclusions"] = excl_c

        synced_patched, reassigned, unassigned = _sync_reassigned_courses(patched)
        res = solve_cpsat(synced_patched, scenario=scenario, time_limit_sec=float(payload.get("time_limit_sec", 10.0)), original_schedule=orig)
        res["original_schedule"] = orig
        res["original_validation"] = validate_schedule(instance, orig, scenario=scenario)
        res["patched_instance"] = synced_patched
        if reassigned:
            res["reassigned_teachers"] = reassigned
        if unassigned:
            res["unassigned_courses"] = unassigned
        return res

    if action == "benchmark":
        from solvers import solve_cpsat, solve_genetic, solve_local_search
        from validator import validate_schedule
        from llm_service import llm_direct_schedule
        ag_runs = int(payload.get("ag_runs", 10))
        llm_config = payload.get("llm_config")
        results = []

        if instance.get("manual_schedule"):
            t0 = time.perf_counter()
            val_m = validate_schedule(instance, instance["manual_schedule"], scenario=scenario)
            results.append({
                "method": "Horario Manual (Coordinación)",
                "method_id": "manual",
                "role": "Referencia",
                "elapsed_ms": round((time.perf_counter() - t0) * 1000, 1),
                "validation": val_m,
                "schedule": instance["manual_schedule"],
            })

        res_cp = solve_cpsat(instance, scenario=scenario, time_limit_sec=float(payload.get("time_limit_sec", 5.0)))
        res_cp["role"] = "R2"
        results.append(res_cp)

        res_ag = solve_genetic(instance, scenario=scenario, runs=ag_runs)
        res_ag["role"] = "R3"
        results.append(res_ag)

        res_bl = solve_local_search(instance, scenario=scenario, restarts=5)
        res_bl["role"] = "R4"
        results.append(res_bl)

        t0 = time.perf_counter()
        res_llm = llm_direct_schedule(instance, scenario=scenario, llm_config=llm_config, with_validator_retry=False)
        results.append({
            "method": "LLM Directo (sin validador)",
            "method_id": "llm_direct",
            "role": "R6 (P1)",
            "elapsed_ms": round((time.perf_counter() - t0) * 1000, 1),
            "validation": res_llm["validation"],
            "schedule": res_llm["schedule"],
            "provider_used": res_llm.get("provider_used"),
        })

        t0 = time.perf_counter()
        res_llm_fix = llm_direct_schedule(instance, scenario=scenario, llm_config=llm_config, with_validator_retry=True)
        results.append({
            "method": "LLM Directo + Corrección Validador",
            "method_id": "llm_retry",
            "role": "R6 (P1)",
            "elapsed_ms": round((time.perf_counter() - t0) * 1000, 1),
            "validation": res_llm_fix["validation"],
            "schedule": res_llm_fix["schedule"],
            "provider_used": res_llm_fix.get("provider_used"),
        })

        leaderboard = sorted(
            results,
            key=lambda r: (
                r["validation"]["hard_violations"]["total"],
                r["validation"]["soft_penalty"],
                r["elapsed_ms"],
            ),
        )
        for rank, row in enumerate(leaderboard, start=1):
            row["rank"] = rank

        return {
            "instance_name": instance.get("name", "Instancia"),
            "scenario": scenario,
            "leaderboard": leaderboard,
        }

    if action == "llm_extract":
        from llm_service import extract_preferences
        return extract_preferences(payload.get("text", ""), raw_instance=instance, llm_config=payload.get("llm_config"))

    if action == "llm_eval_f1":
        from llm_service import evaluate_extractor_f1
        return evaluate_extractor_f1(llm_config=payload.get("llm_config"))

    if action == "llm_gold_dataset":
        from llm_service import GOLD_PREFERENCES_DATASET
        return {"dataset": GOLD_PREFERENCES_DATASET}

    if action == "llm_explain":
        from llm_service import explain_conflicts
        return explain_conflicts(payload.get("validation", {}), raw_instance=instance, llm_config=payload.get("llm_config"))

    if action == "llm_direct_schedule":
        from llm_service import llm_direct_schedule
        return llm_direct_schedule(
            instance,
            scenario=scenario,
            llm_config=payload.get("llm_config"),
            with_validator_retry=bool(payload.get("with_validator_retry", False)),
        )

    if action == "llm_parse_change":
        from llm_service import parse_change_request
        return parse_change_request(payload.get("text", ""), raw_instance=instance, llm_config=payload.get("llm_config"))

    if action == "excel_export":
        from excel_io import export_schedule_excel_b64
        b64 = export_schedule_excel_b64(instance, payload.get("schedule", []), payload.get("validation"))
        return {"file_b64": b64, "filename": f"Sabana_Horarios_ITIID_{scenario}.xlsx"}

    if action == "excel_template":
        from excel_io import export_template_excel_b64
        b64 = export_template_excel_b64()
        return {"file_b64": b64, "filename": "Plantilla_ITIID_IA.xlsx"}

    if action == "excel_import":
        from excel_io import import_excel_b64
        return import_excel_b64(payload.get("file_b64", ""), filename=payload.get("filename", "plantilla.xlsx"))

    return {"error": f"Acción desconocida: {action}"}


def main():
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw) if raw.strip() else {}
        result = handle_action(payload)
        sys.stdout.write(json.dumps(result, ensure_ascii=False))
        sys.stdout.flush()
    except Exception as exc:
        sys.stderr.write(traceback.format_exc())
        sys.stdout.write(json.dumps({"error": str(exc)}, ensure_ascii=False))
        sys.stdout.flush()
        sys.exit(1)


if __name__ == "__main__":
    main()
