# Roadmap Tracker (MVP)

Личный трекер прогресса по roadmap: темы → шаги по порядку → отметка выполнения → процент прогресса.

## Стек

- Backend: Node.js + Express
- База данных: MySQL 8
- Миграции и запросы: Knex.js (драйвер mysql2)
- Frontend: статические HTML/CSS/JS (раздаются тем же Express-сервером)

## Структура

```
backend/
  server.js            # входная точка Express
  db.js                # инстанс knex
  knexfile.js          # конфиг подключения к MySQL (через env-переменные)
  routes/              # роуты API
  db/migrations/       # миграции (themes, steps, progress)
  db/seeds/            # сид с темой "DevOps" и 4 шагами
  Dockerfile
frontend/
  index.html           # прогресс-бар, карточка текущего шага, список шагов
  script.js
  style.css
```

## Переменные окружения

| Переменная | По умолчанию | Описание |
|------------|--------------|----------|
| `DB_HOST` | `127.0.0.1` | Хост MySQL |
| `DB_PORT` | `3306` | Порт MySQL |
| `DB_USER` | `root` | Пользователь |
| `DB_PASSWORD` | *(пусто)* | Пароль |
| `DB_NAME` | `roadmap` | Имя базы (должна существовать) |
| `PORT` | `3000` | Порт HTTP-сервера приложения |

База данных должна быть создана заранее — миграции создают только таблицы:

```sql
CREATE DATABASE roadmap CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

## Запуск

Нужен запущенный MySQL (локальный, в контейнере или в k8s — неважно, лишь бы был доступен по `DB_HOST:DB_PORT`).

```bash
cd backend
npm install
```

Задай переменные окружения (PowerShell):

```powershell
$env:DB_HOST="127.0.0.1"; $env:DB_PORT="3306"; $env:DB_USER="root"; $env:DB_PASSWORD="секрет"; $env:DB_NAME="roadmap"
```

или (bash):

```bash
export DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root DB_PASSWORD=секрет DB_NAME=roadmap
```

Затем:

```bash
npm run migrate   # создать таблицы
npm run seed      # заполнить тестовыми данными (тема DevOps, 4 шага)
npm start
```

Откройте http://localhost:3000

## Запуск бэкенда в контейнере

Образ содержит и бэкенд, и статику фронтенда, поэтому **контекст сборки — корень репозитория**, а не `backend/`:

```bash
docker build -f backend/Dockerfile -t roadmap-backend .
```

MySQL при этом остаётся на хосте. Из контейнера он доступен по `host.docker.internal`
(Docker Desktop сам проксирует это имя на хост, поэтому MySQL может слушать только `127.0.0.1`):

```bash
docker run -d --name roadmap-app -p 3001:3000 -e DB_HOST=host.docker.internal -e DB_PORT=3306 -e DB_USER=root -e DB_PASSWORD=devpass -e DB_NAME=roadmap roadmap-backend
```

Приложение будет на http://localhost:3001

Миграции и сид выполняются с хоста (см. выше) — контейнер только обслуживает запросы.

## API

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/themes` | Список всех тем |
| POST | `/themes` | Создать тему (body: `{ name }`) |
| GET | `/themes/:id/steps` | Все шаги темы по порядку, с флагом `completed` |
| GET | `/themes/:id/current-step` | Первый невыполненный шаг (`null`, если всё выполнено) |
| POST | `/themes/:id/steps` | Добавить шаг в конец темы (body: `{ title, description, resource_url }`) |
| POST | `/steps/:id/complete` | Отметить шаг выполненным (идемпотентно) |
| GET | `/themes/:id/progress` | `{ total, completed, percent }` |

## Полезные команды

```bash
npm run migrate:rollback   # откатить последнюю миграцию
npm run seed               # пересоздать тестовые данные (сбрасывает прогресс)
```
