"""GLiNER span model (markerV0) with ``onnxruntime`` + ``tokenizers`` only.

No torch and no ``gliner`` package: this is what a PyInstaller desktop build
would ship. Checked against ``gliner==0.2.29`` ``predict_entities`` with
``load_onnx_model=True`` (same spans and scores, see the P3 report §3).
Standalone on purpose (no ``backend`` import) so the freeze probe can bundle
it alone.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Sequence

_WORD_RE = re.compile(r"\w+(?:[-_]\w+)*|\S")  # gliner WhitespaceTokenSplitter


def split_words(text: str) -> list[tuple[str, int, int]]:
    return [(m.group(), m.start(), m.end()) for m in _WORD_RE.finditer(text)]


def build_inputs(word_ids: Sequence[int | None], token_ids: Sequence[int], num_words: int,
                 prompt_len: int, max_width: int) -> dict:
    """Model tensors for one sentence, as numpy arrays.

    ``word_ids`` maps each subtoken to its pre-tokenized word (prompt words
    first). ``words_mask`` marks the first subtoken of each *text* word with
    its 1-based index; spans are every (i, i + w) with w < max_width, and
    spans past the last word are masked and zeroed as gliner does.
    """
    import numpy as np

    words_mask, prev = [], None
    for wid in word_ids:
        if wid is not None and wid != prev and wid >= prompt_len:
            words_mask.append(wid - prompt_len + 1)
        else:
            words_mask.append(0)
        prev = wid
    span_idx = [(i, i + w) for i in range(num_words) for w in range(max_width)]
    span_mask = [end < num_words for _, end in span_idx]
    span_idx = [(s, e) if ok else (0, 0) for (s, e), ok in zip(span_idx, span_mask)]
    return {
        "input_ids": np.array([token_ids], dtype=np.int64),
        "attention_mask": np.ones((1, len(token_ids)), dtype=np.int64),
        "words_mask": np.array([words_mask], dtype=np.int64),
        "text_lengths": np.array([[num_words]], dtype=np.int64),
        "span_idx": np.array([span_idx], dtype=np.int64).reshape(1, -1, 2),
        "span_mask": np.array([span_mask], dtype=bool),
    }


def decode_spans(logits, num_words: int, threshold: float) -> list[tuple[int, int, int, float]]:
    """Greedy flat decoding: (start_word, end_word, label, score), no overlaps."""
    import numpy as np

    probs = 1.0 / (1.0 + np.exp(-logits[0]))  # [words, width, labels]
    cands = [(int(i), int(i + w), int(c), float(probs[i, w, c]))
             for i, w, c in zip(*np.nonzero(probs > threshold)) if i + w < num_words]
    cands.sort(key=lambda x: -x[3])
    kept: list[tuple[int, int, int, float]] = []
    for s, e, c, p in cands:
        if all(e < ks or s > ke for ks, ke, _, _ in kept):
            kept.append((s, e, c, p))
    return sorted(kept)


class GlinerOnnx:
    def __init__(self, model_dir: Path, onnx_file: str, labels: Sequence[str], *,
                 threshold: float = 0.5, threads: int | None = None):
        import onnxruntime as ort
        from tokenizers import Tokenizer

        model_dir = Path(model_dir)
        config = json.loads((model_dir / "gliner_config.json").read_text(encoding="utf-8"))
        self.max_width = int(config.get("max_width", 12))
        self.max_len = int(config.get("max_len", 384))
        ent, sep = config.get("ent_token", "<<ENT>>"), config.get("sep_token", "<<SEP>>")
        self.labels = list(labels)
        self.threshold = threshold
        self.tokenizer = Tokenizer.from_file(str(model_dir / "tokenizer.json"))
        opts = ort.SessionOptions()
        if threads:
            opts.intra_op_num_threads = threads
        self.session = ort.InferenceSession(str(model_dir / onnx_file), opts,
                                            providers=["CPUExecutionProvider"])
        self.prompt = [w for label in self.labels for w in (ent, label)] + [sep]

    def predict(self, text: str) -> list[tuple[int, int, str, float]]:
        """(start_char, end_char, label, score) for one sentence."""
        words = split_words(text)[: self.max_len]
        if not words:
            return []
        enc = self.tokenizer.encode(self.prompt + [w for w, _, _ in words], is_pretokenized=True)
        feeds = build_inputs(enc.word_ids, enc.ids, len(words), len(self.prompt), self.max_width)
        logits = self.session.run(["logits"], feeds)[0]
        return [(words[s][1], words[e][2], self.labels[c], p)
                for s, e, c, p in decode_spans(logits, len(words), self.threshold)]
