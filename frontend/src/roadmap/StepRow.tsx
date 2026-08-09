import { useState } from 'react';
import { motion } from 'framer-motion';
import type { Step } from '../types';
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, PencilIcon, TrashIcon } from '../ui/icons';
import styles from './RoadmapPage.module.css';

interface Props {
  step: Step;
  isCurrent: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  busy: boolean;
  onToggle: (step: Step) => void;
  onMove: (step: Step, direction: 'up' | 'down') => void;
  onSave: (step: Step, patch: { title: string; description: string; resource_url: string }) => Promise<void>;
  onDelete: (step: Step) => void;
}

export function StepRow({
  step,
  isCurrent,
  canMoveUp,
  canMoveDown,
  busy,
  onToggle,
  onMove,
  onSave,
  onDelete,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(step.title);
  const [description, setDescription] = useState(step.description ?? '');
  const [url, setUrl] = useState(step.resource_url ?? '');

  const startEditing = () => {
    // Поля наполняем в момент открытия, а не при монтировании: шаг мог
    // измениться из другого места, и старый черновик перетёр бы свежие данные.
    setTitle(step.title);
    setDescription(step.description ?? '');
    setUrl(step.resource_url ?? '');
    setEditing(true);
  };

  const save = async () => {
    if (!title.trim()) return;
    await onSave(step, { title, description, resource_url: url });
    setEditing(false);
  };

  return (
    <motion.li
      className={styles.row}
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginTop: 0, paddingTop: 0, paddingBottom: 0 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
    >
      <button
        type="button"
        className={styles.dot}
        aria-pressed={step.completed}
        aria-label={step.completed ? `Снять отметку с «${step.title}»` : `Отметить «${step.title}» выполненным`}
        disabled={busy}
        onClick={() => onToggle(step)}
      >
        {step.completed && <CheckIcon className={styles.dotCheck} />}
      </button>

      {editing ? (
        <div className={styles.editRow}>
          <input
            className="field"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Заголовок"
            autoFocus
            onKeyDown={(event) => {
              if (event.key === 'Enter') void save();
              if (event.key === 'Escape') setEditing(false);
            }}
          />
          <textarea
            className="field"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Описание"
            rows={3}
          />
          <input
            className="field"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="Ссылка на материал"
          />
          <div className={styles.editActions}>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => void save()} disabled={!title.trim()}>
              Сохранить
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setEditing(false)}>
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.rowBody}>
          <div className={styles.rowTitle} data-completed={step.completed}>
            {step.title}
          </div>
          <div className={styles.rowMeta}>
            <span>#{step.order_index}</span>
            {isCurrent && <span className={styles.rowBadge}>текущий</span>}
            {step.resource_url && (
              <a href={step.resource_url} target="_blank" rel="noopener noreferrer">
                материал
              </a>
            )}
          </div>
        </div>
      )}

      {!editing && (
        <div className={styles.rowActions}>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => onMove(step, 'up')}
            disabled={!canMoveUp || busy}
            aria-label="Поднять выше"
          >
            <ArrowUpIcon />
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => onMove(step, 'down')}
            disabled={!canMoveDown || busy}
            aria-label="Опустить ниже"
          >
            <ArrowDownIcon />
          </button>
          <button type="button" className={styles.iconBtn} onClick={startEditing} aria-label="Редактировать">
            <PencilIcon />
          </button>
          <button
            type="button"
            className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
            onClick={() => onDelete(step)}
            disabled={busy}
            aria-label="Удалить шаг"
          >
            <TrashIcon />
          </button>
        </div>
      )}
    </motion.li>
  );
}
