FROM python:3.10-slim

WORKDIR /app

# Copy requirements first for caching
COPY backend/requirements.txt .

RUN apt-get update && apt-get install -y poppler-utils && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir -r requirements.txt

# Create the backend package directory and copy files into it
RUN mkdir backend
COPY backend/*.py backend/
COPY backend/routes/ backend/routes/
COPY backend/tests/ backend/tests/
COPY knowledge/ knowledge/

# Create __init__.py to make it a proper package
RUN touch backend/__init__.py

# Expose the port the app runs on
EXPOSE 8000

# Command to run the application as a module
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]
