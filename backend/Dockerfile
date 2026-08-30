FROM python:3.10-slim

WORKDIR /app

# Copy requirements first for caching
COPY backend/requirements.txt .

# graphviz: rendering dei diagrammi concettuali della chat (SVG per il web,
# PNG per Telegram e PDF). I font servono a rasterizzare il PNG: Inter e'
# quello dell'interfaccia, DejaVu resta il fallback se il pacchetto manca.
RUN apt-get update \
    && apt-get install -y poppler-utils graphviz fonts-dejavu-core \
    && (apt-get install -y fonts-inter || echo "fonts-inter non disponibile: resta DejaVu") \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir -r requirements.txt

# Create the backend package directory and copy files into it
RUN mkdir backend
COPY backend/*.py backend/
COPY backend/*.json backend/
COPY backend/routes/ backend/routes/
COPY backend/skills/ backend/skills/
COPY backend/tests/ backend/tests/
COPY knowledge/ knowledge/

# Create __init__.py to make it a proper package
RUN touch backend/__init__.py

# Expose the port the app runs on
EXPOSE 8000

# Command to run the application as a module
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
