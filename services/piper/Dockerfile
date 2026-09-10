FROM python:3.11-slim
WORKDIR /app
RUN pip install --no-cache-dir piper-tts==1.8.0 fastapi==0.115.14 uvicorn==0.34.3
COPY voices.json download.py ./
RUN python download.py
COPY server.py ./
USER 65534:65534
EXPOSE 8000
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
