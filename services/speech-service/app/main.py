from fastapi import FastAPI
from app.transcribe import transcribe_endpoint
from app.evaluate import evaluate_endpoint

app = FastAPI()

app.post("/transcribe")(transcribe_endpoint)
app.post("/evaluate")(evaluate_endpoint)
