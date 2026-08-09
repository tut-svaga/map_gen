# --- зависимости -------------------------------------------------------------
# Отдельная стадия, чтобы кэш зависимостей не сбрасывался при каждой правке
# кода: слой с npm ci пересобирается только когда меняются манифесты.
FROM node:24-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
# --omit=dev: eslint и supertest нужны в CI, а не в рантайме
RUN npm ci --omit=dev

# --- рантайм -----------------------------------------------------------------
FROM node:24-alpine

ENV NODE_ENV=production

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --chown=node:node . .

# Непривилегированный пользователь идёт в образе node уже готовым.
# root процессу не нужен: он слушает порт 3000, а не привилегированный 80.
USER node

EXPOSE 3000

# Проверяем /health, а не /ready: liveness не должна зависеть от базы, иначе
# недоступный MySQL приводит к перезапуску здорового приложения.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Форма exec, а не shell: иначе PID 1 достаётся /bin/sh, который не передаёт
# SIGTERM дочернему процессу, и оркестратор всегда убивает приложение
# по таймауту вместо аккуратного завершения.
CMD ["node", "server.js"]
