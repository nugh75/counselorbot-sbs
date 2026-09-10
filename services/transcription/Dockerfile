FROM python:3.11-slim
WORKDIR /app
RUN pip install --no-cache-dir faster-whisper==1.2.1 ctranslate2==4.8.2 fastapi==0.115.14 uvicorn==0.34.3 python-multipart==0.0.22
# Bundle fixed multilingual models at build time; no runtime downloads. One layer per
# model so adding or repinning one does not redownload the others.
ENV MODEL_FILES='["config.json", "model.bin", "tokenizer.json", "vocabulary.txt", "vocabulary.json", "preprocessor_config.json", "README.md"]'
RUN python -c "import json, os; from huggingface_hub import snapshot_download; snapshot_download('Systran/faster-whisper-small', revision='536b0662742c02347bc0e980a01041f333bce120', local_dir='/models/small', allow_patterns=json.loads(os.environ['MODEL_FILES']))"
RUN python -c "import json, os; from huggingface_hub import snapshot_download; snapshot_download('deepdml/faster-whisper-large-v3-turbo-ct2', revision='4df90f75321148c3a29a9e2351b7ddf8f5b115a8', local_dir='/models/turbo', allow_patterns=json.loads(os.environ['MODEL_FILES']))"
RUN python -c "import json, os; from huggingface_hub import snapshot_download; snapshot_download('Systran/faster-whisper-large-v3', revision='edaa852ec7e145841d8ffdb056a99866b5f0a478', local_dir='/models/large-v3', allow_patterns=json.loads(os.environ['MODEL_FILES']))"
ENV HF_HUB_OFFLINE=1
COPY server.py ./
USER 65534:65534
EXPOSE 8000
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
