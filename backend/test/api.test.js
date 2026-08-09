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

test('список тем несёт счётчики шагов', async () => {
  const themeId = await createTheme('Со счётчиками');
  const first = await addStep(themeId, 'Первый');
  await addStep(themeId, 'Второй');
  await request(app).post(`/steps/${first}/complete`).expect(200);

  // Тема без шагов не должна выпасть из списка из-за GROUP BY
  await createTheme('Пустая');

  const res = await request(app).get('/themes').expect(200);
  assert.deepEqual(
    res.body.map((t) => [t.name, t.total, t.completed, t.percent]),
    [
      ['Со счётчиками', 2, 1, 50],
      ['Пустая', 0, 0, 0],
    ]
  );
});

test('PATCH /themes/:id переименовывает тему', async () => {
  const themeId = await createTheme('Старое имя');

  const res = await request(app).patch(`/themes/${themeId}`).send({ name: ' Новое ' }).expect(200);
  assert.equal(res.body.name, 'Новое');

  await request(app).patch(`/themes/${themeId}`).send({ name: '  ' }).expect(400);
  await request(app).patch('/themes/999999').send({ name: 'x' }).expect(404);
});

test('кривой id темы — 400, а не 500', async () => {
  await request(app).delete('/themes/abc').expect(400);
  await request(app).get('/themes/abc/steps').expect(400);
});

test('PATCH /steps/:id меняет только присланные поля', async () => {
  const themeId = await createTheme();
  const stepId = await addStep(themeId, 'Заголовок');
  await request(app)
    .patch(`/steps/${stepId}`)
    .send({ description: 'описание', resource_url: 'https://example.com' })
    .expect(200);

  const res = await request(app).patch(`/steps/${stepId}`).send({ title: 'Другой' }).expect(200);
  assert.equal(res.body.title, 'Другой');
  // Поля, которых не было в теле, остались нетронутыми
  assert.equal(res.body.description, 'описание');
  assert.equal(res.body.resource_url, 'https://example.com');

  // Пустая строка — это «сотри», в отличие от отсутствующего ключа
  const cleared = await request(app).patch(`/steps/${stepId}`).send({ description: '' }).expect(200);
  assert.equal(cleared.body.description, null);

  await request(app).patch(`/steps/${stepId}`).send({ title: '   ' }).expect(400);
  await request(app).patch(`/steps/${stepId}`).send({}).expect(400);
  await request(app).patch('/steps/999999').send({ title: 'x' }).expect(404);
});

test('DELETE /steps/:id удаляет шаг вместе с прогрессом', async () => {
  const themeId = await createTheme();
  const stepId = await addStep(themeId, 'Уйдёт');
  await request(app).post(`/steps/${stepId}/complete`).expect(200);

  await request(app).delete(`/steps/${stepId}`).expect(204);
  await request(app).delete(`/steps/${stepId}`).expect(404);

  const rows = await db('progress').where({ step_id: stepId });
  assert.equal(rows.length, 0, 'каскад должен был убрать запись прогресса');

  const res = await request(app).get(`/themes/${themeId}/progress`).expect(200);
  assert.deepEqual(res.body, { total: 0, completed: 0, percent: 0 });
});

test('отметку выполнения можно снять', async () => {
  const themeId = await createTheme();
  const stepId = await addStep(themeId, 'Туда-обратно');

  await request(app).post(`/steps/${stepId}/complete`).expect(200);
  await request(app).delete(`/steps/${stepId}/complete`).expect(200);

  const rows = await db('progress').where({ step_id: stepId });
  assert.equal(rows.length, 0, 'снятие отметки удаляет строку прогресса целиком');

  const res = await request(app).get(`/themes/${themeId}/current-step`).expect(200);
  assert.equal(res.body.id, stepId, 'шаг снова стал текущим');

  // Снимать уже снятое можно сколько угодно
  await request(app).delete(`/steps/${stepId}/complete`).expect(200);
  await request(app).delete('/steps/999999/complete').expect(404);
});

test('шаг двигается вверх и вниз, с краю никуда не двигается', async () => {
  const themeId = await createTheme();
  const first = await addStep(themeId, 'Первый');
  const second = await addStep(themeId, 'Второй');
  const third = await addStep(themeId, 'Третий');

  const order = async () => {
    const res = await request(app).get(`/themes/${themeId}/steps`).expect(200);
    return res.body.map((s) => s.title);
  };

  let res = await request(app).post(`/steps/${third}/move`).send({ direction: 'up' }).expect(200);
  assert.equal(res.body.moved, true);
  assert.deepEqual(await order(), ['Первый', 'Третий', 'Второй']);

  await request(app).post(`/steps/${first}/move`).send({ direction: 'down' }).expect(200);
  assert.deepEqual(await order(), ['Третий', 'Первый', 'Второй']);

  res = await request(app).post(`/steps/${third}/move`).send({ direction: 'up' }).expect(200);
  assert.equal(res.body.moved, false, 'верхний шаг двигать некуда');
  assert.deepEqual(await order(), ['Третий', 'Первый', 'Второй']);

  await request(app).post(`/steps/${second}/move`).send({ direction: 'sideways' }).expect(400);
});

test('перестановка не задевает соседние темы', async () => {
  const themeA = await createTheme('A');
  const themeB = await createTheme('B');
  await addStep(themeA, 'A1');
  const a2 = await addStep(themeA, 'A2');
  await addStep(themeB, 'B1');
  await addStep(themeB, 'B2');

  await request(app).post(`/steps/${a2}/move`).send({ direction: 'up' }).expect(200);

  const res = await request(app).get(`/themes/${themeB}/steps`).expect(200);
  assert.deepEqual(
    res.body.map((s) => s.title),
    ['B1', 'B2']
  );
});

test('служебные ручки и неизвестный путь отвечают JSON', async () => {
  const health = await request(app).get('/health').expect(200);
  assert.deepEqual(health.body, { status: 'ok' });

  const ready = await request(app).get('/ready').expect(200);
  assert.deepEqual(ready.body, { status: 'ready' });

  const missing = await request(app).get('/nope').expect(404);
  assert.ok(missing.body.error, 'у 404 должно быть JSON-тело, а не HTML Express');
});
