// Окно заморозки. Даты можно переопределить окружением, чтобы не пересобирать
// образ ради сдвига срока: FREEZE_START / FREEZE_END в формате YYYY-MM-DD.
// В отличие от параметров БД, дефолт здесь безопасен — приложение с ним
// работает корректно, а не притворяется живым.
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isDay(value) {
  if (typeof value !== 'string' || !DAY_PATTERN.test(value)) {
    return false;
  }
  // Отсекаем синтаксически валидные, но несуществующие даты вроде 2026-02-31:
  // Date нормализует их в 2026-03-03, и обратная сборка строки не совпадёт.
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
  );
}

const START = process.env.FREEZE_START || '2026-08-06';
const END = process.env.FREEZE_END || '2026-11-06';

for (const [name, value] of [
  ['FREEZE_START', START],
  ['FREEZE_END', END],
]) {
  if (!isDay(value)) {
    throw new Error(`${name}="${value}" is not a valid date in YYYY-MM-DD format`);
  }
}

if (START > END) {
  // Строки формата YYYY-MM-DD сравниваются лексикографически как даты
  throw new Error(`FREEZE_START (${START}) must not be later than FREEZE_END (${END})`);
}

// Дата по часам сервера. Нужна только как запасной вариант: клиент присылает
// свой день сам, потому что знает часовой пояс пользователя, а контейнер
// почти всегда живёт в UTC.
function serverToday() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

module.exports = { START, END, isDay, serverToday };
