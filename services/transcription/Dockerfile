FROM python:3.11-slim
WORKDIR /app
RUN pip install --no-cache-dir faster-whisper==1.2.1 ctranslate2==4.8.2 fastapi==0.115.14 uvicorn==0.34.3 python-multipart==0.0.22
# Bundle a fixed multilingual model at build time; no runtime downloads.
RUN python -c "from huggingface_hub import snapshot_download; snapshot_download('Systran/faster-whisper-small', revision='536b0662742c02347bc0e980a01041f333bce120', local_dir='/models/small', allow_patterns=['config.json', 'model.bin', 'tokenizer.json', 'vocabulary.txt', 'README.md'])"
ENV HF_HUB_OFFLINE=1
COPY server.py ./
USER 65534:65534
EXPOSE 8000
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
