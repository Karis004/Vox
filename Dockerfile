FROM node:22-alpine AS frontend-build

WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
# The Windows-created lock omits Rollup's Linux optional binary. Install the
# matching version for this build architecture without changing dependencies.
RUN npm ci && npm install --prefix frontend --no-save --package-lock=false \
    "@rollup/rollup-linux-$(node -p 'process.arch')-musl@$(node -p 'require("./frontend/node_modules/rollup/package.json").version')"

COPY frontend ./frontend
RUN npm run build


FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    VOX_HOST=0.0.0.0 \
    VOX_PORT=8000 \
    VOX_DATABASE_PATH=/app/data/vox.db

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend ./backend
COPY main.py ./main.py
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

RUN mkdir -p /app/data

EXPOSE 8000
VOLUME ["/app/data"]

CMD ["python", "main.py"]

