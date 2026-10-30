# whisper.cpp from a pinned tag, statically linked so only the binary is copied over.
FROM python:3.11-slim AS whispercpp
RUN apt-get update && apt-get install -y --no-install-recommends build-essential cmake git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch v1.9.5 https://github.com/ggml-org/whisper.cpp /src \
    && test "$(git -C /src rev-parse HEAD)" = d1be6fde11ac6e0407606b4e42fe72d34add8037
RUN cmake -S /src -B /build -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DGGML_OPENMP=OFF \
        -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF -DWHISPER_SDL2=OFF \
    && cmake --build /build --target whisper-cli -j

FROM python:3.11-slim
WORKDIR /app
RUN pip install --no-cache-dir faster-whisper==1.2.1 ctranslate2==4.8.2 fastapi==0.115.14 uvicorn==0.34.3 python-multipart==0.0.22
# Bundle fixed multilingual models at build time; no runtime downloads. One layer per
# model so adding or repinning one does not redownload the others.
ENV MODEL_FILES='["config.json", "model.bin", "tokenizer.json", "vocabulary.txt", "vocabulary.json", "preprocessor_config.json", "README.md"]'
RUN python -c "import json, os; from huggingface_hub import snapshot_download; snapshot_download('Systran/faster-whisper-small', revision='536b0662742c02347bc0e980a01041f333bce120', local_dir='/models/small', allow_patterns=json.loads(os.environ['MODEL_FILES']))"
RUN python -c "import json, os; from huggingface_hub import snapshot_download; snapshot_download('deepdml/faster-whisper-large-v3-turbo-ct2', revision='4df90f75321148c3a29a9e2351b7ddf8f5b115a8', local_dir='/models/turbo', allow_patterns=json.loads(os.environ['MODEL_FILES']))"
RUN python -c "import json, os; from huggingface_hub import snapshot_download; snapshot_download('Systran/faster-whisper-large-v3', revision='edaa852ec7e145841d8ffdb056a99866b5f0a478', local_dir='/models/large-v3', allow_patterns=json.loads(os.environ['MODEL_FILES']))"
# Quantized ggml models for whisper.cpp, pinned by revision and checked by SHA-256.
ENV GGML_REVISION=5359861c739e955e79d9a303bcbc70fb988958b1
RUN python -c "import os; from huggingface_hub import hf_hub_download; hf_hub_download('ggerganov/whisper.cpp', 'ggml-base-q5_1.bin', revision=os.environ['GGML_REVISION'], local_dir='/models/ggml')" \
    && echo "422f1ae452ade6f30a004d7e5c6a43195e4433bc370bf23fac9cc591f01a8898  /models/ggml/ggml-base-q5_1.bin" | sha256sum -c -
RUN python -c "import os; from huggingface_hub import hf_hub_download; hf_hub_download('ggerganov/whisper.cpp', 'ggml-small-q5_1.bin', revision=os.environ['GGML_REVISION'], local_dir='/models/ggml')" \
    && echo "ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb  /models/ggml/ggml-small-q5_1.bin" | sha256sum -c -
RUN python -c "import os; from huggingface_hub import hf_hub_download; hf_hub_download('ggerganov/whisper.cpp', 'ggml-large-v3-turbo-q5_0.bin', revision=os.environ['GGML_REVISION'], local_dir='/models/ggml')" \
    && echo "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2  /models/ggml/ggml-large-v3-turbo-q5_0.bin" | sha256sum -c -
COPY --from=whispercpp /build/bin/whisper-cli /usr/local/bin/whisper-cli
ENV HF_HUB_OFFLINE=1
COPY server.py ./
USER 65534:65534
EXPOSE 8000
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
