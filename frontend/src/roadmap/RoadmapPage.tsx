import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ApiError, stepsApi, themesApi } from '../lib/api';
import type { Step, Theme } from '../types';
import { useFeedback } from '../ui/feedback-context';
import { PencilIcon, PlusIcon, TrashIcon } from '../ui/icons';
import { ProgressRing } from './ProgressRing';
import { StepRow } from './StepRow';
import styles from './RoadmapPage.module.css';

// Последняя открытая тема переживает перезагрузку: возвращаться каждый раз
// к первой теме из списка — мелочь, но раздражающая.
const ACTIVE_THEME_KEY = 'roadmap:active-theme';

const errorText = (err: unknown) =>
  err instanceof ApiError ? err.message : 'Что-то пошло не так. Попробуй ещё раз.';

const readStoredTheme = (): number | null => {
  const raw = window.localStorage.getItem(ACTIVE_THEME_KEY);
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
};

const emptyStepDraft = { title: '', description: '', resource_url: '' };

export function RoadmapPage() {
  const { notify, confirm } = useFeedback();

  const [themes, setThemes] = useState<Theme[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [loadedSteps, setSteps] = useState<Step[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stepsVersion, setStepsVersion] = useState(0);
  const [busyStepId, setBusyStepId] = useState<number | null>(null);

  const [themeDraft, setThemeDraft] = useState('');
  const [creatingTheme, setCreatingTheme] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [stepDraft, setStepDraft] = useState(emptyStepDraft);
  const [addingStep, setAddingStep] = useState(false);

  const reloadSteps = useCallback(() => setStepsVersion((v) => v + 1), []);

  const applyThemes = useCallback((list: Theme[], preferId?: number) => {
    setThemes(list);
    setActiveId((current) => {
      const wanted = preferId ?? current ?? readStoredTheme();
      if (wanted != null && list.some((theme) => theme.id === wanted)) return wanted;
      return list[0]?.id ?? null;
    });
  }, []);

  const refreshThemes = useCallback(
    async (preferId?: number) => {
      applyThemes(await themesApi.list(), preferId);
    },
    [applyThemes]
  );

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const list = await themesApi.list();
        if (!cancelled) applyThemes(list);
      } catch (err) {
        if (!cancelled) setLoadError(errorText(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [applyThemes]);

  useEffect(() => {
    if (activeId == null) return;
    window.localStorage.setItem(ACTIVE_THEME_KEY, String(activeId));

    // Флаг отмены: при быстром переключении тем ответы могут прийти не в том
    // порядке, в каком уходили запросы, и старый список перетрёт новый.
    let cancelled = false;
    themesApi
      .steps(activeId)
      .then((list) => {
        if (!cancelled) setSteps(list);
      })
      .catch((err) => {
        if (!cancelled) notify(errorText(err), 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [activeId, stepsVersion, notify]);

  const activeTheme = themes.find((theme) => theme.id === activeId) ?? null;

  // Когда темы нет, список шагов пуст по определению — это выводится из
  // activeId, а не хранится отдельным состоянием, которое надо не забыть сбросить.
  // useMemo не ради скорости, а ради ссылочной стабильности: без него пустой
  // литерал был бы новым массивом на каждый рендер и обнулял бы мемоизацию ниже.
  const steps = useMemo(() => (activeId == null ? [] : loadedSteps), [activeId, loadedSteps]);

  const stats = useMemo(() => {
    const total = steps.length;
    const completed = steps.filter((step) => step.completed).length;
    return { total, completed, percent: total === 0 ? 0 : Math.round((completed / total) * 100) };
  }, [steps]);

  const currentStep = steps.find((step) => !step.completed) ?? null;

  // Счётчики в ленте тем правим на месте: перезапрашивать весь список ради
  // одной изменившейся цифры — лишний round-trip на каждый клик по галочке.
  const shiftThemeCount = useCallback((themeId: number, delta: number) => {
    setThemes((current) =>
      current.map((theme) => {
        if (theme.id !== themeId) return theme;
        const completed = Math.max(0, Math.min(theme.total, theme.completed + delta));
        return {
          ...theme,
          completed,
          percent: theme.total === 0 ? 0 : Math.round((completed / theme.total) * 100),
        };
      })
    );
  }, []);

  const toggleStep = async (step: Step) => {
    if (activeId == null) return;
    const next = !step.completed;

    // Оптимистично: галочка ставится мгновенно, а если сервер откажет —
    // откатываем и говорим об этом. Ждать round-trip ради одного клика незачем.
    setSteps((current) => current.map((s) => (s.id === step.id ? { ...s, completed: next } : s)));
    shiftThemeCount(activeId, next ? 1 : -1);
    setBusyStepId(step.id);

    try {
      await (next ? stepsApi.complete(step.id) : stepsApi.uncomplete(step.id));
    } catch (err) {
      setSteps((current) => current.map((s) => (s.id === step.id ? { ...s, completed: !next } : s)));
      shiftThemeCount(activeId, next ? -1 : 1);
      notify(errorText(err), 'error');
    } finally {
      setBusyStepId(null);
    }
  };

  const moveStep = async (step: Step, direction: 'up' | 'down') => {
    setBusyStepId(step.id);
    try {
      await stepsApi.move(step.id, direction);
      reloadSteps();
    } catch (err) {
      notify(errorText(err), 'error');
    } finally {
      setBusyStepId(null);
    }
  };

  const saveStep = async (
    step: Step,
    patch: { title: string; description: string; resource_url: string }
  ) => {
    try {
      const updated = await stepsApi.update(step.id, patch);
      setSteps((current) =>
        current.map((s) => (s.id === step.id ? { ...s, ...updated, completed: s.completed } : s))
      );
    } catch (err) {
      notify(errorText(err), 'error');
    }
  };

  const deleteStep = async (step: Step) => {
    const ok = await confirm({
      title: 'Удалить шаг?',
      body: `«${step.title}» исчезнет вместе с отметкой о выполнении.`,
      confirmLabel: 'Удалить',
      danger: true,
    });
    if (!ok || activeId == null) return;

    try {
      await stepsApi.remove(step.id);
      setSteps((current) => current.filter((s) => s.id !== step.id));
      await refreshThemes(activeId);
    } catch (err) {
      notify(errorText(err), 'error');
      reloadSteps();
    }
  };

  const addStep = async (event: FormEvent) => {
    event.preventDefault();
    if (activeId == null || !stepDraft.title.trim()) return;

    setAddingStep(true);
    try {
      const created = await themesApi.addStep(activeId, stepDraft);
      setSteps((current) => [...current, created]);
      setStepDraft(emptyStepDraft);
      await refreshThemes(activeId);
    } catch (err) {
      notify(errorText(err), 'error');
    } finally {
      setAddingStep(false);
    }
  };

  const createTheme = async (event: FormEvent) => {
    event.preventDefault();
    if (!themeDraft.trim()) return;

    try {
      const created = await themesApi.create(themeDraft);
      setThemeDraft('');
      setCreatingTheme(false);
      await refreshThemes(created.id);
    } catch (err) {
      notify(errorText(err), 'error');
    }
  };

  const renameTheme = async () => {
    if (activeId == null || !nameDraft.trim()) return;
    try {
      const updated = await themesApi.rename(activeId, nameDraft);
      setThemes((current) =>
        current.map((theme) => (theme.id === activeId ? { ...theme, name: updated.name } : theme))
      );
      setRenaming(false);
    } catch (err) {
      notify(errorText(err), 'error');
    }
  };

  const deleteTheme = async () => {
    if (!activeTheme) return;
    const ok = await confirm({
      title: 'Удалить тему?',
      body: `«${activeTheme.name}» уйдёт вместе со всеми шагами и прогрессом. Отменить нельзя.`,
      confirmLabel: 'Удалить тему',
      danger: true,
    });
    if (!ok) return;

    try {
      await themesApi.remove(activeTheme.id);
      window.localStorage.removeItem(ACTIVE_THEME_KEY);
      setActiveId(null);
      await refreshThemes();
      notify(`Тема «${activeTheme.name}» удалена`);
    } catch (err) {
      notify(errorText(err), 'error');
    }
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <section className="card">
          <div className={styles.skeleton} style={{ width: '40%' }} />
          <div className={styles.skeleton} style={{ width: '70%', marginTop: 14 }} />
          <div className={styles.skeleton} style={{ width: '55%', marginTop: 14 }} />
        </section>
      </div>
    );
  }

  if (loadError) {
    return (
      <section className="card">
        <p className="eyebrow">Не загрузилось</p>
        <p className={styles.currentDescription}>{loadError}</p>
        <div className={styles.currentActions}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setLoadError(null);
              setLoading(true);
              refreshThemes()
                .catch((err) => setLoadError(errorText(err)))
                .finally(() => setLoading(false));
            }}
          >
            Повторить
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className={styles.page}>
      <div className={`${styles.themeBar} no-scrollbar`}>
        {themes.map((theme) => (
          <button
            key={theme.id}
            type="button"
            className={styles.themeChip}
            aria-pressed={theme.id === activeId}
            onClick={() => setActiveId(theme.id)}
          >
            {theme.name}
            <span className={styles.chipCount}>
              {theme.completed}/{theme.total}
            </span>
          </button>
        ))}
        <button
          type="button"
          className={styles.addTheme}
          onClick={() => setCreatingTheme((open) => !open)}
          aria-label="Создать тему"
          aria-expanded={creatingTheme}
        >
          +
        </button>
      </div>

      <AnimatePresence initial={false}>
        {creatingTheme && (
          <motion.section
            className="card"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <p className="eyebrow">Новая тема</p>
            <form className={styles.form} onSubmit={createTheme} style={{ marginTop: 12 }}>
              <div className={styles.formRow}>
                <input
                  className="field"
                  value={themeDraft}
                  onChange={(event) => setThemeDraft(event.target.value)}
                  placeholder="Например, Kubernetes"
                  autoFocus
                  maxLength={200}
                />
                <button type="submit" className="btn btn-primary" disabled={!themeDraft.trim()}>
                  Создать
                </button>
              </div>
            </form>
          </motion.section>
        )}
      </AnimatePresence>

      {!activeTheme ? (
        <section className="card">
          <p className="eyebrow">Пусто</p>
          <p className={styles.currentTitle}>Ни одной темы</p>
          <p className={styles.currentDescription}>
            Тема — это маршрут: набор шагов в том порядке, в каком собираешься их проходить.
            Создай первую кнопкой «+» выше.
          </p>
        </section>
      ) : (
        <>
          <section className="card">
            <div className={styles.head}>
              <div className={styles.headText}>
                <p className="eyebrow">Тема</p>
                {renaming ? (
                  <input
                    className={`field ${styles.nameInput}`}
                    value={nameDraft}
                    onChange={(event) => setNameDraft(event.target.value)}
                    autoFocus
                    maxLength={200}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void renameTheme();
                      if (event.key === 'Escape') {
                        // Черновик возвращаем к исходному имени: поле сейчас
                        // потеряет фокус, а onBlur сохраняет — без этого
                        // отмена по Escape сохранила бы отменённое.
                        setNameDraft(activeTheme.name);
                        setRenaming(false);
                      }
                    }}
                    onBlur={() => void renameTheme()}
                  />
                ) : (
                  <h1 className={styles.themeName}>{activeTheme.name}</h1>
                )}
                <p className={styles.headStats}>
                  {stats.completed} из {stats.total} шагов
                  {currentStep ? ` · сейчас #${currentStep.order_index}` : ''}
                </p>
                <div className={styles.headActions}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setNameDraft(activeTheme.name);
                      setRenaming(true);
                    }}
                  >
                    <PencilIcon /> Переименовать
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm btn-danger" onClick={() => void deleteTheme()}>
                    <TrashIcon /> Удалить тему
                  </button>
                </div>
              </div>
              <ProgressRing percent={stats.percent} label={`Прогресс ${stats.percent} процентов`} />
            </div>
          </section>

          <section className={`card ${styles.current}`}>
            <p className="eyebrow">Текущий шаг</p>
            {/* Без mode="wait": здесь содержимое меняется не по клику, а когда
                приходят данные. Если анимация выхода почему-то не доиграет
                (например, вкладка в фоне и rAF не тикает), «wait» держал бы на
                экране устаревший текст. Пусть лучше новый блок появится сразу. */}
            <AnimatePresence>
              <motion.div
                key={currentStep?.id ?? (stats.total === 0 ? 'empty' : 'done')}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                {stats.total === 0 ? (
                  <>
                    <h2 className={styles.currentTitle}>Шагов пока нет</h2>
                    <p className={styles.currentDescription}>
                      Добавь первый шаг формой внизу — он сразу станет текущим.
                    </p>
                  </>
                ) : currentStep ? (
                  <>
                    <h2 className={styles.currentTitle}>{currentStep.title}</h2>
                    {currentStep.description && (
                      <p className={styles.currentDescription}>{currentStep.description}</p>
                    )}
                    {currentStep.resource_url && (
                      <a
                        className={styles.currentLink}
                        href={currentStep.resource_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {currentStep.resource_url}
                      </a>
                    )}
                    <div className={styles.currentActions}>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={busyStepId === currentStep.id}
                        onClick={() => void toggleStep(currentStep)}
                      >
                        Выполнено
                      </button>
                    </div>
                  </>
                ) : (
                  <div className={styles.done}>
                    <div className={styles.doneMark}>✦</div>
                    <p className={styles.doneText}>Все шаги пройдены</p>
                    <p className="muted" style={{ marginTop: 6 }}>
                      Добавь следующий или заведи новую тему.
                    </p>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </section>

          <section className="card">
            <div className={styles.sectionHead}>
              <p className="eyebrow">Все шаги</p>
              <span className="mono" style={{ fontSize: 12, color: 'var(--dim)' }}>
                {stats.total}
              </span>
            </div>

            {steps.length === 0 ? (
              <p className={styles.empty}>Список пуст.</p>
            ) : (
              <ul className={styles.list}>
                <AnimatePresence initial={false}>
                  {steps.map((step, index) => (
                    <StepRow
                      key={step.id}
                      step={step}
                      isCurrent={currentStep?.id === step.id}
                      canMoveUp={index > 0}
                      canMoveDown={index < steps.length - 1}
                      busy={busyStepId === step.id}
                      onToggle={(target) => void toggleStep(target)}
                      onMove={(target, direction) => void moveStep(target, direction)}
                      onSave={saveStep}
                      onDelete={(target) => void deleteStep(target)}
                    />
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </section>

          <section className="card">
            <p className="eyebrow">Новый шаг</p>
            <form className={styles.form} onSubmit={addStep} style={{ marginTop: 12 }}>
              <input
                className="field"
                value={stepDraft.title}
                onChange={(event) => setStepDraft({ ...stepDraft, title: event.target.value })}
                placeholder="Заголовок"
                maxLength={200}
              />
              <textarea
                className="field"
                value={stepDraft.description}
                onChange={(event) => setStepDraft({ ...stepDraft, description: event.target.value })}
                placeholder="Описание — что именно нужно сделать"
                rows={3}
                maxLength={2000}
              />
              <div className={styles.formRow}>
                <input
                  className="field"
                  value={stepDraft.resource_url}
                  onChange={(event) => setStepDraft({ ...stepDraft, resource_url: event.target.value })}
                  placeholder="Ссылка на материал"
                  maxLength={500}
                />
                <button type="submit" className="btn btn-primary" disabled={!stepDraft.title.trim() || addingStep}>
                  <PlusIcon /> Добавить
                </button>
              </div>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
