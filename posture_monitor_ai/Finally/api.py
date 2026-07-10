import time
import uuid
from threading import Lock
from typing import Optional

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile

from posture_engine import PostureEngine

SESSION_TTL_SECONDS = 1800

app = FastAPI(title="NeckOn AI Wrapper", version="0.1.0")


class SessionStore:
    def __init__(self):
        self.sessions: dict[str, PostureEngine] = {}
        self.lock = Lock()

    def get_or_create(self, session_id: Optional[str]):
        with self.lock:
            self.cleanup_locked()

            if not session_id:
                session_id = str(uuid.uuid4())

            engine = self.sessions.get(session_id)
            if engine is None:
                engine = PostureEngine(session_id)
                self.sessions[session_id] = engine

            return session_id, engine

    def reset(self, session_id: str) -> bool:
        with self.lock:
            engine = self.sessions.get(session_id)
            if engine is None:
                return False
            engine.reset_session()
            return True

    def cleanup_locked(self):
        now = time.time()
        expired = []
        for sid, engine in self.sessions.items():
            if now - engine.last_seen > SESSION_TTL_SECONDS:
                expired.append(sid)

        for sid in expired:
            try:
                self.sessions[sid].close()
            except Exception:
                pass
            del self.sessions[sid]

    def stats(self):
        with self.lock:
            return {"session_count": len(self.sessions), "sessions": list(self.sessions.keys())}


store = SessionStore()


def decode_image(raw: bytes):
    arr = np.frombuffer(raw, dtype=np.uint8)
    image = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("이미지 디코드 실패")
    return image


@app.get("/health")
def health():
    return {"status": "ok", "sessions": store.stats()}


@app.post("/process-frame")
async def process_frame(
    file: UploadFile = File(...),
    session_id: Optional[str] = Form(default=None),
):
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="빈 이미지")

    try:
        frame_bgr = decode_image(raw)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    sid, engine = store.get_or_create(session_id)

    try:
        result = engine.process_frame(frame_bgr)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI 처리 실패: {e}")

    return {
        "session_id": sid,
        "phase": result.phase,
        "mode": result.mode,
        "locked_mode": result.locked_mode,
        "preview_mode": result.preview_mode,
        "state": result.state,
        "score": result.score,
        "message": result.message,
        "show_bad_alert": result.show_bad_alert,
        "info_lines": result.info_lines,
        "debug": result.debug,
    }


@app.post("/reset-session")
def reset_session(session_id: str = Form(...)):
    ok = store.reset(session_id)
    if not ok:
        raise HTTPException(status_code=404, detail="session not found")
    return {"ok": True, "session_id": session_id}


@app.get("/sessions")
def sessions():
    return store.stats()