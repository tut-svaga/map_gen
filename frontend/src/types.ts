// Формы ответов API. Держим их отдельно от компонентов: это контракт с
// бэкендом, и когда он поменяется, tsc покажет все места, которые сломались.

export interface Theme {
  id: number;
  name: string;
  total: number;
  completed: number;
  percent: number;
}

export interface Step {
  id: number;
  title: string;
  description: string | null;
  resource_url: string | null;
  order_index: number;
  completed: boolean;
}

export interface FreezeDay {
  day: string;
  /** null — день открыт: заметка есть, отметки «работал/не работал» нет */
  worked: boolean | null;
  note: string;
}

export interface FreezeGoal {
  id: number;
  text: string;
  done: boolean;
  done_at: string | null;
}

export interface FreezeDoubt {
  id: number;
  text: string;
  day: string;
}

export interface FreezeState {
  start: string;
  end: string;
  days: FreezeDay[];
  goals: FreezeGoal[];
  doubts: FreezeDoubt[];
}
