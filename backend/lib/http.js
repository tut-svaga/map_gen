// Мелкие помощники, общие для всех роутеров. Вынесены, чтобы валидация
// выглядела одинаково во всех ручках: id и текст проверяются в одном месте.

function badRequest(res, message) {
  return res.status(400).json({ error: message });
}

function notFound(res, what) {
  return res.status(404).json({ error: `${what} not found` });
}

// Number('abc') даёт NaN, и такой id уезжает в SQL как есть — MySQL отвечает
// ошибкой драйвера, то есть 500 вместо честного 400.
function parseId(value) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// Возвращает обрезанную строку или null, если её нет / она пустая / длинее max.
// Один null на все три случая: вызывающему коду нужен один ответ — «непригодно».
function normalizeText(value, max) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > max) return null;
  return text;
}

// Необязательное текстовое поле: пустая строка и пробелы означают «стереть»,
// поэтому превращаются в NULL, а не в пустую строку в базе.
// Возвращает { ok, value }, а не значение с особым сентинелом: у поля есть
// легальное значение null, и отличить «очистить» от «невалидно» иначе никак.
function optionalText(value, max) {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== 'string' || value.length > max) return { ok: false, value: null };
  return { ok: true, value: value.trim() || null };
}

module.exports = { badRequest, notFound, parseId, normalizeText, optionalText };
