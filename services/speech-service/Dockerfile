FROM kaldiasr/kaldi:cpu-latest

WORKDIR /app
COPY ./app /app/app
COPY requirements.txt /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    sox \
    wget \
    ffmpeg \
    && apt-get clean && rm -rf /var/lib/apt/lists/*
RUN pip3 install --no-cache-dir  --break-system-packages -r requirements.txt

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
