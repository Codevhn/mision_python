FROM tailscale/tailscale@sha256:87c55d6be56ad85b3d8bceca5f87f73de288c609131460dd1be1874c250cc41d AS tailscale
FROM python:3.11-slim

WORKDIR /app

COPY --from=tailscale /usr/local/bin/tailscale /usr/local/bin/tailscale
COPY --from=tailscale /usr/local/bin/tailscaled /usr/local/bin/tailscaled

RUN apt-get update && apt-get install -y \
    libpango-1.0-0 libpangoft2-1.0-0 libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 libffi8 shared-mime-info fonts-liberation \
    tesseract-ocr tesseract-ocr-spa \
    && rm -rf /var/lib/apt/lists/*

COPY knowledge_base/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY knowledge_base/ ./knowledge_base/
COPY deploy/atlas-entrypoint.sh /usr/local/bin/atlas-entrypoint
RUN chmod 755 /usr/local/bin/atlas-entrypoint

EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/atlas-entrypoint"]
CMD ["gunicorn", "--chdir", "knowledge_base", "app:app", \
     "--bind", "0.0.0.0:8080", "--worker-class", "gthread", \
     "--workers", "2", "--threads", "4", "--timeout", "120"]
