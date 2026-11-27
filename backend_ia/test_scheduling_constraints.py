import unittest

from solvers import solve_cpsat, solve_genetic, solve_local_search
from validator import DAYS, SLOTS_PER_DAY, TIME_SLOTS, normalize_instance, validate_schedule


ENGINES = [
    (solve_cpsat, {"time_limit_sec": 1}),
    (solve_genetic, {"runs": 1, "population_size": 4, "generations": 4}),
    (solve_local_search, {"restarts": 1, "max_iterations": 8}),
]


def make_instance():
    return {
        "teachers": [{"id": 1, "name": "Docente de prueba"}],
        "rooms": [{"id": 1, "group_id": 1, "capacity": 35, "type": "lab"}],
        "courses": [
            {
                "id": 1, "teacher_id": 1, "group_id": 1, "weekly_sessions": 2,
                "students": 35, "requires_lab": True,
            }
        ],
    }


class SchedulingConstraintsTest(unittest.TestCase):
    def test_validator_rejects_invalid_rooms(self):
        for room_id, overrides in [
            (999, {}),
            (1, {"capacity": 0}),
            (1, {"capacity": 10}),
            (1, {"type": "aula"}),
            (1, {"allowed_hours": [5]}),
            (1, {"allowed_hours": []}),
        ]:
            with self.subTest(room_id=room_id, overrides=overrides):
                instance = make_instance()
                instance["rooms"][0].update(overrides)
                schedule = [
                    {"course_id": 1, "room_id": room_id, "start_slot": slot}
                    for slot in (0, 1)
                ]
                result = validate_schedule(instance, schedule)
                self.assertFalse(result["feasible"])
                self.assertEqual(result["hard_violations"]["room_assignment"], 2)

    def test_engines_reject_ineligible_room_and_use_eligible_alternative(self):
        for solve, options in ENGINES:
            with self.subTest(engine=solve.__name__):
                instance = make_instance()
                instance["rooms"][0]["capacity"] = 10
                instance["rooms"].append({"id": 2, "group_id": 2, "capacity": 40, "type": "lab"})
                impossible = solve(instance, **options)
                self.assertFalse(impossible["validation"]["feasible"])
                self.assertEqual(impossible["schedule"], [])
                instance["rooms"].append({"id": 3, "capacity": 35, "type": "lab", "allowed_hours": [0]})
                feasible = solve(instance, **options)
                self.assertTrue(feasible["validation"]["feasible"])
                self.assertEqual({s["room_id"] for s in feasible["schedule"]}, {3})
                self.assertTrue(all(s["start_slot"] % SLOTS_PER_DAY == 0 for s in feasible["schedule"]))

    def test_empty_and_explicitly_unavailable_matrices_differ(self):
        instance = make_instance()
        instance["teachers"][0]["availability"] = {DAYS[0]: {}}
        self.assertFalse(normalize_instance(instance)["teacher_unavailable"])
        instance["teachers"][0]["availability"][DAYS[0]][TIME_SLOTS[0]] = False
        blocked = solve_cpsat(instance, time_limit_sec=1)
        self.assertFalse(blocked["validation"]["feasible"])
        self.assertGreater(blocked["validation"]["hard_violations"]["availability"], 0)

    def test_engines_and_validator_enforce_mandatory_daily_limit(self):
        instance = make_instance()
        instance["preferences"] = [
            {"hard": True, "teacher_id": 1, "type": "max_daily_hours", "max_hours": 1}
        ]
        invalid = [
            {"course_id": 1, "room_id": 1, "start_slot": slot}
            for slot in (0, 1)
        ]
        validation = validate_schedule(instance, invalid)
        self.assertFalse(validation["feasible"])
        self.assertEqual(validation["hard_violations"]["teacher_daily_limit"], 1)
        for solve, options in ENGINES:
            with self.subTest(engine=solve.__name__):
                result = solve(instance, **options)
                self.assertTrue(result["validation"]["feasible"])
                self.assertEqual(len({s["start_slot"] // SLOTS_PER_DAY for s in result["schedule"]}), 2)

    def test_multi_teacher_course_rebalances_to_available_candidate(self):
        instance = {
            "teachers": [
                {"id": 1, "name": "Docente saturado", "availability": {DAYS[0]: {TIME_SLOTS[0]: True}}},
                {"id": 2, "name": "Docente respaldo", "availability": {DAYS[0]: {TIME_SLOTS[0]: True, TIME_SLOTS[1]: True, TIME_SLOTS[2]: True}}},
            ],
            "rooms": [{"id": 101, "group_id": 101, "capacity": 35, "type": "aula"}],
            "courses": [
                {"id": 10, "name": "Fundamentos de IA", "teacher_id": 1, "teacher_ids": [1, 2], "group_id": 101, "weekly_sessions": 3, "students": 30}
            ],
        }
        norm = normalize_instance(instance)
        self.assertEqual(norm["courses"][0]["teacher_id"], 2)
        res = solve_cpsat(instance, time_limit_sec=1)
        self.assertTrue(res["validation"]["feasible"])

    def test_reschedule_supports_multiple_days_and_specific_hours(self):
        import cli

        instance = make_instance()
        instance["rooms"][0]["type"] = "lab"
        instance["courses"][0]["weekly_sessions"] = 3
        base = solve_cpsat(instance, time_limit_sec=1)
        self.assertTrue(base["validation"]["feasible"])
        # Block Monday, Tuesday and Wednesday morning hours [0, 1, 2, 3]
        res = cli.handle_action({
            "action": "reschedule",
            "instance": instance,
            "original_schedule": base["schedule"],
            "teacher_id": 1,
            "days": [0, 1, 2],
            "hours": [0, 1, 2, 3],
            "time_limit_sec": 2.0,
        })
        self.assertTrue(res["validation"]["feasible"])
        blocked = {d * SLOTS_PER_DAY + h for d in (0, 1, 2) for h in (0, 1, 2, 3)}
        self.assertTrue(all(s["start_slot"] not in blocked for s in res["schedule"]))

    def test_upv_planeacion_excel_import_tolerates_typos_and_auto_assigns(self):
        import base64
        import io
        from openpyxl import Workbook
        from excel_io import import_excel_b64

        wb = Workbook()
        ws_fmt = wb.active
        ws_fmt.title = "FormatoDispProfesores"
        ws_fmt.append([None, "DOCENTE", "DIA", "HORA"])
        for d in ("Lunes", "Martes", "Mierccoles", "Jueves", "Viernes"):
            for h in ("7:00-7:55", "7:55-8:50", "8:50-9:45"):
                ws_fmt.append([None, "Humberto", d, h])

        ws_as = wb.create_sheet("AsignaturasxDocente")
        ws_as.append([None, "DOCENTE", "PRIORIDAD", "ASIGNATURA", "CUATRIMESTRE"])
        ws_as.append([None, "Humberto", 1, "APLICACIONES WEB", 4])

        ws_m = wb.create_sheet("Matriz ")
        ws_m.append([None, "Grupos", "Alumnos estimados", "Horas x materia", "Horas x Semana"])
        ws_m.append(["ITIID 4-1"])
        ws_m.append(["APLICACIONES WEB", None, 30, 5, 5])

        buf = io.BytesIO()
        wb.save(buf)
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")
        res = import_excel_b64(b64, "test_upv.xlsx")
        self.assertEqual(res.get("format_detected"), "UPV_PLANEACION")
        inst = res["instance"]
        self.assertEqual(len(inst["rooms"]), 1)
        self.assertEqual(len(inst["courses"]), 1)
        self.assertEqual(inst["courses"][0]["teacher_id"], inst["teachers"][0]["id"])
        solved = solve_cpsat(inst, time_limit_sec=2)
        self.assertTrue(solved["validation"]["feasible"])

    def test_total_teacher_absence_reassigns_to_backup_candidate(self):
        import cli

        instance = {
            "teachers": [
                {"id": 1, "name": "Titular Ausente"},
                {"id": 2, "name": "Suplente Disponible"},
            ],
            "rooms": [{"id": 401, "group_id": 401, "capacity": 35, "type": "aula"}],
            "courses": [
                {
                    "id": 25, "name": "Aplicaciones Web", "teacher_id": 1, "teacher_ids": [1, 2],
                    "group_id": 401, "weekly_sessions": 4, "students": 30,
                }
            ],
        }
        base = solve_cpsat(instance, time_limit_sec=1)
        self.assertTrue(base["validation"]["feasible"])
        full_week_block = [
            {"teacher_id": 1, "slot_id": d * SLOTS_PER_DAY + h}
            for d in range(5) for h in (0, 1, 2, 3, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16)
        ]
        res = cli.handle_action({
            "action": "reschedule",
            "instance": instance,
            "original_schedule": base["schedule"],
            "new_constraints": full_week_block,
            "time_limit_sec": 2.0,
        })
        self.assertTrue(res["validation"]["feasible"])
        self.assertEqual(res["patched_instance"]["courses"][0]["teacher_id"], 2)
        self.assertTrue(res.get("reassigned_teachers"))

    def test_exclude_teacher_whole_quarter_and_single_course_ene_abr(self):
        import cli
        from instances import get_instance

        inst = get_instance("ITIID_ENE_ABR_2027")
        # 1) Exclude Fide (id=6) from ONLY 8-1 Programacion para IA (id=8103)
        res_one = cli.handle_action({
            "action": "reschedule",
            "instance": inst,
            "exclude_course_assignments": [{"teacher_id": 6, "course_id": 8103}],
            "time_limit_sec": 4.0,
        })
        self.assertTrue(res_one["validation"]["feasible"])
        c8103 = next(c for c in res_one["patched_instance"]["courses"] if c["id"] == 8103)
        c5106 = next(c for c in res_one["patched_instance"]["courses"] if c["id"] == 5106)
        self.assertNotEqual(c8103["teacher_id"], 6)
        self.assertEqual(c5106["teacher_id"], 6)

        # 2) Exclude Fide (id=6) from the ENTIRE quarter (0 courses anywhere, including 8-1 and 5-1)
        res_all = cli.handle_action({
            "action": "reschedule",
            "instance": inst,
            "exclude_teachers": [6],
            "time_limit_sec": 4.0,
        })
        self.assertTrue(res_all["validation"]["feasible"])
        fide_courses = [c for c in res_all["patched_instance"]["courses"] if c["teacher_id"] == 6]
        self.assertEqual(fide_courses, [])

    def test_exclude_teacher_without_backup_leaves_unassigned_never_excluded_teacher(self):
        import cli

        inst = make_instance()
        inst["rooms"][0]["type"] = "lab"
        res = cli.handle_action({
            "action": "reschedule",
            "instance": inst,
            "exclude_teachers": [1],
            "time_limit_sec": 2.0,
        })
        self.assertTrue(res["validation"]["feasible"])
        self.assertEqual(res["patched_instance"]["courses"][0]["teacher_id"], 0)
        self.assertEqual(len(res.get("unassigned_courses") or []), 1)

    def test_exclude_teacher_discovers_sibling_subject_backup_in_itiid_2026(self):
        import cli
        from instances import get_instance

        inst = get_instance("ITIID_2026")
        res = cli.handle_action({
            "action": "reschedule",
            "instance": inst,
            "exclude_teachers": [6],
            "time_limit_sec": 4.0,
        })
        self.assertTrue(res["validation"]["feasible"])
        c7203 = next(c for c in res["patched_instance"]["courses"] if c["id"] == 7203)
        self.assertEqual(c7203["teacher_id"], 2)


if __name__ == "__main__":
    unittest.main()
