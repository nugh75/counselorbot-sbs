from backend.tests import test_qsa_counselor_prompt_battery as battery


def test_battery_selects_qsa_counselors_without_hiding_their_capacity_warnings(monkeypatch):
    def row(cid, warning):
        return dict(counselor_id=cid, provider='test', model='test', step_id='intro', step_label='Intro', prompt_key='prompt_intro', warnings=[{'code': warning}])
    rows = [row(1, 'unknown_context_capacity'), row(2, 'counselor_instrument_mismatch')]
    calls = []
    def post(path, payload, *args, **kwargs):
        calls.append(payload)
        ids = payload.get('counselor_ids', [1, 2])
        return {'rows': [r for r in rows if r['counselor_id'] in ids]}
    monkeypatch.setattr(battery, '_post', post)
    steps, counselors = battery.discover('test')
    assert [c['id'] for c in counselors] == [1]
    result = battery.run_static_prompt_battery('test', steps, counselors, [])
    assert calls[-1]['counselor_ids'] == [1]
    assert result['warned_cells'][0]['warnings'][0]['code'] == 'unknown_context_capacity'
