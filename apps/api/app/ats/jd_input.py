"""Clean a pasted job description before any engine sees it.

The ATS page and Improve resume send whatever the user pasted, which often
carries the posting's privacy notice, cookie banner, equal-opportunity statement, data
protection text and page footer. Those words would count as job requirements (keywords,
skills, seniority hints), so the same cleaner used for imported jobs
(`discovery.jobs.jd_clean.strip_boilerplate`) runs first on the `jdText` of every ATS and
Improve request.

Only the copy sent to the engines is cleaned; the user's text in the browser is unchanged.
The cleaner returns the input as is when nothing applies, or when cleaning would leave too
little.
"""

from __future__ import annotations

from typing import Annotated

from pydantic import AfterValidator

from app.discovery.jobs.jd_clean import strip_boilerplate


def clean_jd_text(text: str) -> str:
    return strip_boilerplate(text) if text and text.strip() else text


# A request field that is cleaned on parse, so every handler and engine gets the clean JD.
CleanJdText = Annotated[str, AfterValidator(clean_jd_text)]
