# Roadmap Tracker

Личный трекер прогресса по roadmap: темы → упорядоченные шаги → отметка
выполнения → процент прогресса.

Пет-проект, у которого две задачи сразу: рабочее приложение и полигон для
практики DevOps. Инфраструктура здесь важнее фич и собирается руками —
без docker-compose, чтобы всё, что compose обычно прячет (сети, порядок
запуска, переменные окружения), приходилось делать осознанно.

## Стек

| Слой | Технология |
|---|---|
| Backend | Node.js + Express, чистый API |
| Frontend | статические HTML/CSS/JS, без фреймворков |
| БД | MySQL 8 отдельным контейнером |
| Миграции и запросы | Knex.js (драйвер mysql2) |
| Веб-сервер | nginx: раздаёт статику и проксирует API |
| Контейнеризация | Docker, без compose |

## Архитектура

```
                    :8080
браузер ──────────────┐
                      ▼
              ┌───────────────┐
              │     nginx     │  /       → статика из /usr/share/nginx/html
              │ cont-frontend │  /api/*  → proxy_pass, префикс срезается
              └───────┬───────┘
                      │ cont-backend:3000
                      ▼
              ┌───────────────┐
              │    Express    │  /themes, /steps
              │  cont-backend │
              └───────┬───────┘
                      │ cont-mysql:3306
                      ▼
              ┌───────────────┐
              │    MySQL 8    │  volume mysql_data
              │  cont-mysql   │
              └───────────────┘

           всё внутри user-defined сети app_network
           наружу опубликован только nginx
```

Соглашение об именах: образы — `roadmap-*`, контейнеры — `cont-*`. Имя
контейнера внутри user-defined сети работает как DNS-имя, поэтому оно
одновременно является хостом в `DB_HOST` и в `proxy_pass`.

## Структура репозитория

```
backend/
  app.js               # Express-приложение (экспортируется, слушает не оно)
  server.js            # точка входа: поднимает HTTP-сервер
  db.js                # инстанс knex
  eslint.config.js     # конфиг линтера
  test/                # тесты API поверх реальной MySQL
  knexfile.js          # конфиг подключения к MySQL, только из переменных окружения
  routes/              # роуты API
  db/migrations/       # миграции (themes, steps, progress)
  db/seeds/            # сид с темой "DevOps" и 4 шагами
  Dockerfile           # контекст сборки — backend/
  .env.example         # шаблон переменных, реальный .env не коммитится
frontend/
  static/              # index.html, script.js, style.css
  nginx.conf           # статика + proxy_pass на бэкенд
  Dockerfile           # контекст сборки — frontend/
```

## Переменные окружения

| Переменная | Обязательна | Описание |
|------------|-------------|----------|
| `DB_HOST` | да | Хост MySQL (в Docker — имя контейнера базы) |
| `DB_PORT` | нет, по умолчанию `3306` | Порт MySQL |
| `DB_USER` | да | Пользователь |
| `DB_PASSWORD` | да | Пароль |
| `DB_NAME` | да | Имя базы |
| `PORT` | нет, по умолчанию `3000` | Порт HTTP-сервера приложения |

Дефолтов для подключения к БД нет намеренно: если обязательная переменная не
задана, приложение падает сразу на старте со списком недостающих имён, а не
на первом запросе к базе. Шаблон — `backend/.env.example`, реальный `.env`
в репозиторий не коммитится и в образ не попадает (закрыт в `.dockerignore`).

## Запуск

Нужен только Docker. Всё поднимается на чистой машине шестью командами.

**1. Подготовить переменные**

```bash
cp backend/.env.example backend/.env
```

Заполнить значения. `DB_HOST` — имя контейнера базы (`cont-mysql`), остальное
должно совпадать с `MYSQL_*` из шага 3.

**2. Собрать образы**

```bash
docker build -t roadmap-backend ./backend
docker build -t roadmap-frontend ./frontend
```

**3. Создать сеть и поднять базу**

```bash
docker network create app_network

docker run -d --name cont-mysql --network app_network \
  -v mysql_data:/var/lib/mysql \
  -e MYSQL_ROOT_PASSWORD=rootpass \
  -e MYSQL_DATABASE=roadmap \
  -e MYSQL_USER=roadmap_user \
  -e MYSQL_PASSWORD=roadmap_pass \
  mysql:8.0
```

База стартует 10–20 секунд. Дождаться в логах `ready for connections`:

```bash
docker logs -f cont-mysql
```

**4. Прогнать миграции и сид**

Тот же образ бэкенда, но с другой командой вместо дефолтного `CMD`:

```bash
docker run --rm --network app_network --env-file backend/.env roadmap-backend npm run migrate
docker run --rm --network app_network --env-file backend/.env roadmap-backend npm run seed
```

**5. Поднять бэкенд**

```bash
docker run -d --name cont-backend --network app_network --env-file backend/.env roadmap-backend
```

**6. Поднять фронтенд**

```bash
docker run -d --name cont-frontend --network app_network -p 8080:80 roadmap-frontend
```

Приложение — http://localhost:8080

## Почему сделано именно так

Инфраструктурные решения проекта и причины, по которым выбран каждый вариант.

**User-defined сеть, а не дефолтная bridge.** Только в user-defined сети
работает встроенный DNS Docker: контейнеры находят друг друга по именам
(`--name cont-mysql` → хост `cont-mysql`). На дефолтной bridge резолва по именам нет,
пришлось бы прописывать IP-адреса, которые меняются при пересоздании.

**Named volume, а не bind mount.** `-v mysql_data:/var/lib/mysql` отдаёт
управление хранилищем Docker. Bind mount с хостовой папкой на Windows и macOS
приводит к проблемам с правами и производительностью — MySQL требователен к
владельцу каталога данных.

**База наружу не публикуется.** У контейнера MySQL нет `-p`: он доступен
только изнутри `app_network`. Наружу опубликован единственный порт — nginx.
Меньше поверхность атаки, и это ровно та же модель, что в Kubernetes, где
ClusterIP-сервис не виден за пределами кластера.

**Миграции — отдельный запуск, а не часть `CMD` бэкенда.** При нескольких
репликах миграции, зашитые в старт приложения, побегут параллельно; Knex
защищается таблицей `knex_migrations_lock`, но лишние реплики при этом просто
упадут. Правильное место — отдельный шаг до старта приложения. В Kubernetes
это станет init-контейнером: тот же образ, та же команда.

**Миграции не выполняются на этапе сборки образа.** Сборка идёт в изоляции,
без доступа к боевой базе, и передавать в неё пароль нельзя — build-аргументы
оседают в истории образа. Плюс образ должен быть один на все среды: собран
однажды, запущен где угодно с разными переменными.

**nginx проксирует `/api`, а не отдаёт CORS.** Браузер видит один origin
(`localhost:8080`), поэтому CORS не нужен вообще. Слеш в конце `proxy_pass`
(`http://cont-backend:3000/`) срезает префикс `/api`, и Express получает привычные
`/themes` и `/steps`. Позже эта же схема ложится на Ingress.

**Конфиг только из переменных окружения.** Ни хоста, ни пароля в коде.
Дефолт вроде `DB_HOST=localhost` опаснее его отсутствия: приложение стартует,
выглядит здоровым и падает только на первом запросе к базе.

## API

Внутри бэкенда пути без префикса. Снаружи, через nginx, к ним добавляется
`/api` — например `GET http://localhost:8080/api/themes`.

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/themes` | Список всех тем |
| POST | `/themes` | Создать тему (body: `{ name }`) |
| DELETE | `/themes/:id` | Удалить тему; шаги и прогресс уезжают каскадом |
| GET | `/themes/:id/steps` | Все шаги темы по порядку, с флагом `completed` |
| GET | `/themes/:id/current-step` | Первый невыполненный шаг (`null`, если всё выполнено) |
| POST | `/themes/:id/steps` | Добавить шаг в конец темы (body: `{ title, description, resource_url }`) |
| POST | `/steps/:id/complete` | Отметить шаг выполненным (идемпотентно) |
| GET | `/themes/:id/progress` | `{ total, completed, percent }` |

## Линтер и тесты

```bash
cd backend
npm install          # включая devDependencies
npm run lint
npm test
```

Тесты работают поверх настоящей MySQL, а не моков: проверяется в том числе
поведение внешних ключей (каскадное удаление) и идемпотентность отметки шага.
Схему они накатывают сами через `db.migrate.latest()`, отдельный шаг миграции
не нужен.

Перед каждым кейсом таблицы очищаются, поэтому есть предохранитель: если
`DB_NAME` не содержит `test`, запуск прерывается. Боевую базу тестами не снести.

Локально базу для тестов удобно поднимать отдельным контейнером с
опубликованным портом — рабочий `cont-mysql` наружу не смотрит:

```bash
docker run -d --name mysql-test -p 3307:3306 \
  -e MYSQL_ROOT_PASSWORD=testpass -e MYSQL_DATABASE=roadmap_test mysql:8.0

DB_HOST=127.0.0.1 DB_PORT=3307 DB_USER=root DB_PASSWORD=testpass DB_NAME=roadmap_test npm test
```

## Отладка

```bash
# какой конфиг nginx реально применился (с раскрытыми include)
docker exec cont-frontend nginx -T

# какие переменные доехали внутрь контейнера
docker run --rm --env-file backend/.env roadmap-backend printenv | grep DB_

# проверить API изнутри сети, минуя браузер и его кеш
docker run --rm --network app_network alpine/curl -s http://cont-frontend/api/themes

# логи
docker logs -f cont-backend
docker logs -f cont-mysql
```

Если изнутри контейнера сервис отвечает, а снаружи нет — дело в маппинге
портов (`-p`), а не в самом сервисе.

## Полезные команды

```bash
npm run migrate:rollback   # откатить последнюю миграцию
npm run seed               # пересоздать тестовые данные (сбрасывает прогресс)
```

Локально без Docker: `npm install` в `backend/`, экспортировать те же
переменные окружения в свою сессию (файл `.env` сам не подхватывается —
`dotenv` не используется) и запустить `npm start`.

## Дальше по плану

- [x] Рабочий минимум приложения
- [x] Переезд с SQLite на MySQL
- [x] Докеризация: два образа, сеть, volume, миграции отдельным шагом
- [ ] CI: GitHub Actions (lint → test → build → push), зеркало в GitLab
- [ ] Kubernetes локально через k3d: Deployment, StatefulSet, Ingress, init-контейнер
- [ ] Terraform + Ansible
- [ ] Наблюдаемость: Prometheus, Loki, Tempo, Grafana
- [ ] Безопасность: Trivy, gitleaks, проверка манифестов
