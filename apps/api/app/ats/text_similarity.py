"""Two-document TF-IDF cosine similarity (pure Python, deterministic).

Mirrors scikit-learn `TfidfVectorizer` defaults used by the reference repos without adding
scikit-learn to the serverless bundle:
  token_pattern  (?u)\\b\\w\\w+\\b on lowercased text
  idf            smooth: ln((1 + n_docs) / (1 + df)) + 1
  tf             raw counts, or 1 + ln(tf) when sublinear
  norm           l2, so cosine = dot product
Known difference: the English stop-word list below is shorter than scikit-learn's 318 words,
so similarities are close to — not byte-identical with — the reference implementations.
"""

from __future__ import annotations

import math
import re
from collections import Counter

ENGLISH_STOP_WORDS = frozenset(
    """a about above after again against all also am an and any are as at be because been before
    being below between both but by can could did do does doing down during each either else etc
    ever every few for from further get had has have having he her here hers herself him himself
    his how however i if in into is it its itself just least less may me might more most much must
    my myself neither no nor not now of off often on once only or other others our ours ourselves
    out over own per perhaps please rather same several she should since so some such than that the
    their theirs them themselves then there these they this those though through thus to too under
    until up upon us very via was we well were what whatever when where whether which while who whom
    whose why will with within without would yet you your yours yourself yourselves""".split()
)

_TOKEN_RE = re.compile(r"(?u)\b\w\w+\b")


def _ngrams(tokens: list[str], ngram_range: tuple[int, int]) -> list[str]:
    lo, hi = ngram_range
    out: list[str] = []
    for n in range(lo, hi + 1):
        for i in range(len(tokens) - n + 1):
            out.append(" ".join(tokens[i : i + n]))
    return out


def tfidf_cosine(
    doc_a: str,
    doc_b: str,
    *,
    ngram_range: tuple[int, int] = (1, 1),
    stop_words: bool = False,
    sublinear_tf: bool = False,
    max_features: int | None = None,
) -> float:
    """Cosine similarity in [0, 1] between two documents, using a vocabulary fit on both."""
    docs = []
    for text in (doc_a, doc_b):
        tokens = _TOKEN_RE.findall((text or "").lower())
        if stop_words:
            tokens = [t for t in tokens if t not in ENGLISH_STOP_WORDS]
        docs.append(Counter(_ngrams(tokens, ngram_range)))
    if not docs[0] or not docs[1]:
        return 0.0

    vocab = set(docs[0]) | set(docs[1])
    if max_features is not None and len(vocab) > max_features:
        totals = docs[0] + docs[1]
        # Highest corpus frequency first; alphabetical tie-break keeps results deterministic.
        vocab = set(sorted(vocab, key=lambda t: (-totals[t], t))[:max_features])

    n_docs = 2
    vectors: list[dict[str, float]] = []
    for counts in docs:
        vec: dict[str, float] = {}
        for term, tf in counts.items():
            if term not in vocab:
                continue
            df = (term in docs[0]) + (term in docs[1])
            idf = math.log((1 + n_docs) / (1 + df)) + 1
            weight = (1 + math.log(tf)) if sublinear_tf else float(tf)
            vec[term] = weight * idf
        norm = math.sqrt(sum(v * v for v in vec.values()))
        vectors.append({k: v / norm for k, v in vec.items()} if norm else {})

    a, b = vectors
    if not a or not b:
        return 0.0
    small, large = (a, b) if len(a) <= len(b) else (b, a)
    return max(0.0, min(1.0, sum(v * large.get(k, 0.0) for k, v in small.items())))
