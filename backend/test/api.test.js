const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../app');
const db = require('../db');

// Тесты чистят таблицы перед каждым кейсом. Предохранитель от запуска
// по рабочей базе: имя должно содержать "test".
if (!/test/i.test(process.env.DB_NAME || '')) {
  throw new Error(
    `Refusing to run tests against DB_NAME="${process.env.DB_NAME}": ` +
      'the test suite wipes all tables. Use a database whose name contains "test".'
  );
}

before(async () => {
  // Схему поднимаем сами — отдельный шаг миграции для тестов не нужен
  await db.migrate.latest();
});

beforeEach(async () => {
  // Порядок обратен зависимостям внешних ключей
  await db('progress').del();
  await db('steps').del();
  await db('themes').del();
});

after(async () => {
  // Без этого пул соединений держит процесс и node --test не завершается
  await db.destroy();
});

async function createTheme(name = 'Test theme') {
  const res = await request(app).post('/themes').send({ name }).expect(201);
  return res.body.id;
}

async function addStep(themeId, title) {
  const res = await request(app)
    .post(`/themes/${themeId}/steps`)
    .send({ title })
    .expect(201);
  return res.body.id;
}

test('POST /themes создаёт тему и она попадает в список', async () => {
  const res = await request(app).post('/themes').send({ name: 'DevOps' }).expect(201);
  assert.equal(res.body.name, 'DevOps');
  assert.ok(res.body.id > 0);

  const list = await request(app).get('/themes').expect(200);
  assert.deepEqual(
    list.body.map((t) => t.name),
    ['DevOps']
  );
});

test('POST /themes отклоняет пустое имя', async () => {
  await request(app).post('/themes').send({ name: '   ' }).expect(400);
  await request(app).post('/themes').send({}).expect(400);
});

test('DELETE /themes/:id удаляет тему вместе с шагами', async () => {
  const themeId = await createTheme();
  await addStep(themeId, 'Шаг 1');

  await request(app).delete(`/themes/${themeId}`).expect(204);

  const list = await request(app).get('/themes').expect(200);
  assert.deepEqual(list.body, []);

  // Каскад отработал на стороне базы
  const steps = await db('steps').where({ theme_id: themeId });
  assert.equal(steps.length, 0);
});

test('DELETE /themes/:id отвечает 404 для несуществующей темы', async () => {
  await request(app).delete('/themes/999999').expect(404);
});

test('шаги добавляются в конец темы', async () => {
  const themeId = await createTheme();
  await addStep(themeId, 'Первый');
  await addStep(themeId, 'Второй');

  const res = await request(app).get(`/themes/${themeId}/steps`).expect(200);
  assert.deepEqual(
    res.body.map((s) => [s.title, s.order_index]),
    [
      ['Первый', 1],
      ['Второй', 2],
    ]
  );
});

test('POST /themes/:id/steps проверяет тему и заголовок', async () => {
  await request(app).post('/themes/999999/steps').send({ title: 'x' }).expect(404);

  const themeId = await createTheme();
  await request(app).post(`/themes/${themeId}/steps`).send({ title: '  ' }).expect(400);
});

test('current-step возвращает первый невыполненный шаг, потом null', async () => {
  const themeId = await createTheme();
  const first = await addStep(themeId, 'Первый');
  const second = await addStep(themeId, 'Второй');

  let res = await request(app).get(`/themes/${themeId}/current-step`).expect(200);
  assert.equal(res.body.id, first);

  await request(app).post(`/steps/${first}/complete`).expect(200);
  res = await request(app).get(`/themes/${themeId}/current-step`).expect(200);
  assert.equal(res.body.id, second);

  await request(app).post(`/steps/${second}/complete`).expect(200);
  res = await request(app).get(`/themes/${themeId}/current-step`).expect(200);
  assert.equal(res.body, null);
});

test('отметка выполнения идемпотентна', async () => {
  const themeId = await createTheme();
  const stepId = await addStep(themeId, 'Единственный');

  await request(app).post(`/steps/${stepId}/complete`).expect(200);
  await request(app).post(`/steps/${stepId}/complete`).expect(200);

  const rows = await db('progress').where({ step_id: stepId });
  assert.equal(rows.length, 1, 'повторный вызов не должен плодить записи');

  const res = await request(app).get(`/themes/${themeId}/progress`).expect(200);
  assert.deepEqual(res.body, { total: 1, completed: 1, percent: 100 });
});

test('POST /steps/:id/complete отвечает 404 для несуществующего шага', async () => {
  await request(app).post('/steps/999999/complete').expect(404);
});

test('прогресс считается и округляется', async () => {
  const themeId = await createTheme();
  const first = await addStep(themeId, 'Первый');
  await addStep(themeId, 'Второй');
  await addStep(themeId, 'Третий');

  let res = await request(app).get(`/themes/${themeId}/progress`).expect(200);
  assert.deepEqual(res.body, { total: 3, completed: 0, percent: 0 });

  await request(app).post(`/steps/${first}/complete`).expect(200);
  res = await request(app).get(`/themes/${themeId}/progress`).expect(200);
  assert.deepEqual(res.body, { total: 3, completed: 1, percent: 33 });
});

test('прогресс пустой темы не делит на ноль', async () => {
  const themeId = await createTheme();
  const res = await request(app).get(`/themes/${themeId}/progress`).expect(200);
  assert.deepEqual(res.body, { total: 0, completed: 0, percent: 0 });
});
