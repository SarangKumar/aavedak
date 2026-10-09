from __future__ import annotations

import json
import queue
import threading
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.ats.analyze import analyze_resume, detect_mode
from app.ats.engine_runner import VALID_ENGINES, run_engine_profile, run_engine_staged
from app.ats.pipeline import (
    ANALYSIS_FAILURE,
    COMPLETED,
    COMPLETED_WITH_WARNINGS,
    MISSING_INPUT,
    EngineFailure,
)
from app.ats.schemas import BatchScoreRequest, EngineScoreRequest, ScoreRequest

router = APIRouter(prefix="/svc/v1/ats", tags=["ats"])


@router.get("/health")
def ats_health():
    return {"ok": True, "service": "ats", "engine": "fastapi"}


@router.post("/score-engine")
def score_engine(body: EngineScoreRequest):
    """Score one resume with a specific engine (native or reference profile)."""
    return run_engine_profile(
        engine_id=body.engineId,
        resume_text=body.resumeText,
        jd_text=body.jdText,
        role=body.role,
        mode=body.mode,
        resume_id=body.resumeId,
    )


@router.post("/score-engine/stream")
def score_engine_stream(body: EngineScoreRequest):
    """Score one resume × engine and stream NDJSON events as each stage actually starts.

    Events: {"type":"stage",…} then exactly one terminal {"type":"result",…} or {"type":"failed",…}.
    Every event carries resumeId, engineId, runId, a monotonically increasing seq, and `at` (UTC).
    """
    if body.engineId not in VALID_ENGINES:
        raise HTTPException(status_code=400, detail=f"Unknown engine: {body.engineId}")

    events: queue.Queue[dict | None] = queue.Queue()
    seq = 0
    lock = threading.Lock()

    def push(payload: dict) -> None:
        nonlocal seq
        with lock:
            seq += 1
            events.put(
                {
                    **payload,
                    "resumeId": body.resumeId,
                    "engineId": body.engineId,
                    "runId": body.runId,
                    "seq": seq,
                    "at": datetime.now(timezone.utc).isoformat(),
                }
            )

    def work() -> None:
        try:
            if not (body.resumeText or "").strip():
                raise EngineFailure(MISSING_INPUT, "Resume text is required.")
            result = run_engine_staged(
                engine_id=body.engineId,
                resume_text=body.resumeText,
                jd_text=body.jdText,
                role=body.role,
                mode=body.mode,
                resume_id=body.resumeId,
                emit=lambda stage, message=None: push(
                    {"type": "stage", "stage": stage, **({"message": message} if message else {})}
                ),
            )
            status = COMPLETED_WITH_WARNINGS if result.get("warnings") else COMPLETED
            push({"type": "result", "stage": status, "result": result})
        except EngineFailure as failure:
            push({"type": "failed", "stage": "failed", "failureKind": failure.kind, "message": failure.message})
        except Exception:  # noqa: BLE001 — legacy engines may raise; report without leaking internals
            push({"type": "failed", "stage": "failed", "failureKind": ANALYSIS_FAILURE, "message": "Analysis failed."})
        finally:
            events.put(None)

    def stream():
        threading.Thread(target=work, daemon=True).start()
        while (event := events.get()) is not None:
            yield json.dumps(event) + "\n"

    return StreamingResponse(stream(), media_type="application/x-ndjson")


@router.post("/score")
def score_one(body: ScoreRequest):
    if not (body.resumeText or "").strip():
        raise HTTPException(status_code=400, detail="resumeText is required.")
    return analyze_resume(
        body.resumeText,
        jd_text=body.jdText,
        role=body.role,
    )


@router.post("/score-batch")
def score_batch(body: BatchScoreRequest):
    if not body.resumes:
        raise HTTPException(status_code=400, detail="resumes is required.")

    mode = detect_mode(body.role, body.jdText)
    results = []
    for resume in body.resumes:
        scored = analyze_resume(
            resume.text,
            jd_text=body.jdText,
            role=body.role,
            resume_id=resume.id,
        )
        results.append(scored)
    return {"results": results, "engine": "fastapi", "mode": mode}
