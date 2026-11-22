import json
import sys
import traceback
import time

from instances import get_instance, anonymize_instance
from validator import validate_schedule, normalize_instance, TEACHABLE_HOURS, SLOTS_PER_DAY
from solvers import solve_cpsat, solve_genetic, solve_local_search
from excel_io import export_schedule_excel_b64, export_template_excel_b64, import_excel_b64
from llm_service import (
    GOLD_PREFERENCES_DATASET,
    extract_preferences,
    evaluate_extractor_f1,
    llm_direct_schedule,
    explain_conflicts,
    parse_change_request,
)


def handle_action(payload):
    action = payload.get("action")
    scenario = payload.get("scenario", "C")
    instance = payload.get("instance")

    if action == "instance":
        inst_id = payload.get("instance_id", "I2")
        return {"instance": get_instance(inst_id)}

    if action == "anonymize":
        anon, mapping = anonymize_instance(instance or {})
        return {"anonymized": anon, "mapping": mapping}

    if action == "validate":
        schedule = payload.get("schedule", [])
        orig = payload.get("original_schedule")
        return {"validation": validate_schedule(instance, schedule, scenario=scenario, original_schedule=orig)}

    if action == "solve":
        method = payload.get("method", "cpsat")
        orig = payload.get("original_schedule")
        if method == "cpsat":
            return solve_cpsat(
                instance,
                scenario=scenario,
                time_limit_sec=float(payload.get("time_limit_sec", 6.0)),
                original_schedule=orig,
            )
        if method == "genetic":
            return solve_genetic(
                instance,
                scenario=scenario,
                runs=int(payload.get("runs", 10)),
                population_size=int(payload.get("population_size", 24)),
                generations=int(payload.get("generations", 35)),
                mutation_rate=float(payload.get("mutation_rate", 0.12)),
                original_schedule=orig,
            )
        if method == "local_search":
            return solve_local_search(
                instance,
                scenario=scenario,
                restarts=int(payload.get("restarts", 5)),
                max_iterations=int(payload.get("max_iterations", 180)),
                original_schedule=orig,
            )
        return {"error": f"Método no soportado: {method}"}

    if action == "reschedule":
        # I4: Given an original schedule + added constraints (e.g. teacher unavailable Wednesday),
        # re-solve with CP-SAT minimizing moved sessions.
        orig = payload.get("original_schedule")
        if not orig:
            base = solve_cpsat(instance, scenario=scenario, time_limit_sec=4.0)
            orig = base["schedule"]
        # Apply new constraints
        patched = json.loads(json.dumps(instance))
        extra_constraints = payload.get("new_constraints") or []
        if not extra_constraints and payload.get("teacher_id") is not None and payload.get("day") is not None:
            tid = int(payload["teacher_id"])
            day = int(payload["day"])
            for h in TEACHABLE_HOURS:
                extra_constraints.append({"teacher_id": tid, "slot_id": day * SLOTS_PER_DAY + h})
        patched.setdefault("constraints", []).extend(extra_constraints)

        res = solve_cpsat(patched, scenario=scenario, time_limit_sec=float(payload.get("time_limit_sec", 6.0)), original_schedule=orig)
        res["original_schedule"] = orig
        res["original_validation"] = validate_schedule(instance, orig, scenario=scenario)
        res["patched_instance"] = patched
        return res

    if action == "benchmark":
        # Run ALL methods on the same instance & same official validator (P1 + P3)
        ag_runs = int(payload.get("ag_runs", 10))
        llm_config = payload.get("llm_config")
        results = []

        # 1) Horario manual de referencia (if available on instance, e.g. I2)
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

        # 2) CP-SAT (R2)
        res_cp = solve_cpsat(instance, scenario=scenario, time_limit_sec=float(payload.get("time_limit_sec", 5.0)))
        res_cp["role"] = "R2"
        results.append(res_cp)

        # 3) Algoritmo Genético (R3 - 10 corridas)
        res_ag = solve_genetic(instance, scenario=scenario, runs=ag_runs)
        res_ag["role"] = "R3"
        results.append(res_ag)

        # 4) Búsqueda Local (R4 - MRV + Hill Climbing)
        res_bl = solve_local_search(instance, scenario=scenario, restarts=5)
        res_bl["role"] = "R4"
        results.append(res_bl)

        # 5) LLM Directo sin correcciones (R6 - P1)
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

        # 6) LLM Directo con 1 ronda de corrección del validador (R6 - P1)
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

        # Leaderboard rule from PDF: 1) fewest hard violations (0 wins), 2) lowest soft penalty, 3) fastest time
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
        return extract_preferences(payload.get("text", ""), raw_instance=instance, llm_config=payload.get("llm_config"))

    if action == "llm_eval_f1":
        return evaluate_extractor_f1(llm_config=payload.get("llm_config"))

    if action == "llm_gold_dataset":
        return {"dataset": GOLD_PREFERENCES_DATASET}

    if action == "llm_explain":
        return explain_conflicts(payload.get("validation", {}), raw_instance=instance, llm_config=payload.get("llm_config"))

    if action == "llm_direct_schedule":
        return llm_direct_schedule(
            instance,
            scenario=scenario,
            llm_config=payload.get("llm_config"),
            with_validator_retry=bool(payload.get("with_validator_retry", False)),
        )

    if action == "llm_parse_change":
        return parse_change_request(payload.get("text", ""), raw_instance=instance, llm_config=payload.get("llm_config"))

    if action == "excel_export":
        b64 = export_schedule_excel_b64(instance, payload.get("schedule", []), payload.get("validation"))
        return {"file_b64": b64, "filename": f"Sabana_Horarios_ITIID_{scenario}.xlsx"}

    if action == "excel_template":
        b64 = export_template_excel_b64()
        return {"file_b64": b64, "filename": "Plantilla_ITIID_IA.xlsx"}

    if action == "excel_import":
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
