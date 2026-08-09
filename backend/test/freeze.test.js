const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../app');
const db = require('../db');
const { START, END } = require('../config/freeze');

// Тот же предохранитель, что и в api.test.js: набор чистит таблицы,
// поэтому по рабочей базе запускаться не должен.
if (!/test/i.test(process.env.DB_NAME || '')) {
  throw new Error(
    `Refusing to run tests against DB_NAME="${process.env.DB_NAME}": ` +
      'the test suite wipes all tables. Use a database whose name contains "test".'
  );
}

// Даты берём от START, а не хардкодим: окно настраивается окружением,
// и захардкоженный день однажды окажется за его границей.
function addDays(day, count) {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + count));
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

const DAY_1 = START;
const DAY_2 = addDays(START, 1);

before(async () => {
  await db.migrate.latest();
});

beforeEach(async () => {
  await db('freeze_days').del();
  await db('freeze_goals').del();
  await db('freeze_doubts').del();
});

after(async () => {
  await db.destroy();
});

test('GET /freeze отдаёт окно заморозки и пустое состояние', async () => {
  const res = await request(app).get('/freeze').expect(200);
  assert.equal(res.body.start, START);
  assert.equal(res.body.end, END);
  assert.deepEqual(res.body.days, []);
  assert.deepEqual(res.body.goals, []);
  assert.deepEqual(res.body.doubts, []);
});

test('PUT дня сохраняет отметку и заметку, повтор перезаписывает', async () => {
  await request(app)
    .put(`/freeze/days/${DAY_1}`)
    .send({ worked: true, note: 'разбирал nginx' })
    .expect(200);

  let res = await request(app).get('/freeze').expect(200);
  assert.deepEqual(res.body.days, [{ day: DAY_1, worked: true, note: 'разбирал nginx' }]);

  // Идемпотентность: второй PUT меняет запись, а не добавляет вторую
  await request(app).put(`/freeze/days/${DAY_1}`).send({ worked: false, note: '' }).expect(200);

  res = await request(app).get('/freeze').expect(200);
  assert.equal(res.body.days.length, 1);
  assert.deepEqual(res.body.days[0], { day: DAY_1, worked: false, note: '' });
});

test('день можно оставить без отметки, но с заметкой', async () => {
  await request(app).put(`/freeze/days/${DAY_1}`).send({ worked: null, note: 'болел' }).expect(200);

  const res = await request(app).get('/freeze').expect(200);
  assert.deepEqual(res.body.days[0], { day: DAY_1, worked: null, note: 'болел' });
});

test('PUT дня отклоняет мусор в дате, дате вне окна и типе worked', async () => {
  await request(app).put('/freeze/days/2026-13-40').send({ worked: true }).expect(400);
  await request(app).put('/freeze/days/tomorrow').send({ worked: true }).expect(400);
  await request(app).put(`/freeze/days/${addDays(START, -1)}`).send({ worked: true }).expect(400);
  await request(app).put(`/freeze/days/${addDays(END, 1)}`).send({ worked: true }).expect(400);
  await request(app).put(`/freeze/days/${DAY_1}`).send({ worked: 'yes' }).expect(400);
});

test('DELETE дня стирает его и не жалуется на отсутствующий', async () => {
  await request(app).put(`/freeze/days/${DAY_1}`).send({ worked: true }).expect(200);
  await request(app).delete(`/freeze/days/${DAY_1}`).expect(204);
  await request(app).delete(`/freeze/days/${DAY_2}`).expect(204);

  const res = await request(app).get('/freeze').expect(200);
  assert.deepEqual(res.body.days, []);
});

test('цель создаётся, отмечается с датой и снимается без неё', async () => {
  const created = await request(app)
    .post('/freeze/goals')
    .send({ text: 'Найти уязвимость' })
    .expect(201);
  const id = created.body.id;
  assert.deepEqual(created.body, { id, text: 'Найти уязвимость', done: false, done_at: null });

  const done = await request(app)
    .patch(`/freeze/goals/${id}`)
    .send({ done: true, day: DAY_2 })
    .expect(200);
  assert.equal(done.body.done, true);
  assert.equal(done.body.done_at, DAY_2);

  // Снятие отметки обязано обнулить дату выполнения
  const undone = await request(app).patch(`/freeze/goals/${id}`).send({ done: false }).expect(200);
  assert.equal(undone.body.done, false);
  assert.equal(undone.body.done_at, null);
});

test('текст цели можно поменять, пустой не принимается', async () => {
  const created = await request(app).post('/freeze/goals').send({ text: 'старый' }).expect(201);
  const id = created.body.id;

  const res = await request(app).patch(`/freeze/goals/${id}`).send({ text: '  новый  ' }).expect(200);
  assert.equal(res.body.text, 'новый');

  await request(app).patch(`/freeze/goals/${id}`).send({ text: '   ' }).expect(400);
  await request(app).patch(`/freeze/goals/${id}`).send({}).expect(400);
  await request(app).post('/freeze/goals').send({ text: 'x'.repeat(501) }).expect(400);
});

test('несуществующая цель — 404, кривой id — 400', async () => {
  await request(app).patch('/freeze/goals/999999').send({ done: true }).expect(404);
  await request(app).delete('/freeze/goals/999999').expect(404);
  await request(app).delete('/freeze/goals/abc').expect(400);
});

test('цель удаляется', async () => {
  const created = await request(app).post('/freeze/goals').send({ text: 'уйдёт' }).expect(201);
  await request(app).delete(`/freeze/goals/${created.body.id}`).expect(204);

  const res = await request(app).get('/freeze').expect(200);
  assert.deepEqual(res.body.goals, []);
});

test('сомнения пишутся с днём клиента и отдаются свежими сверху', async () => {
  await request(app).post('/freeze/doubts').send({ text: 'первое', day: DAY_1 }).expect(201);
  const second = await request(app)
    .post('/freeze/doubts')
    .send({ text: 'второе', day: DAY_2 })
    .expect(201);

  const res = await request(app).get('/freeze').expect(200);
  assert.deepEqual(
    res.body.doubts.map((d) => d.text),
    ['второе', 'первое']
  );
  assert.equal(res.body.doubts[0].day, DAY_2);

  await request(app).delete(`/freeze/doubts/${second.body.id}`).expect(204);
  const after = await request(app).get('/freeze').expect(200);
  assert.equal(after.body.doubts.length, 1);
});

test('день сомнения проверяется, а без него подставляется дата сервера', async () => {
  await request(app).post('/freeze/doubts').send({ text: 'x', day: 'вчера' }).expect(400);

  const res = await request(app).post('/freeze/doubts').send({ text: 'x' }).expect(201);
  assert.match(res.body.day, /^\d{4}-\d{2}-\d{2}$/);
});

test('DELETE /freeze стирает всё разом', async () => {
  await request(app).put(`/freeze/days/${DAY_1}`).send({ worked: true }).expect(200);
  await request(app).post('/freeze/goals').send({ text: 'цель' }).expect(201);
  await request(app).post('/freeze/doubts').send({ text: 'сомнение', day: DAY_1 }).expect(201);

  await request(app).delete('/freeze').expect(204);

  const res = await request(app).get('/freeze').expect(200);
  assert.deepEqual(res.body.days, []);
  assert.deepEqual(res.body.goals, []);
  assert.deepEqual(res.body.doubts, []);
});
