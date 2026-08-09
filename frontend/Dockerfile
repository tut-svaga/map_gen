# --- сборка ------------------------------------------------------------------
# Node нужен только чтобы собрать бандл. В финальный образ он не попадает:
# иначе к 25 мегабайтам статики за nginx прилагался бы весь тулчейн
# и сотни мегабайт node_modules — как объём, так и лишняя поверхность атаки.
FROM node:24-alpine AS build

WORKDIR /app

# Манифесты копируем отдельно от исходников: пока они не менялись, Docker
# берёт слой с зависимостями из кэша и не переустанавливает их на каждую
# правку кода. npm ci, а не install — ставит строго по package-lock.json.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- отдача ------------------------------------------------------------------
FROM nginx:1.29-alpine

# Готовый конфиг не кладём: entrypoint образа сам прогонит шаблон через
# envsubst при старте, подставив BACKEND_UPSTREAM.
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf

COPY --from=build /app/dist /usr/share/nginx/html

# Имя бэкенда в сети docker/кластера. Дефолт задан здесь, чтобы контейнер,
# запущенный без -e, поднялся с рабочим конфигом, а не с пустым proxy_pass.
ENV BACKEND_UPSTREAM=http://cont-backend:3000

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --spider http://127.0.0.1/healthz || exit 1
