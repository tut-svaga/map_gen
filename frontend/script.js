// MVP работает с одной темой; при добавлении списка тем этот id станет динамическим
const THEME_ID = 1;

const progressFill = document.getElementById('progress-fill');
const progressLabel = document.getElementById('progress-label');
const currentStepCard = document.getElementById('current-step-card');
const stepsList = document.getElementById('steps-list');

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return res.json();
}

function renderProgress({ percent, completed, total }) {
  progressFill.style.width = `${percent}%`;
  progressLabel.textContent = `${percent}%`;
  progressLabel.title = `${completed} из ${total}`;
}

function renderCurrentStep(step) {
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

async function completeStep(stepId, button) {
  // Блокируем кнопку на время запроса, чтобы не отправить дубль
  button.disabled = true;
  try {
    await fetchJson(`/steps/${stepId}/complete`, { method: 'POST' });
    await loadAll();
  } catch (err) {
    console.error(err);
    button.disabled = false;
    alert('Не удалось отметить шаг. Попробуйте ещё раз.');
  }
}

async function loadAll() {
  try {
    const [progress, currentStep, steps] = await Promise.all([
      fetchJson(`/themes/${THEME_ID}/progress`),
      fetchJson(`/themes/${THEME_ID}/current-step`),
      fetchJson(`/themes/${THEME_ID}/steps`),
    ]);
    renderProgress(progress);
    renderCurrentStep(currentStep);
    renderStepsList(steps);
  } catch (err) {
    console.error(err);
    currentStepCard.innerHTML =
      '<p class="error">Ошибка загрузки данных. Проверьте, что сервер запущен.</p>';
  }
}

loadAll();
