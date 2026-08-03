// Текущая выбранная тема; выставляется после загрузки списка тем
let currentThemeId = null;

const themeName = document.getElementById('theme-name');
const themeSelect = document.getElementById('theme-select');
const progressFill = document.getElementById('progress-fill');
const progressLabel = document.getElementById('progress-label');
const currentStepCard = document.getElementById('current-step-card');
const stepsList = document.getElementById('steps-list');
const createThemeForm = document.getElementById('create-theme-form');
const addStepForm = document.getElementById('add-step-form');

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.json();
}

function postJson(url, body) {
  return fetchJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function renderProgress({ percent, completed, total }) {
  progressFill.style.width = `${percent}%`;
  progressLabel.textContent = `${percent}%`;
  progressLabel.title = `${completed} из ${total}`;
}

function renderCurrentStep(step, totalSteps) {
  if (totalSteps === 0) {
    currentStepCard.innerHTML =
      '<p class="empty">В этой теме пока нет шагов — добавьте первый через форму ниже.</p>';
    return;
  }

  if (!step) {
    currentStepCard.innerHTML =
      '<p class="all-done">🎉 Все шаги выполнены!</p>';
    return;
  }

  currentStepCard.innerHTML = '';

  const title = document.createElement('h2');
  title.textContent = `Шаг ${step.order_index}. ${step.title}`;

  const description = document.createElement('p');
  description.textContent = step.description || '';

  const button = document.createElement('button');
  button.className = 'complete-btn';
  button.textContent = 'Выполнено';
  button.addEventListener('click', () => completeStep(step.id, button));

  currentStepCard.append(title, description);

  if (step.resource_url) {
    const link = document.createElement('a');
    link.href = step.resource_url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = step.resource_url;
    currentStepCard.append(link);
  }

  currentStepCard.append(button);
}

function renderStepsList(steps) {
  stepsList.innerHTML = '';
  for (const step of steps) {
    const li = document.createElement('li');
    li.textContent = step.title;
    if (step.completed) {
      li.classList.add('done');
    }
    stepsList.append(li);
  }
}

// Загружает список тем, обновляет селектор и заголовок.
// keepThemeId — какую тему оставить выбранной (например, только что созданную).
async function loadThemes(keepThemeId) {
  const themes = await fetchJson('/themes');

  if (themes.length === 0) {
    currentThemeId = null;
    themeName.textContent = 'Roadmap';
    themeSelect.hidden = true;
    currentStepCard.innerHTML =
      '<p class="empty">Тем пока нет — создайте первую через форму ниже.</p>';
    return;
  }

  const found = themes.find((t) => t.id === keepThemeId);
  currentThemeId = found ? found.id : themes[0].id;

  themeSelect.innerHTML = '';
  for (const theme of themes) {
    const option = document.createElement('option');
    option.value = theme.id;
    option.textContent = theme.name;
    themeSelect.append(option);
  }
  themeSelect.value = currentThemeId;

  // Селектор нужен только когда есть из чего выбирать
  themeSelect.hidden = themes.length < 2;

  const current = themes.find((t) => t.id === currentThemeId);
  themeName.textContent = current.name;
}

async function loadThemeData() {
  if (currentThemeId == null) return;
  const [progress, currentStep, steps] = await Promise.all([
    fetchJson(`/themes/${currentThemeId}/progress`),
    fetchJson(`/themes/${currentThemeId}/current-step`),
    fetchJson(`/themes/${currentThemeId}/steps`),
  ]);
  renderProgress(progress);
  renderCurrentStep(currentStep, steps.length);
  renderStepsList(steps);
}

async function completeStep(stepId, button) {
  // Блокируем кнопку на время запроса, чтобы не отправить дубль
  button.disabled = true;
  try {
    await postJson(`/steps/${stepId}/complete`);
    await loadThemeData();
  } catch (err) {
    console.error(err);
    button.disabled = false;
    alert('Не удалось отметить шаг. Попробуйте ещё раз.');
  }
}

themeSelect.addEventListener('change', async () => {
  currentThemeId = Number(themeSelect.value);
  const selected = themeSelect.options[themeSelect.selectedIndex];
  themeName.textContent = selected.textContent;
  await loadThemeData();
});

createThemeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = createThemeForm.elements.name.value.trim();
  if (!name) return;
  try {
    const created = await postJson('/themes', { name });
    createThemeForm.reset();
    // Переключаемся на только что созданную тему
    await loadThemes(created.id);
    await loadThemeData();
  } catch (err) {
    console.error(err);
    alert('Не удалось создать тему.');
  }
});

addStepForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (currentThemeId == null) {
    alert('Сначала создайте тему.');
    return;
  }
  const title = addStepForm.elements.title.value.trim();
  if (!title) return;
  try {
    await postJson(`/themes/${currentThemeId}/steps`, {
      title,
      description: addStepForm.elements.description.value,
      resource_url: addStepForm.elements.resource_url.value,
    });
    addStepForm.reset();
    await loadThemeData();
  } catch (err) {
    console.error(err);
    alert('Не удалось добавить шаг.');
  }
});

async function init() {
  try {
    await loadThemes();
    await loadThemeData();
  } catch (err) {
    console.error(err);
    currentStepCard.innerHTML =
      '<p class="error">Ошибка загрузки данных. Проверьте, что сервер запущен.</p>';
  }
}

init();
