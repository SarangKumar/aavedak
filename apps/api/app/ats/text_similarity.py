"""Two-document TF-IDF cosine similarity (pure Python, deterministic).

Mirrors scikit-learn `TfidfVectorizer` defaults used by the reference repos without adding
scikit-learn to the serverless bundle:
  token_pattern  (?u)\\b\\w\\w+\\b on lowercased text
  idf            smooth: ln((1 + n_docs) / (1 + df)) + 1
  tf             raw counts, or 1 + ln(tf) when sublinear
  norm           l2, so cosine = dot product
The stop-word list is scikit-learn's own `ENGLISH_STOP_WORDS` (318 words, BSD-3), so results match the
reference implementations; the only remaining difference is the tie-break order when `max_features`
truncates the vocabulary, which two short documents practically never reach.
"""

from __future__ import annotations

import math
import re
from collections import Counter

# scikit-learn 1.6.1 sklearn.feature_extraction.text.ENGLISH_STOP_WORDS (BSD-3-Clause).
ENGLISH_STOP_WORDS = frozenset(
    """
    a about above across after afterwards again against all almost alone along already also although
    always am among amongst amoungst amount an and another any anyhow anyone anything anyway
    anywhere are around as at back be became because become becomes becoming been before beforehand
    behind being below beside besides between beyond bill both bottom but by call can cannot cant co
    con could couldnt cry de describe detail do done down due during each eg eight either eleven
    else elsewhere empty enough etc even ever every everyone everything everywhere except few
    fifteen fifty fill find fire first five for former formerly forty found four from front full
    further get give go had has hasnt have he hence her here hereafter hereby herein hereupon hers
    herself him himself his how however hundred i ie if in inc indeed interest into is it its itself
    keep last latter latterly least less ltd made many may me meanwhile might mill mine more
    moreover most mostly move much must my myself name namely neither never nevertheless next nine
    no nobody none noone nor not nothing now nowhere of off often on once one only onto or other
    others otherwise our ours ourselves out over own part per perhaps please put rather re same see
    seem seemed seeming seems serious several she should show side since sincere six sixty so some
    somehow someone something sometime sometimes somewhere still such system take ten than that the
    their them themselves then thence there thereafter thereby therefore therein thereupon these
    they thick thin third this those though three through throughout thru thus to together too top
    toward towards twelve twenty two un under until up upon us very via was we well were what
    whatever when whence whenever where whereafter whereas whereby wherein whereupon wherever
    whether which while whither who whoever whole whom whose why will with within without would yet
    you your yours yourself yourselves""".split()
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
