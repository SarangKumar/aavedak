"""Resume Improver: deterministic, fact-preserving resume rewrites scored by the ATS engines.

See IMPROVE.md. No LLMs, no network: every change comes from a rule in `rules.py` and must pass
`guards.py` (nothing new of a factual kind may appear) before it can be applied.
"""
