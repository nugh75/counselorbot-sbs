import json
from types import SimpleNamespace

from backend.prompt_lab.context_comparison import compare, fixed_steps


def test_fixed_set_keeps_three_phases_for_each_instrument():
    rows = [SimpleNamespace(questionnaire_type=instrument, id=f"{instrument}-{i}", sort_order=i)
            for instrument in ("QSA", "IDEA", "QAP") for i in range(8)]
    selected = fixed_steps(reversed(rows))
    assert [row.id for row in selected] == [f"{instrument}-{i}" for instrument in ("IDEA", "QAP", "QSA") for i in (0, 4, 7)]


class Client:
    def __init__(self): self.calls = 0
    def digests(self): return {"large": "fixed-large", "small": "fixed-small"}
    def chat(self, preset, system, user, history=(), **kwargs):
        self.calls += 1
        if "PROMPT LAB JUDGE" in system:
            valid = "Hai ottenuto 9/9" not in user
            return json.dumps({"goals": [{"ok": valid}, {"ok": valid}], "critical_ok": valid})
        return "Quale momento del pomeriggio vuoi organizzare?"


def case():
    return {"instrument": "IDEA", "step": "idea", "language": "it", "system": "instructions",
            "message": "test", "history": [], "context_data": {}, "max_tokens": 100,
            "profile_context": "No scores", "expected": "one question"}


def test_comparison_records_every_model_and_arm_without_activation():
    result = compare([case()], ["large", "small"], Client())
    assert result["calibrated"] and len(result["records"]) == 4
    assert all(row["quality_status"] == "passed" for row in result["records"])
    assert all(row["invented_data"] is False for row in result["records"])
    assert all("input_hash" in row and "blocks" in row["context"] for row in result["records"])


def test_timeout_budget_keeps_all_missing_answers_in_denominator():
    result = compare([case()], ["large", "small"], Client(), max_seconds=-1)
    assert len(result["records"]) == 4
    assert all(row["error"] == "EvaluationTimeLimit" for row in result["records"])
    assert all(row["quality_status"] == "inconclusive" for row in result["records"])


def test_model_change_invalidates_otherwise_passing_comparison():
    class ChangedClient(Client):
        def digests(self):
            return {"large": "changed" if self.calls else "fixed-large", "small": "fixed-small"}
    result = compare([case()], ["large", "small"], ChangedClient())
    assert not result["model_identity_stable"]
    assert all(row["quality_status"] == "inconclusive" for row in result["records"])
