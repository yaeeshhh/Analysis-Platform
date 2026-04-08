FROM python:3.11-slim

# Set the working directory to the project root so backend-relative paths resolve consistently.
WORKDIR /app

# Install system dependencies for psycopg (PostgreSQL C client)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies first (layer cache)
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy the backend application
COPY backend/ ./backend/

# Create runtime storage used by analysis uploads, reports, and experiment exports.
RUN mkdir -p uploads/analysis_reports/experiments

EXPOSE 8000

# Run from /app so uploads/ resolves to /app/uploads/ for the live analysis-first runtime.
CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
