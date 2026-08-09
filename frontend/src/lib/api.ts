import type { FreezeDay, FreezeDoubt, FreezeGoal, FreezeState, Step, Theme } from '../types';

// Бэкенд — отдельный сервис; nginx проксирует на него всё под /api, срезая
// префикс. В dev то же самое делает прокси Vite, поэтому путь один на оба режима.
const API = '/api';

/** Ошибка с сообщением от сервера — его есть смысл показать пользователю. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      ...init,
      headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
    });
  } catch {
    // fetch отклоняется только на сетевом уровне: сервер не ответил вовсе
    throw new ApiError(0, 'Сервер не отвечает. Проверь соединение.');
  }

  if (!response.ok) {
    // Тело с { error } есть у всех наших ответов, но за 502 от nginx
    // приходит HTML — на нём response.json() бросит, и это нормально
    const message = await response
      .json()
      .then((body: { error?: string }) => body.error)
      .catch(() => null);
    throw new ApiError(response.status, message ?? `Запрос не прошёл (HTTP ${response.status})`);
  }

  // 204 без тела: json() на пустом ответе бросает, поэтому отдаём undefined
  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

const send = <T>(method: string, path: string, body?: unknown) =>
  request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

// --- маршрут -----------------------------------------------------------------

export const themesApi = {
  list: () => request<Theme[]>('/themes'),
  create: (name: string) => send<Theme>('POST', '/themes', { name }),
  rename: (id: number, name: string) => send<Theme>('PATCH', `/themes/${id}`, { name }),
  remove: (id: number) => send<void>('DELETE', `/themes/${id}`),
  steps: (id: number) => request<Step[]>(`/themes/${id}/steps`),
  addStep: (id: number, step: { title: string; description?: string; resource_url?: string }) =>
    send<Step>('POST', `/themes/${id}/steps`, step),
};

export const stepsApi = {
  update: (id: number, patch: Partial<Pick<Step, 'title' | 'description' | 'resource_url'>>) =>
    send<Step>('PATCH', `/steps/${id}`, patch),
  remove: (id: number) => send<void>('DELETE', `/steps/${id}`),
  complete: (id: number) => send<void>('POST', `/steps/${id}/complete`),
  uncomplete: (id: number) => send<void>('DELETE', `/steps/${id}/complete`),
  move: (id: number, direction: 'up' | 'down') => send<void>('POST', `/steps/${id}/move`, { direction }),
};

// --- заморозка ---------------------------------------------------------------

export const freezeApi = {
  load: () => request<FreezeState>('/freeze'),
  setDay: (day: string, patch: { worked: boolean | null; note: string }) =>
    send<FreezeDay>('PUT', `/freeze/days/${day}`, patch),
  clearDay: (day: string) => send<void>('DELETE', `/freeze/days/${day}`),
  addGoal: (text: string) => send<FreezeGoal>('POST', '/freeze/goals', { text }),
  updateGoal: (id: number, patch: { text?: string; done?: boolean; day?: string }) =>
    send<FreezeGoal>('PATCH', `/freeze/goals/${id}`, patch),
  removeGoal: (id: number) => send<void>('DELETE', `/freeze/goals/${id}`),
  addDoubt: (text: string, day: string) => send<FreezeDoubt>('POST', '/freeze/doubts', { text, day }),
  removeDoubt: (id: number) => send<void>('DELETE', `/freeze/doubts/${id}`),
  reset: () => send<void>('DELETE', '/freeze'),
};
