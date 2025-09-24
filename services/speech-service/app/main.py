import os
import io
import uuid
import shutil
import tempfile
from typing import Optional

from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.responses import JSONResponse

from .alignment import run_wenet_alignment
from .phoneme_confidence import compute_assessment_scores


app = FastAPI(title="Sylis Speech Service (WeNet)", version="0.1.0")


@app.post("/api/pronunciation/assess")
async def pronunciation_assess(
    audio: UploadFile = File(..., description="WAV audio file, mono, 16k preferred"),
    text: str = Form(..., description="Reference text to align"),
    language: str = Form("en-US"),
    enable_phoneme: bool = Form(True),
) -> JSONResponse:
    if not text or not text.strip():
        raise HTTPException(status_code=400, detail="text is required")
    if not audio.filename.lower().endswith((".wav", )):
        raise HTTPException(status_code=400, detail="Only .wav is supported in this minimal service")

    session_dir = tempfile.mkdtemp(prefix="sylis_speech_")
    wav_path = os.path.join(session_dir, "audio.wav")

    try:
        # Save upload to disk
        contents = await audio.read()
        with open(wav_path, "wb") as f:
            f.write(contents)

        # Run WeNet to obtain word/phoneme alignments (real phoneme alignment)
        alignment_result = run_wenet_alignment(wav_path, text, language=language)

        # Compute Azure-like assessment with phoneme confidences
        assessment = compute_assessment_scores(
            alignment_result=alignment_result,
            enable_phoneme=enable_phoneme,
        )

        # 添加模型使用状态信息 - 只使用WeNet
        assessment["modelInfo"] = {
            "engine": "WeNet",
            "description": "使用WeNet真实模型进行对齐",
            "modelStatus": "✅ WeNet模型"
        }

        return JSONResponse(content=assessment)

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"internal error: {e}")
    finally:
        try:
            shutil.rmtree(session_dir, ignore_errors=True)
        except Exception:
            pass


@app.get("/")
def root() -> dict:
    return {"service": "sylis-speech-wenet", "status": "ok"}


@app.get("/health")
def health() -> dict:
    from .alignment import WeNetAlignment

    # 检查WeNet模型状态
    try:
        aligner = WeNetAlignment()
        return {
            "status": "healthy",
            "model": "WeNet",
            "modelInfo": {
                "engine": "WeNet",
                "vocabSize": aligner.vocab_size,
                "modelPath": aligner.model_path,
                "description": "WeNet模型运行正常"
            }
        }
    except Exception as e:
        return {
            "status": "error",
            "model": "WeNet",
            "error": str(e),
            "modelInfo": {
                "engine": "WeNet",
                "description": "WeNet模型初始化失败"
            }
        }
