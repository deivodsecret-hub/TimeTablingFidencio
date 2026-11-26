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
