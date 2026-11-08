"""Find quoted instructions in shipped source files, without executing builders.

Only Python application modules and versioned prompt Markdown are indexed. These
are literal matches in the installed source, not a guessed runtime call stack.
Cached findings can acquire references at read time without another model call.
"""
from __future__ import annotations

import ast
from dataclasses import dataclass
from functools import lru_cache
from importlib.util import resolve_name
from pathlib import Path


@dataclass(frozen=True)
class _Fragment:
    text: str
    file: str
    line: int
    symbol: str
    owner: tuple[str, str] | None = None
    definition: tuple[str, int] | None = None
    markdown: bool = False


def _module_name(path: Path, root: Path) -> str:
    return "backend." + ".".join(path.relative_to(root).with_suffix("").parts)


def _own_nodes(node):
    """Nodes in one lexical scope, excluding nested functions and classes."""
    yield node
    for child in ast.iter_child_nodes(node):
        if not isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            yield from _own_nodes(child)


def _bindings(node, module):
    bindings = {}
    for child in _own_nodes(node):
        if isinstance(child, ast.ImportFrom):
            target = resolve_name("." * child.level + (child.module or ""), module.rpartition(".")[0]) if child.level else child.module
            for alias in child.names:
                bindings[alias.asname or alias.name] = (target, alias.name)
    return bindings


def _collect(root: Path):
    fragments: list[_Fragment] = []
    modules = []
    markdown_owners = {}
    paths = sorted([*root.glob("*.py"), *(root / "routes").glob("*.py")])
    for path in paths:
        # Diagnostic instructions are not instructions sent to the counselor.
        if path.name.startswith("prompt_health") or path.name in {"prompt_source_locations.py", "prompt_registry.py"}:
            continue
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"))
        except (OSError, SyntaxError, UnicodeError):
            continue
        file = "backend/" + path.relative_to(root).as_posix()
        module = _module_name(path, root)
        modules.append((tree, module, file))

        def visit(node, scope="", assignment=""):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                scope = f"{scope}.{node.name}".strip(".")
                assignment = ""
            if isinstance(node, (ast.Assign, ast.AnnAssign)):
                targets = node.targets if isinstance(node, ast.Assign) else [node.target]
                assignment = next((target.id for target in targets if isinstance(target, ast.Name)), "")
            owner = (module, assignment) if assignment and not scope else None
            if isinstance(node, ast.Constant) and isinstance(node.value, str) and len(node.value) >= 12:
                fragments.append(_Fragment(node.value, file, node.lineno, scope or assignment, owner))
            if (module == "backend.prompt_config" and owner and isinstance(node, ast.Call)
                    and isinstance(node.func, ast.Name) and node.func.id == "_text" and node.args
                    and isinstance(node.args[0], ast.Constant) and isinstance(node.args[0].value, str)):
                name = node.args[0].value
                if name.replace("_", "").isalnum():
                    markdown_owners[f"{name}.md"] = (owner, assignment, (file, node.lineno))
            body = getattr(node, "body", [])
            docstring = body[0] if isinstance(body, list) and body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant) and isinstance(body[0].value.value, str) else None
            for child in ast.iter_child_nodes(node):
                if child is not docstring:
                    visit(child, scope, assignment)

        visit(tree)

    for path in sorted((root / "prompts").glob("*.md")):
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeError):
            continue
        owner, symbol, definition = markdown_owners.get(path.name, (None, "", None))
        fragments.append(_Fragment(text, "backend/prompts/" + path.name, 1, symbol, owner, definition, True))

    owners = {fragment.owner for fragment in fragments if fragment.owner}
    readers: dict[tuple[str, str], list[dict]] = {}
    for tree, module, file in modules:
        def references(node, scope="", bindings=None, shadowed=frozenset()):
            bindings = bindings if bindings is not None else _bindings(tree, module)
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                scope = f"{scope}.{node.name}".strip(".")
                local_bindings = _bindings(node, module)
                bindings = {**bindings, **local_bindings}
                local_names = {child.id for child in _own_nodes(node) if isinstance(child, ast.Name) and isinstance(child.ctx, ast.Store)}
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    local_names.update(arg.arg for arg in [*node.args.posonlyargs, *node.args.args, *node.args.kwonlyargs])
                    local_names.update(arg.arg for arg in (node.args.vararg, node.args.kwarg) if arg is not None)
                for child in _own_nodes(node):
                    if isinstance(child, ast.Global):
                        local_names.difference_update(child.names)
                shadowed = (shadowed - local_bindings.keys()) | local_names
            if scope and isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load):
                owner = None if node.id in shadowed else bindings.get(node.id, (module, node.id))
                if owner in owners:
                    location = {"file": file, "line": node.lineno, "symbol": scope}
                    if location not in readers.setdefault(owner, []):
                        readers[owner].append(location)
            for child in ast.iter_child_nodes(node):
                references(child, scope, bindings, shadowed)
        references(tree)
    return fragments, readers


@lru_cache(maxsize=1)
def _index():
    return _collect(Path(__file__).resolve().parent)


def _locate(quote: str, fragments, readers) -> dict:
    matches = []
    seen = set()
    if len(quote.strip()) < 12:
        return {"status": "unknown", "matches": [], "more": 0}
    for fragment in fragments:
        start = fragment.text.lower().find(quote.lower())
        if start < 0:
            continue
        line = fragment.line + (fragment.text[:start].count("\n") if fragment.markdown else 0)
        key = (fragment.file, line, fragment.symbol)
        if key in seen:
            continue
        seen.add(key)
        match = {"file": fragment.file, "line": line, "symbol": fragment.symbol,
                 "readers": readers.get(fragment.owner, [])}
        if fragment.definition:
            match["definition"] = {"file": fragment.definition[0], "line": fragment.definition[1], "symbol": fragment.symbol}
        matches.append(match)
    return {"status": "ambiguous" if len(matches) > 1 else "matched" if matches else "unknown",
            "matches": matches[:8], "more": max(0, len(matches) - 8)}


@lru_cache(maxsize=4096)
def code_locations(quote: str) -> dict:
    """References in shipped sources. Paths are relative to the repository root."""
    return _locate(quote, *_index())


def sentence_with_locations(sentence: dict) -> dict:
    if not sentence["prompt"].startswith("code:"):
        return sentence
    return {**sentence, "code_location": code_locations(sentence["text"])}
