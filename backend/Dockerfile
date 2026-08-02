# Контекст сборки — корень репозитория, а не backend/:
# server.js раздаёт статику из ../frontend, поэтому в образ нужны обе папки.
#   docker build -f backend/Dockerfile -t roadmap-backend .
FROM node:24-alpine

WORKDIR /app

# Зависимости отдельным слоем: пересобираются только при изменении package*.json
COPY backend/package.json backend/package-lock.json ./backend/
RUN cd backend && npm ci --omit=dev

COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Не работаем от root — в образе node:alpine пользователь node уже есть
USER node

WORKDIR /app/backend

EXPOSE 3000

CMD ["node", "server.js"]
