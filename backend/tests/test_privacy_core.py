"""P1 contracts, fail-closed defaults and synthetic log-leakage regressions.

The core must work without any database or provider, under either TEST_DB.
"""
from __future__ import annotations

import dataclasses
import inspect
import json
import subprocess
import sys
import traceback
from typing import Iterator, Literal, Mapping, Sequence, get_args, get_type_hints

import pytest

from backend import privacy as p


SENSITIVE = "Giulia Rossi giulia.rossi@example.test RSSGLI00A01H501Z"
CTX = p.PrivacyContext(
    p.Principal(SENSITIVE, p.PrivacyRole.STUDENT, "local", "local", SENSITIVE),
    SENSITIVE, p.PrivacyPurpose.GUIDED_CHAT, SENSITIVE, "it",
)
TARGET = p.Target("ollama", "synthetic-model", "203.0.113.9")
REQUEST = p.AIRequest("chat", TARGET, [SENSITIVE], attachments_context=[SENSITIVE])
FIELD = p.FieldRef(SENSITIVE, SENSITIVE, SENSITIVE, SENSITIVE)
RESOURCE = p.ResourceRef("conversation", SENSITIVE, SENSITIVE)
EVENT = p.PrivacyEvent(SENSITIVE, SENSITIVE, p.PrivacyRole.STUDENT, "ai_transmission", SENSITIVE)
ERRORS = [
    p.PrivacyError, p.PIIDetectorUnavailable, p.KeyUnavailable, p.IntegrityError,
    p.ConsentMissingError, p.PurposeDisabledError, p.EgressBlockedError,
    p.PolicyBlocked, p.ResidualPII, p.AccessDenied, p.AuditUnavailable,
]


def enabled_policy(**kwargs):
    return p.PurposePolicy(CTX.purpose, active=True, legal_basis=p.LegalBasis.PUBLIC_TASK,
                           requires_consent=False, **kwargs)


def test_public_api_and_design_aliases():
    assert len(p.__all__) == len(set(p.__all__))
    assert all(hasattr(p, name) for name in p.__all__)
    assert p.Category is p.PIICategory
    assert p.Span is p.PIISpan
    assert p.DetectorUnavailable is p.PIIDetectorUnavailable
    assert p.PurposeDisabled is p.PurposeDisabledError
    assert p.restore_authorized is p.depseudonymize


@pytest.mark.parametrize("enum,values", [
    (p.PIICategory, {"person", "email", "phone", "address", "city", "region", "school",
                     "organization", "fiscal_code", "iban", "id_document", "student_id",
                     "birth_date", "date", "url", "ip", "social", "health", "art9_other", "combination"}),
    (p.PrivacyRole, {"student", "teacher", "researcher", "admin", "system"}),
    (p.TreatmentMode, {"pseudonymization", "redaction", "encryption"}),
    (p.SensitivityLevel, {"public", "personal", "special_category"}),
    (p.PrivacyPurpose, {"guided_chat", "teacher_noticing", "teaching", "orientation", "research"}),
])
def test_wire_vocabulary(enum, values):
    assert {item.value for item in enum} == values
    for item in enum:
        assert enum(json.loads(json.dumps(item))) is item


@pytest.mark.parametrize("error_type", ERRORS)
def test_errors_discard_sensitive_arguments_and_notes(error_type):
    assert issubclass(error_type, p.PrivacyError)
    error = error_type(SENSITIVE, {SENSITIVE: SENSITIVE}, code=SENSITIVE, details=SENSITIVE)
    error.add_note(SENSITIVE)
    assert error.args == (error_type.code,)
    assert vars(error) == {}
    assert str(error) == error_type.code
    for diagnostic in (str(error), repr(error), repr(error.args), "".join(traceback.format_exception_only(type(error), error))):
        assert SENSITIVE not in diagnostic
        assert error_type.code in diagnostic
    assert not getattr(error, "__notes__", ())


def test_specific_errors_have_distinct_i18n_codes():
    codes = [error.code for error in ERRORS]
    assert len(codes) == len(set(codes))
    assert all(code.startswith("privacy.errors.") for code in codes)


def test_exception_arguments_are_never_formatted():
    class UnsafeDiagnostic:
        def __repr__(self):
            raise AssertionError("argument repr called")

        def __str__(self):
            raise AssertionError("argument str called")

    error = p.PrivacyError(UnsafeDiagnostic(), details=UnsafeDiagnostic())
    assert str(error) == p.PrivacyError.code
    assert p.PrivacyError.code in repr(error)


@pytest.mark.parametrize("error_type", ERRORS)
def test_standard_traceback_hides_sensitive_implicit_exception_context(error_type):
    try:
        try:
            raise ValueError(SENSITIVE)
        except ValueError:
            raise error_type(SENSITIVE)
    except p.PrivacyError as error:
        rendered = "".join(traceback.format_exception(type(error), error, error.__traceback__))
        assert SENSITIVE not in rendered
        assert error_type.code in rendered


SAFE_OBJECTS = [
    CTX.principal, CTX, p.PIISpan(0, 5, p.PIICategory.PERSON, SENSITIVE, .9,
                                text_hash=SENSITIVE),
    p.PseudonymMap(SENSITIVE, {SENSITIVE: SENSITIVE}),
    p.PseudonymizedBatch([SENSITIVE], SENSITIVE, {p.PIICategory.PERSON: 1}),
    p.CategoryPolicy({SENSITIVE: SENSITIVE}), p.PurposePolicy(SENSITIVE), FIELD,
    p.SealedValue(SENSITIVE), RESOURCE, p.Decision(False, SENSITIVE, SENSITIVE),
    EVENT, p.Target(SENSITIVE, SENSITIVE, SENSITIVE),
    p.AIRequest("vision", TARGET, [SENSITIVE], [SENSITIVE.encode()], SENSITIVE.encode(), [SENSITIVE]),
    p.AIResponse(SENSITIVE), p.AIChunk(SENSITIVE), p.EgressRequirements(True, True, True),
]


@pytest.mark.parametrize("value", SAFE_OBJECTS, ids=lambda obj: type(obj).__name__)
def test_all_payload_containers_have_content_free_diagnostics(value):
    assert dataclasses.is_dataclass(value)
    for rendered in (repr(value), str(value), repr([value]), repr({"payload": value})):
        assert SENSITIVE not in rendered
        assert "<redacted>" in rendered
    with pytest.raises(dataclasses.FrozenInstanceError):
        value.unexpected_field = SENSITIVE


def test_map_values_remain_available_only_by_explicit_access():
    mapping = p.PseudonymMap("conversation-1", {"[PERSONA_1]": SENSITIVE})
    assert mapping.entries["[PERSONA_1]"] == SENSITIVE
    first, second = p.PseudonymMap("one"), p.PseudonymMap("two")
    assert first.entries is not second.entries
    assert p.PseudonymizedBatch([SENSITIVE], "encrypted-map-ref", {}).texts == [SENSITIVE]


@pytest.mark.parametrize("schema,annotations", [
    (p.Principal, {"username": str, "role": p.PrivacyRole, "auth_provider": str,
                   "origin": Literal["local", "tunnel"], "session_id": str | None}),
    (p.PrivacyContext, {"principal": p.Principal, "subject": str | None, "purpose": str,
                        "scope_id": str, "locale": str}),
    (p.PIISpan, {"start": int, "end": int, "category": p.PIICategory, "text_masked": str,
                 "score": float, "text_hash": str, "detector": p.Detector}),
    (p.PseudonymMap, {"scope_id": str, "entries": Mapping[str, str]}),
    (p.PseudonymizedBatch, {"texts": list[str], "mapping_ref": str,
                           "report": dict[p.PIICategory, int]}),
    (p.AIRequest, {"kind": p.AIKind, "target": p.Target, "texts": list[str],
                   "images": Sequence[bytes], "audio": bytes | None,
                   "attachments_context": Sequence[str]}),
])
def test_core_data_contracts(schema, annotations):
    assert get_type_hints(schema) == annotations
    assert [field.name for field in dataclasses.fields(schema)] == list(annotations)


@pytest.mark.parametrize("changes", [
    {"start": -1}, {"end": 0}, {"end": 1}, {"start": True}, {"end": SENSITIVE},
    {"category": SENSITIVE}, {"score": -0.1}, {"score": 1.1}, {"score": float("nan")},
    {"score": float("inf")}, {"score": SENSITIVE}, {"detector": SENSITIVE},
])
def test_span_validation_fails_without_echoing_input(changes):
    values = dict(start=1, end=5, category=p.PIICategory.EMAIL, score=.5)
    values.update(changes)
    with pytest.raises(p.PrivacyError) as caught:
        p.PIISpan(**values)
    assert SENSITIVE not in str(caught.value)


@pytest.mark.parametrize("function,parameters,returns", [
    (p.detect_pii, {"text": str, "ctx": p.PrivacyContext}, list[p.PIISpan]),
    (p.pseudonymize, {"texts": Sequence[str], "ctx": p.PrivacyContext,
                       "policy": p.CategoryPolicy}, p.PseudonymizedBatch),
    (p.depseudonymize, {"text": str, "ctx": p.PrivacyContext}, str),
    (p.encrypt_sensitive, {"value": bytes, "field": p.FieldRef}, p.SealedValue),
    (p.decrypt_authorized, {"sealed": p.SealedValue, "field": p.FieldRef,
                            "ctx": p.PrivacyContext}, bytes),
    (p.authorize_data_access, {"principal": p.Principal, "action": p.DataAction,
                               "resource": p.ResourceRef, "purpose": str}, p.Decision),
    (p.record_privacy_event, {"event": p.PrivacyEvent}, type(None)),
    (p.AIGateway().send, {"request": p.AIRequest, "ctx": p.PrivacyContext},
     p.AIResponse | Iterator[p.AIChunk]),
])
def test_operation_signatures(function, parameters, returns):
    assert list(inspect.signature(function).parameters) == list(parameters)
    assert get_type_hints(function) == {**parameters, "return": returns}
    assert all(parameter.default is inspect.Parameter.empty
               for parameter in inspect.signature(function).parameters.values())


@pytest.mark.parametrize("protocol,operation", [
    (p.PIIDetector, "detect_pii"), (p.Pseudonymizer, "pseudonymize"),
    (p.Depseudonymizer, "depseudonymize"),
])
def test_structural_service_protocols(protocol, operation):
    assert isinstance(p, protocol)
    assert not isinstance(object(), protocol)
    hints = get_type_hints(getattr(protocol, operation))
    assert hints == get_type_hints(getattr(p, operation))


@pytest.mark.parametrize("operation,args,error_type", [
    (p.detect_pii, (SENSITIVE, CTX), p.PIIDetectorUnavailable),
    (p.pseudonymize, ([SENSITIVE], CTX, p.CategoryPolicy()), p.PIIDetectorUnavailable),
    (p.pseudonymize, ([], CTX, p.CategoryPolicy()), p.PIIDetectorUnavailable),
    (p.depseudonymize, (SENSITIVE, CTX), p.AccessDenied),
    (p.restore_authorized, (SENSITIVE, CTX), p.AccessDenied),
    (p.encrypt_sensitive, (SENSITIVE.encode(), FIELD), p.KeyUnavailable),
    (p.decrypt_authorized, (p.SealedValue(SENSITIVE), FIELD, CTX), p.AccessDenied),
    (p.record_privacy_event, (EVENT,), p.AuditUnavailable),
    (p.AIGateway().send, (REQUEST, CTX), p.EgressBlockedError),
])
def test_unconfigured_operations_fail_closed(operation, args, error_type):
    with pytest.raises(error_type) as caught:
        operation(*args)
    rendered = "".join(traceback.format_exception(type(caught.value), caught.value, caught.value.__traceback__))
    assert SENSITIVE not in rendered


@pytest.mark.parametrize("role", list(p.PrivacyRole))
@pytest.mark.parametrize("action", get_args(p.DataAction))
def test_unconfigured_authorization_denies_every_role_and_action(role, action):
    principal = dataclasses.replace(CTX.principal, role=role)
    decision = p.authorize_data_access(principal, action, RESOURCE, CTX.purpose)
    assert decision == p.Decision(False, p.AccessDenied.code, None)


@pytest.mark.parametrize("external", [True, False])
def test_complete_category_defaults(external):
    policy = p.default_category_policy(external=external)
    assert set(policy.actions) == set(p.PIICategory)
    for category in p.PIICategory:
        expected = "keep"
        if external:
            expected = "replace"
            if category in (p.PIICategory.BIRTH_DATE, p.PIICategory.SCHOOL, p.PIICategory.ORGANIZATION):
                expected = "generalize"
            if category in (p.PIICategory.HEALTH, p.PIICategory.ART9_OTHER):
                expected = "block"
        assert policy.action_for(category) == expected
    assert p.CategoryPolicy().action_for(p.PIICategory.PERSON) == "block"
    with pytest.raises(p.PrivacyError):
        p.CategoryPolicy({p.PIICategory.PERSON: SENSITIVE}).action_for(p.PIICategory.PERSON)


@pytest.mark.parametrize("external", [None, "", "false", 0, 1, SENSITIVE])
def test_invalid_target_classification_cannot_select_keep_policy(external):
    with pytest.raises(p.PolicyBlocked):
        p.default_category_policy(external=external)


@pytest.mark.parametrize("policy", [
    None, p.PurposePolicy(CTX.purpose),
    p.PurposePolicy(CTX.purpose, active=True),
    dataclasses.replace(enabled_policy(), purpose="other"),
    dataclasses.replace(enabled_policy(), active="true"),
    dataclasses.replace(enabled_policy(), legal_basis=SENSITIVE),
    dataclasses.replace(enabled_policy(), requires_consent=None),
])
def test_missing_disabled_unknown_or_mismatched_purpose_cannot_be_enabled_by_consent(policy):
    with pytest.raises(p.PurposeDisabledError):
        p.require_purpose(CTX, policy, consent_granted=True)
    with pytest.raises(p.PurposeDisabledError):
        p.egress_requirements(REQUEST, CTX, policy, consent_granted=True)


@pytest.mark.parametrize("consent", [False, None, 1, "true"])
@pytest.mark.parametrize("requires_consent", [True, False])
def test_consent_basis_always_requires_explicit_backend_consent(consent, requires_consent):
    policy = dataclasses.replace(enabled_policy(), legal_basis=p.LegalBasis.CONSENT,
                                 requires_consent=requires_consent)
    with pytest.raises(p.ConsentMissingError):
        p.require_purpose(CTX, policy, consent_granted=consent)
    p.require_purpose(CTX, policy, consent_granted=True)


def test_optional_purpose_refusal_does_not_disable_an_independent_purpose():
    policy = dataclasses.replace(enabled_policy(), requires_consent=True)
    with pytest.raises(p.ConsentMissingError):
        p.require_purpose(CTX, policy)
    p.require_purpose(CTX, enabled_policy())


@pytest.mark.parametrize("host,hosts,local", [
    ("127.0.0.1", (), True), ("127.0.0.2", (), True), ("::1", (), True),
    ("203.0.113.9", (), False), ("192.168.1.5", (), False),
    ("192.168.1.5", ("192.168.1.5",), True),
    ("2001:db8::5", ("2001:0db8:0:0:0:0:0:5",), True),
    ("localhost", (), False), ("127.0.0.1.evil.test", (), False),
    ("http://127.0.0.1", (), False), (SENSITIVE, (SENSITIVE,), False),
    ("203.0.113.9", (SENSITIVE,), False),
])
def test_locality_depends_on_resolved_ip_not_provider_name(host, hosts, local):
    for provider in ("ollama", "llamacpp", "openai"):
        assert p.is_local_target(p.Target(provider, "model", host), local_hosts=hosts) is local


@pytest.mark.parametrize("kind", get_args(p.AIKind))
def test_every_external_text_flow_requires_filtering_and_audit(kind):
    request = dataclasses.replace(REQUEST, kind=kind)
    plan = p.egress_requirements(request, CTX, enabled_policy())
    assert plan == p.EgressRequirements(True, True, True, True, True)
    with pytest.raises(p.EgressBlockedError):
        p.AIGateway().send(request, CTX)


@pytest.mark.parametrize("payload", [{"images": [b"synthetic-image"]}, {"audio": b"synthetic-audio"}, {"audio": b""}])
def test_external_binary_media_is_blocked(payload):
    with pytest.raises(p.EgressBlockedError):
        p.egress_requirements(dataclasses.replace(REQUEST, **payload), CTX, enabled_policy())


@pytest.mark.parametrize("purpose,force_filter,expected", [
    ("guided_chat", False, False), ("guided_chat", True, True),
    ("teacher_noticing", False, True), ("research", False, True),
])
def test_local_filtering_obeys_purpose(purpose, force_filter, expected):
    ctx = dataclasses.replace(CTX, purpose=purpose)
    policy = dataclasses.replace(enabled_policy(pseudonymize_local=force_filter), purpose=purpose)
    request = dataclasses.replace(REQUEST, target=p.Target("openai", "model", "::1"))
    plan = p.egress_requirements(request, ctx, policy)
    assert plan == p.EgressRequirements(False, expected, expected)


def test_unknown_ai_kind_is_blocked():
    with pytest.raises(p.EgressBlockedError):
        p.egress_requirements(dataclasses.replace(REQUEST, kind=SENSITIVE), CTX, enabled_policy())


def test_import_is_portable_and_has_no_database_provider_or_network_dependencies():
    # A fresh process catches accidental import-time configuration and side effects.
    script = """
import socket
import sys
def forbidden(*args, **kwargs):
    raise AssertionError('network used by privacy core')
socket.socket = forbidden
from backend import privacy
assert not any(name in sys.modules for name in
               ('backend.database', 'backend.models', 'sqlalchemy', 'openai', 'httpx'))
assert privacy.CategoryPolicy().action_for(privacy.PIICategory.EMAIL) == 'block'
"""
    result = subprocess.run([sys.executable, "-c", script], capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
