import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FeedbackContext, type ConfirmOptions, type FeedbackApi } from './feedback-context';
import styles from './Feedback.module.css';

interface Toast {
  id: number;
  message: string;
  tone: 'error' | 'info';
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (answer: boolean) => void;
}

const TOAST_TTL_MS = 6000;

/**
 * Заменяет alert() и confirm(): те блокируют поток, выглядят чужеродно и
 * в некоторых браузерах подавляются вовсе — то есть ошибка молча теряется.
 */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, tone: 'error' | 'info' = 'info') => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, message, tone }]);
      // Таймер живёт вне React: перерисовка его не трогает, а на размонтировании
      // провайдера страница всё равно уходит целиком.
      setTimeout(() => dismiss(id), TOAST_TTL_MS);
    },
    [dismiss]
  );

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...options, resolve });
      }),
    []
  );

  const answer = useCallback(
    (value: boolean) => {
      setPending((current) => {
        current?.resolve(value);
        return null;
      });
    },
    []
  );

  // Escape закрывает диалог: пользователь ожидает этого от любого модального
  // окна, а без обработчика единственный выход — мышью по кнопке.
  useEffect(() => {
    if (!pending) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') answer(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pending, answer]);

  const api = useMemo<FeedbackApi>(() => ({ notify, confirm }), [notify, confirm]);

  return (
    <FeedbackContext.Provider value={api}>
      {children}

      <div className={styles.toasts} role="status" aria-live="polite">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              className={styles.toast}
              data-tone={toast.tone}
              layout
              initial={{ opacity: 0, y: 16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            >
              <span className={styles.marker} />
              <span className={styles.toastText}>{toast.message}</span>
              <button
                type="button"
                className={styles.close}
                onClick={() => dismiss(toast.id)}
                aria-label="Закрыть"
              >
                ×
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {pending && (
          <motion.div
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => answer(false)}
          >
            <motion.div
              className={styles.dialog}
              role="alertdialog"
              aria-modal="true"
              aria-label={pending.title}
              initial={{ opacity: 0, y: 18, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              onClick={(event) => event.stopPropagation()}
            >
              <h2 className={styles.dialogTitle}>{pending.title}</h2>
              {pending.body && <p className={styles.dialogBody}>{pending.body}</p>}
              <div className={styles.dialogActions}>
                <button type="button" className="btn" onClick={() => answer(false)}>
                  Отмена
                </button>
                <button
                  type="button"
                  className={pending.danger ? 'btn btn-primary' : 'btn'}
                  onClick={() => answer(true)}
                  autoFocus
                >
                  {pending.confirmLabel ?? 'Подтвердить'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </FeedbackContext.Provider>
  );
}
