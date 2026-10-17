# Permutation City layer service. Build from the repo root:
#   docker build -f service/Dockerfile -t pc-service .
#   docker run -p 8000:8000 -v pc-data:/data pc-service
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.11.19 /uv /usr/local/bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never

WORKDIR /srv
# Dependencies first (cached between code changes). The service group, not the sandbox's
# dev tools.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-default-groups --group service --no-install-project

COPY pc ./pc
COPY service ./service
COPY rules.template.yaml ./
RUN uv sync --frozen --no-default-groups --group service

# Work folders and the result cache live on a volume, so results survive a redeploy.
ENV PC_DATA=/data/work PC_SITES=/data/sites PC_CACHE=/data/cache PATH="/srv/.venv/bin:$PATH"
VOLUME /data
EXPOSE 8000
CMD ["sh", "-c", "uvicorn service.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
