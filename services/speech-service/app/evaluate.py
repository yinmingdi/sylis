from fastapi import UploadFile, File, Form
from fastapi.responses import JSONResponse
from app.kaldi_runner import run_kaldi_gop
from app.format_adapter import to_azure_gop

async def evaluate_endpoint(file: UploadFile = File(...), text: str = Form(...)):
    wav_path = f"/tmp/{file.filename}"
    with open(wav_path, "wb") as f:
        f.write(await file.read())
    raw_result = run_kaldi_gop(wav_path, text)
    return JSONResponse(content=to_azure_gop(raw_result, text))
