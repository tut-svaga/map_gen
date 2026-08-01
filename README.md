# Roadmap Tracker (MVP)

Личный трекер прогресса по roadmap: темы → шаги по порядку → отметка выполнения → процент прогресса.

## Стек

- Backend: Node.js + Express
- База данных: SQLite (файл `backend/db/dev.sqlite3`)
- Миграции и запросы: Knex.js
- Frontend: статические HTML/CSS/JS (раздаются тем же Express-сервером)

## Структура

```
backend/
  server.js            # входная точка Express
  db.js                # инстанс knex
  knexfile.js          # конфиг подключения к SQLite
  routes/              # роуты API
  db/migrations/       # миграции (themes, steps, progress)
  db/seeds/            # сид с темой "DevOps" и 4 шагами
frontend/
  index.html           # прогресс-бар, карточка текущего шага, список шагов
  script.js
  style.css
```

## Запуск

```bash
cd backend
npm install
npm run migrate   # создать таблицы
npm run seed      # заполнить тестовыми данными (тема DevOps, 4 шага)
npm start
```

Откройте http://localhost:3000

## API

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/themes/:id/steps` | Все шаги темы по порядку, с флагом `completed` |
| GET | `/themes/:id/current-step` | Первый невыполненный шаг (`null`, если всё выполнено) |
| POST | `/steps/:id/complete` | Отметить шаг выполненным (идемпотентно) |
| GET | `/themes/:id/progress` | `{ total, completed, percent }` |

## Полезные команды

```bash
npm run migrate:rollback   # откатить последнюю миграцию
npm run seed               # пересоздать тестовые данные (сбрасывает прогресс)
```
