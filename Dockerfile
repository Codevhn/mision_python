FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    libpango-1.0-0 libpangoft2-1.0-0 libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 libffi8 shared-mime-info fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

COPY knowledge_base/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY knowledge_base/ ./knowledge_base/

EXPOSE 8080
CMD ["gunicorn", "--chdir", "knowledge_base", "app:app", \
     "--bind", "0.0.0.0:8080", "--workers", "1", "--timeout", "120"]
