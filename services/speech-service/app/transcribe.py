from fastapi import UploadFile, File
from fastapi.responses import JSONResponse
from app.kaldi_runner import run_kaldi_transcription
from app.format_adapter import to_azure_transcript

async def transcribe_endpoint(file: UploadFile = File(...)):
    wav_path = f"/tmp/{file.filename}"
    with open(wav_path, "wb") as f:
        f.write(await file.read())
    raw_result = run_kaldi_transcription(wav_path)
    return JSONResponse(content=to_azure_transcript(raw_result))
