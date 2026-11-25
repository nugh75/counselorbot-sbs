"""Resolve and update factory source locations for prompt entries (#777).

Maintainer mode uses AST analysis on `backend/prompt_config.py` (and the
referenced `backend/prompts/*.md` files) to locate the exact editable source of
a config or guided-step factory prompt, safely skipping shared or composed
definitions that require manual code changes.
"""
from __future__ import annotations

import ast
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

_BACKEND_DIR = Path(__file__).resolve().parent
_PROMPT_CONFIG_PATH = _BACKEND_DIR / "prompt_config.py"
_PROMPTS_DIR = _BACKEND_DIR / "prompts"


@dataclass(frozen=True)
class FactorySource:
    prompt_id: str
    kind: Literal["md", "inline", "unsupported"]
    file_path: str | None
    reason: str | None = None


@dataclass(frozen=True)
class _ResolvedTarget:
    kind: Literal["md", "inline", "unsupported"]
    md_name: str | None = None
    const_node: ast.Constant | None = None
    top_var: str | None = None
    reason: str | None = None


def _top_level_assignments(tree: ast.Module) -> dict[str, ast.expr]:
    assigns: dict[str, ast.expr] = {}
    for node in tree.body:
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            assigns[node.targets[0].id] = node.value
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name) and node.value is not None:
            assigns[node.target.id] = node.value
    return assigns


def _resolve_expr(
    expr: ast.expr,
    assigns: dict[str, ast.expr],
    seen: frozenset[str] = frozenset(),
    via_var: str | None = None,
) -> _ResolvedTarget:
    if isinstance(expr, ast.Name):
        if expr.id in seen or expr.id not in assigns:
            return _ResolvedTarget("unsupported", reason="composed_or_dynamic_factory_source")
        return _resolve_expr(assigns[expr.id], assigns, seen | {expr.id}, via_var=expr.id)
    if (
        isinstance(expr, ast.Call)
        and isinstance(expr.func, ast.Name)
        and expr.func.id == "_text"
        and len(expr.args) == 1
        and isinstance(expr.args[0], ast.Constant)
        and isinstance(expr.args[0].value, str)
    ):
        return _ResolvedTarget("md", md_name=expr.args[0].value, top_var=via_var)
    if isinstance(expr, ast.Constant) and isinstance(expr.value, str):
        return _ResolvedTarget("inline", const_node=expr, top_var=via_var)
    return _ResolvedTarget("unsupported", reason="composed_or_dynamic_factory_source")


def _scan_prompt_targets(source: str) -> tuple[dict[str, _ResolvedTarget], Counter, Counter]:
    tree = ast.parse(source)
    assigns = _top_level_assignments(tree)
    targets: dict[str, _ResolvedTarget] = {}
    md_counts: Counter = Counter()
    var_counts: Counter = Counter()

    for node in ast.walk(tree):
        if not isinstance(node, ast.Dict):
            continue
        kv: dict[str, ast.expr] = {}
        for k, v in zip(node.keys, node.values):
            if isinstance(k, ast.Constant) and isinstance(k.value, str):
                kv[k.value] = v
        prompt_id: str | None = None
        expr: ast.expr | None = None
        if "key" in kv and "default" in kv and isinstance(kv["key"], ast.Constant) and isinstance(kv["key"].value, str):
            prompt_id = f"config:{kv['key'].value}"
            expr = kv["default"]
        elif "id" in kv and "prompt" in kv and isinstance(kv["id"], ast.Constant) and isinstance(kv["id"].value, str):
            prompt_id = f"guided_step:{kv['id'].value}"
            expr = kv["prompt"]
        if prompt_id is None or expr is None:
            continue
        resolved = _resolve_expr(expr, assigns)
        targets[prompt_id] = resolved
        if resolved.kind == "md" and resolved.md_name:
            md_counts[resolved.md_name] += 1
        elif resolved.kind == "inline" and resolved.top_var:
            var_counts[resolved.top_var] += 1

    return targets, md_counts, var_counts


def resolve_factory_source(
    prompt_id: str,
    prompt_config_source: str | None = None,
    *,
    prompts_dir: Path | None = None,
) -> FactorySource:
    """Identify whether a prompt's factory text can be cleanly updated in git."""
    src = prompt_config_source if prompt_config_source is not None else _PROMPT_CONFIG_PATH.read_text(encoding="utf-8")
    targets, md_counts, var_counts = _scan_prompt_targets(src)
    target = targets.get(prompt_id)
    if target is None:
        return FactorySource(prompt_id, "unsupported", None, "composed_or_dynamic_factory_source")
    if target.kind == "md" and target.md_name:
        rel = f"backend/prompts/{target.md_name}.md"
        if md_counts[target.md_name] > 1:
            return FactorySource(prompt_id, "unsupported", rel, "shared_factory_file")
        check_dir = prompts_dir if prompts_dir is not None else _PROMPTS_DIR
        if prompt_config_source is None and not (check_dir / f"{target.md_name}.md").is_file():
            return FactorySource(prompt_id, "unsupported", rel, "factory_file_missing")
        if prompts_dir is not None and not (prompts_dir / f"{target.md_name}.md").is_file():
            return FactorySource(prompt_id, "unsupported", rel, "factory_file_missing")
        return FactorySource(prompt_id, "md", rel)
    if target.kind == "inline" and target.const_node is not None:
        if target.top_var and var_counts[target.top_var] > 1:
            return FactorySource(prompt_id, "unsupported", "backend/prompt_config.py", "shared_factory_file")
        return FactorySource(prompt_id, "inline", "backend/prompt_config.py")
    return FactorySource(prompt_id, "unsupported", None, target.reason or "composed_or_dynamic_factory_source")


def _line_char_starts(text: str) -> list[int]:
    starts = [0]
    for line in text.splitlines(keepends=True):
        starts.append(starts[-1] + len(line))
    return starts


def _byte_offset_to_char_index(lines: list[str], starts: list[int], lineno: int, byte_col: int) -> int:
    line_idx = lineno - 1
    line_bytes = lines[line_idx].encode("utf-8")
    char_col = len(line_bytes[:byte_col].decode("utf-8"))
    return starts[line_idx] + char_col


def apply_factory_text(source: FactorySource, current_file_content: str, new_text: str) -> str:
    """Apply `new_text` to the factory `.md` file or `prompt_config.py` inline literal."""
    if source.kind == "md":
        return new_text.rstrip("\n") + "\n"
    if source.kind != "inline":
        raise ValueError(source.reason or "unsupported_factory_source")

    targets, _md_counts, var_counts = _scan_prompt_targets(current_file_content)
    target = targets.get(source.prompt_id)
    if target is None or target.kind != "inline" or target.const_node is None:
        raise ValueError("inline_factory_node_not_found")
    if target.top_var and var_counts[target.top_var] > 1:
        raise ValueError("shared_factory_file")

    node = target.const_node
    if node.end_lineno is None or node.end_col_offset is None:
        raise ValueError("inline_factory_node_missing_span")

    lines = current_file_content.splitlines(keepends=True)
    starts = _line_char_starts(current_file_content)
    start_idx = _byte_offset_to_char_index(lines, starts, node.lineno, node.col_offset)
    end_idx = _byte_offset_to_char_index(lines, starts, node.end_lineno, node.end_col_offset)

    updated = current_file_content[:start_idx] + repr(new_text) + current_file_content[end_idx:]
    updated_targets, _, _ = _scan_prompt_targets(updated)
    reparsed = updated_targets.get(source.prompt_id)
    if reparsed is None or reparsed.const_node is None or reparsed.const_node.value != new_text:
        raise ValueError("inline_factory_roundtrip_failed")
    return updated
