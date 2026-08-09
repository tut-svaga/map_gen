import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ApiError, freezeApi } from '../lib/api';
import type { FreezeDay, FreezeState } from '../types';
import { daysBetween, humanDay, humanDayFull, plural, rangeOfDays, today as todayIso } from '../lib/date';
import { useFeedback } from '../ui/feedback-context';
import { CheckIcon, PlusIcon, TrashIcon } from '../ui/icons';
import { DayStrip } from './DayStrip';
import styles from './FreezePage.module.css';

const NOTE_DEBOUNCE_MS = 500;

const errorText = (err: unknown) =>
  err instanceof ApiError ? err.message : 'Что-то пошло не так. Попробуй ещё раз.';

/** Серия: сколько дней подряд до сегодняшнего отмечено как «работал». */
function computeStreak(marks: Map<string, FreezeDay>, days: string[], today: string): number {
  const past = days.filter((day) => day <= today);
  let streak = 0;
  for (let i = past.length - 1; i >= 0; i--) {
    const mark = marks.get(past[i]);
    if (mark?.worked === true) {
      streak += 1;
      continue;
    }
    // Сегодняшний день ещё не отмечен — это не разрыв серии, а просто «пока рано»
    if (i === past.length - 1 && !mark) continue;
    break;
  }
  return streak;
}

export function FreezePage() {
  const { notify, confirm } = useFeedback();

  const [state, setState] = useState<FreezeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selected, setSelected] = useState(todayIso);
  // Черновик заметки помнит, к какому дню относится. Так он не требует
  // эффекта-синхронизации: для любого другого дня подставляется значение
  // с сервера, а эффект неминуемо затирал бы текст прямо во время набора.
  const [noteState, setNoteState] = useState<{ day: string; value: string } | null>(null);
  const [noteSaving, setNoteSaving] = useState(false);

  const [goalDraft, setGoalDraft] = useState('');
  const [doubtDraft, setDoubtDraft] = useState('');
  const [editingGoal, setEditingGoal] = useState<number | null>(null);
  const [goalEdit, setGoalEdit] = useState('');

  const today = todayIso();

  const apply = useCallback(
    (data: FreezeState) => {
      setState(data);
      // Сегодня может оказаться вне окна: до старта или после конца.
      // Тогда выбираем ближайший край, иначе выделять было бы нечего.
      setSelected((current) => {
        if (current >= data.start && current <= data.end) return current;
        return today < data.start ? data.start : data.end;
      });
    },
    [today]
  );

  const load = useCallback(async () => {
    apply(await freezeApi.load());
  }, [apply]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const data = await freezeApi.load();
        if (!cancelled) apply(data);
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
  }, [apply]);

  const marks = useMemo(() => {
    const map = new Map<string, FreezeDay>();
    for (const day of state?.days ?? []) map.set(day.day, day);
    return map;
  }, [state]);

  const days = useMemo(
    () => (state ? rangeOfDays(state.start, state.end) : []),
    [state]
  );

  const currentMark = marks.get(selected);
  const noteDraft = noteState?.day === selected ? noteState.value : (currentMark?.note ?? '');

  const applyDay = useCallback((day: FreezeDay) => {
    setState((current) =>
      current
        ? { ...current, days: [...current.days.filter((d) => d.day !== day.day), day] }
        : current
    );
  }, []);

  const saveDay = useCallback(
    async (day: string, worked: boolean | null, note: string) => {
      setNoteSaving(true);
      try {
        const saved = await freezeApi.setDay(day, { worked, note });
        applyDay(saved);
      } catch (err) {
        notify(errorText(err), 'error');
      } finally {
        setNoteSaving(false);
      }
    },
    [applyDay, notify]
  );

  // Заметка сохраняется с задержкой: PUT на каждую букву — это десятки
  // запросов на одну фразу. Отложенную отправку держим в ref вместе с днём,
  // к которому она относится, чтобы переключение дня её не потеряло.
  const pendingNote = useRef<{ day: string; worked: boolean | null; note: string } | null>(null);
  const noteTimer = useRef<number | null>(null);

  const flushNote = useCallback(() => {
    if (noteTimer.current !== null) {
      window.clearTimeout(noteTimer.current);
      noteTimer.current = null;
    }
    const payload = pendingNote.current;
    pendingNote.current = null;
    if (payload) void saveDay(payload.day, payload.worked, payload.note);
  }, [saveDay]);

  const changeNote = (value: string) => {
    setNoteState({ day: selected, value });
    pendingNote.current = { day: selected, worked: currentMark?.worked ?? null, note: value };
    if (noteTimer.current !== null) window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(flushNote, NOTE_DEBOUNCE_MS);
  };

  // Уходя с дня (и со страницы) дописываем то, что не успело улететь
  useEffect(() => flushNote, [selected, flushNote]);

  const setWorked = async (worked: boolean) => {
    flushNote();
    const next = currentMark?.worked === worked ? null : worked;
    await saveDay(selected, next, noteDraft);
  };

  const clearDay = async () => {
    if (noteTimer.current !== null) {
      window.clearTimeout(noteTimer.current);
      noteTimer.current = null;
    }
    pendingNote.current = null;
    try {
      await freezeApi.clearDay(selected);
      setState((current) =>
        current ? { ...current, days: current.days.filter((d) => d.day !== selected) } : current
      );
      setNoteState({ day: selected, value: '' });
    } catch (err) {
      notify(errorText(err), 'error');
    }
  };

  const addGoal = async () => {
    const text = goalDraft.trim();
    if (!text) return;
    try {
      const created = await freezeApi.addGoal(text);
      // Только функциональная форма: между отправкой и ответом состояние мог
      // изменить любой другой запрос, а замыкание помнит снимок на момент клика
      // и молча откатило бы чужие изменения.
      setState((current) => (current ? { ...current, goals: [...current.goals, created] } : current));
      setGoalDraft('');
    } catch (err) {
      notify(errorText(err), 'error');
    }
  };

  const toggleGoal = async (id: number, done: boolean) => {
    try {
      const updated = await freezeApi.updateGoal(id, { done, day: today });
      setState((current) =>
        current
          ? { ...current, goals: current.goals.map((goal) => (goal.id === id ? updated : goal)) }
          : current
      );
    } catch (err) {
      notify(errorText(err), 'error');
    }
  };

  const saveGoalText = async (id: number) => {
    const text = goalEdit.trim();
    setEditingGoal(null);
    if (!text) return;
    try {
      const updated = await freezeApi.updateGoal(id, { text });
      setState((current) =>
        current
          ? { ...current, goals: current.goals.map((goal) => (goal.id === id ? updated : goal)) }
          : current
      );
    } catch (err) {
      notify(errorText(err), 'error');
    }
  };

  const removeGoal = async (id: number) => {
    try {
      await freezeApi.removeGoal(id);
      setState((current) =>
        current ? { ...current, goals: current.goals.filter((goal) => goal.id !== id) } : current
      );
    } catch (err) {
      notify(errorText(err), 'error');
    }
  };

  const addDoubt = async () => {
    const text = doubtDraft.trim();
    if (!text) return;
    try {
      const created = await freezeApi.addDoubt(text, today);
      setState((current) =>
        current ? { ...current, doubts: [created, ...current.doubts] } : current
      );
      setDoubtDraft('');
    } catch (err) {
      notify(errorText(err), 'error');
    }
  };

  const removeDoubt = async (id: number) => {
    try {
      await freezeApi.removeDoubt(id);
      setState((current) =>
        current ? { ...current, doubts: current.doubts.filter((doubt) => doubt.id !== id) } : current
      );
    } catch (err) {
      notify(errorText(err), 'error');
    }
  };

  const resetAll = async () => {
    const ok = await confirm({
      title: 'Стереть всю заморозку?',
      body: 'Дни, цели и сомнения удалятся без возможности вернуть.',
      confirmLabel: 'Стереть всё',
      danger: true,
    });
    if (!ok) return;
    try {
      await freezeApi.reset();
      setState((current) => (current ? { ...current, days: [], goals: [], doubts: [] } : current));
      setNoteState(null);
      notify('Заморозка очищена');
    } catch (err) {
      notify(errorText(err), 'error');
    }
  };

  if (loading) {
    return (
      <section className="card">
        <div className={styles.skeleton} style={{ width: '30%' }} />
        <div className={styles.skeleton} style={{ width: '60%', marginTop: 16, height: 40 }} />
        <div className={styles.skeleton} style={{ width: '80%', marginTop: 16 }} />
      </section>
    );
  }

  if (loadError || !state) {
    return (
      <section className="card">
        <p className="eyebrow">Не загрузилось</p>
        <p className={styles.heroText}>{loadError}</p>
        <div className={styles.dayActions}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setLoadError(null);
              setLoading(true);
              load()
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

  const left = days.filter((day) => day >= today).length;
  const marked = days.filter((day) => marks.has(day)).length;
  const workedCount = days.filter((day) => marks.get(day)?.worked === true).length;
  const streak = computeStreak(marks, days, today);
  const total = Math.max(1, daysBetween(state.start, state.end));
  const elapsed = Math.min(100, Math.max(0, (daysBetween(state.start, today) / total) * 100));
  const over = today > state.end;

  return (
    <div className={styles.page}>
      <section className={`card ${styles.hero}`}>
        <p className="eyebrow">Заморозка направления</p>
        <div className={styles.count}>
          <motion.span
            className={styles.countNumber}
            key={left}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {left}
          </motion.span>
          <span className={styles.countUnit}>
            {over
              ? 'срок вышел — можно пересматривать'
              : `${plural(left, 'день', 'дня', 'дней')} до ${humanDay(state.end)}`}
          </span>
        </div>
        <p className={styles.heroText}>
          Направление не пересматривается до этой даты. Отмечай только то, что реально было.
        </p>

        <div className={styles.timeline}>
          <motion.div
            className={styles.timelineFill}
            initial={{ width: 0 }}
            animate={{ width: `${elapsed}%` }}
            transition={{ type: 'spring', stiffness: 60, damping: 18 }}
          />
        </div>
        <div className={styles.timelineLabels}>
          <span>{humanDay(state.start)}</span>
          <span>{humanDay(state.end)}</span>
        </div>
      </section>

      <section className="card">
        <DayStrip days={days} marks={marks} today={today} selected={selected} onSelect={setSelected} />
        <div className={styles.stats}>
          <span>
            отмечено <span className={styles.statValue}>{marked}</span>/{days.length}
          </span>
          <span>
            работал <span className={styles.statValue}>{workedCount}</span>
          </span>
          <span>
            серия <span className={styles.statValue}>{streak}</span>
          </span>
        </div>
      </section>

      <section className="card">
        <div className={styles.cardHead}>
          <p className="eyebrow">День</p>
          <span className={styles.dayLabel}>
            {selected === today ? `сегодня, ${humanDayFull(selected)}` : humanDayFull(selected)}
          </span>
        </div>

        <div className={styles.pair}>
          <button
            type="button"
            className={styles.big}
            aria-pressed={currentMark?.worked === true}
            onClick={() => void setWorked(true)}
          >
            Работал
          </button>
          <button
            type="button"
            className={`${styles.big} ${styles.bigNo}`}
            aria-pressed={currentMark?.worked === false}
            onClick={() => void setWorked(false)}
          >
            Не работал
          </button>
        </div>

        <input
          className="field"
          style={{ marginTop: 12 }}
          value={noteDraft}
          onChange={(event) => changeNote(event.target.value)}
          onBlur={flushNote}
          placeholder="что именно — коротко, для себя"
          maxLength={1000}
        />

        <div className={styles.dayActions}>
          {selected !== today && (
            <button type="button" className="btn btn-sm" onClick={() => setSelected(today)}>
              К сегодня
            </button>
          )}
          {currentMark && (
            <button type="button" className="btn btn-sm btn-danger" onClick={() => void clearDay()}>
              Стереть день
            </button>
          )}
          <span className={styles.saveHint}>{noteSaving ? 'сохраняю…' : 'сохраняется само'}</span>
        </div>
      </section>

      <section className="card">
        <div className={styles.cardHead}>
          <p className="eyebrow">Мои цели</p>
        </div>

        {state.goals.length === 0 ? (
          <p className={styles.empty}>Ни одной цели. Напиши свою — так, как проверишь её фактом.</p>
        ) : (
          <ul className={styles.list}>
            <AnimatePresence initial={false}>
              {state.goals.map((goal) => (
                <motion.li
                  key={goal.id}
                  className={styles.item}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <button
                    type="button"
                    className={styles.dot}
                    aria-pressed={goal.done}
                    aria-label={goal.done ? 'Снять отметку' : 'Отметить выполненной'}
                    onClick={() => void toggleGoal(goal.id, !goal.done)}
                  >
                    {goal.done && <CheckIcon className={styles.dotCheck} />}
                  </button>

                  <div className={styles.itemBody}>
                    {editingGoal === goal.id ? (
                      <input
                        className="field"
                        value={goalEdit}
                        autoFocus
                        maxLength={500}
                        onChange={(event) => setGoalEdit(event.target.value)}
                        onBlur={() => void saveGoalText(goal.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') void saveGoalText(goal.id);
                          if (event.key === 'Escape') {
                            setGoalEdit(goal.text);
                            setEditingGoal(null);
                          }
                        }}
                      />
                    ) : (
                      <div
                        className={styles.itemText}
                        data-done={goal.done}
                        onClick={() => {
                          setGoalEdit(goal.text);
                          setEditingGoal(goal.id);
                        }}
                      >
                        {goal.text}
                        {goal.done_at && <span className={styles.when}>{humanDay(goal.done_at)}</span>}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    className={styles.kill}
                    aria-label="Удалить цель"
                    onClick={() => void removeGoal(goal.id)}
                  >
                    <TrashIcon />
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}

        <div className={styles.row}>
          <input
            className="field"
            value={goalDraft}
            maxLength={500}
            onChange={(event) => setGoalDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void addGoal();
            }}
            placeholder="своя цель"
          />
          <button type="button" className="btn" onClick={() => void addGoal()} disabled={!goalDraft.trim()}>
            <PlusIcon /> Добавить
          </button>
        </div>
      </section>

      <section className="card">
        <div className={styles.cardHead}>
          <p className="eyebrow">Сомнения</p>
        </div>

        {state.doubts.length === 0 ? (
          <p className={styles.empty}>Пусто. Придёт мысль свернуть — запиши сюда и не действуй.</p>
        ) : (
          <ul className={styles.list}>
            <AnimatePresence initial={false}>
              {state.doubts.map((doubt) => (
                <motion.li
                  key={doubt.id}
                  className={styles.item}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className={styles.itemBody}>
                    {doubt.text}
                    <span className={styles.when}>{humanDay(doubt.day)}</span>
                  </div>
                  <button
                    type="button"
                    className={styles.kill}
                    aria-label="Удалить запись"
                    onClick={() => void removeDoubt(doubt.id)}
                  >
                    <TrashIcon />
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}

        <div className={styles.row}>
          <input
            className="field"
            value={doubtDraft}
            maxLength={500}
            onChange={(event) => setDoubtDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void addDoubt();
            }}
            placeholder="что сейчас тянет свернуть"
          />
          <button type="button" className="btn" onClick={() => void addDoubt()} disabled={!doubtDraft.trim()}>
            Записать
          </button>
        </div>
      </section>

      <footer className={styles.footer}>
        <span>{marked === 0 ? 'ни одного дня не отмечено' : `открыть всё ${humanDay(state.end)}`}</span>
        <button type="button" className={styles.reset} onClick={() => void resetAll()}>
          Сбросить всё
        </button>
      </footer>
    </div>
  );
}
