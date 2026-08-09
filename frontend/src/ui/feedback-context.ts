import { createContext, useContext } from 'react';

export interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  danger?: boolean;
}

export interface FeedbackApi {
  /** Ненавязчивое сообщение в углу. Для ошибок — tone: 'error'. */
  notify: (message: string, tone?: 'error' | 'info') => void;
  /** Модальное подтверждение. Резолвится в true, если пользователь согласился. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

// Контекст и хук вынесены из файла с компонентом намеренно: react-refresh
// умеет обновлять модуль на лету только если из него экспортируются
// исключительно компоненты. Иначе при каждой правке слетает состояние страницы.
export const FeedbackContext = createContext<FeedbackApi | null>(null);

export function useFeedback(): FeedbackApi {
  const api = useContext(FeedbackContext);
  if (!api) {
    throw new Error('useFeedback must be used inside <FeedbackProvider>');
  }
  return api;
}
