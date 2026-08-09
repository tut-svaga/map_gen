// Календарные даты живут строками 'YYYY-MM-DD' — так же, как в базе.
// Через Date их не гоняем: он несёт часовой пояс, из-за которого дата
// при сериализации уезжает на сутки. Строки этого формата к тому же
// сравниваются лексикографически как настоящие даты.

const MONTHS_SHORT = [
  'янв', 'фев', 'мар', 'апр', 'мая', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек',
];

const WEEKDAYS_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

const pad = (n: number) => String(n).padStart(2, '0');

/** Сегодняшняя дата по часам браузера — то есть по часам пользователя. */
export function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Арифметика по дням через UTC: в локальной зоне её ломает переход на летнее время. */
export function addDays(day: string, count: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + count));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function daysBetween(from: string, to: string): number {
  const parse = (day: string) => {
    const [y, m, d] = day.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(to) - parse(from)) / 86_400_000);
}

/** Все дни отрезка включительно. Для окна заморозки это ~93 элемента. */
export function rangeOfDays(start: string, end: string): string[] {
  const out: string[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) {
    out.push(day);
  }
  return out;
}

export function humanDay(day: string): string {
  const [, m, d] = day.split('-').map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

export function humanDayFull(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const weekday = WEEKDAYS_SHORT[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${d} ${MONTHS_SHORT[m - 1]}, ${weekday}`;
}

export function isWeekend(day: string): boolean {
  const [y, m, d] = day.split('-').map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

/** Русское склонение: plural(3, 'день', 'дня', 'дней') → 'дня'. */
export function plural(n: number, one: string, few: string, many: string): string {
  const hundreds = n % 100;
  const tens = n % 10;
  if (hundreds > 10 && hundreds < 20) return many;
  if (tens === 1) return one;
  if (tens > 1 && tens < 5) return few;
  return many;
}
