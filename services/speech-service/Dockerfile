FROM python:3.11-slim

# System deps for audio processing and WeNet
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    curl \
    wget \
    ffmpeg \
    libsndfile1 \
    libsox-dev \
    sox \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy project configuration and install Python dependencies
COPY pyproject.toml .
RUN pip install --no-cache-dir -e .

# Copy application code and scripts
COPY app/ ./app/
COPY scripts/ ./scripts/
COPY config/ ./config/

# Download WeNet models during build
RUN python scripts/download_models.py --model librispeech_conformer || echo "Model download failed, will use fallback"

# Environment variables
ENV PYTHONUNBUFFERED=1 \
    PORT=8080 \
    WENET_MODEL_PATH=/app/models/final.pt \
    WENET_CONFIG_PATH=/app/config/wenet_config.yaml \
    WENET_DICT_PATH=/app/config/words.txt

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Start command
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
