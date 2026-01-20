FROM python:3.10-slim

WORKDIR /app

# Copy requirements first for caching
COPY requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

# Create the backend package directory and copy files into it
RUN mkdir backend
COPY *.py backend/

# Create __init__.py to make it a proper package
RUN touch backend/__init__.py

# Expose the port the app runs on
EXPOSE 8000

# Command to run the application as a module
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
