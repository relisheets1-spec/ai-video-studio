import { EventEmitter } from "node:events";

/**
 * Мгновенный выброс пользователя: панель отозвала код, заблокировала или
 * удалила аккаунт — его открытые вкладки получают событие по SSE
 * (/api/auth/watch) и сразу показывают форму входа. Никакого опроса раз в
 * минуту: сервер сам толкает событие. Процесс у приложения один, поэтому
 * достаточно шины в памяти.
 */

const bus = ((globalThis as any).__studioKickBus ??= new EventEmitter()) as EventEmitter;
bus.setMaxListeners(0);

export function kickUser(userId: string): void {
  bus.emit(`user:${userId}`);
}

/** Одно устройство: его вытеснил вход с лишнего устройства. */
export function kickSession(sid: string): void {
  bus.emit(`session:${sid}`);
}

export function onKick(userId: string, sid: string, cb: () => void): () => void {
  const keys = [`user:${userId}`, `session:${sid}`];
  for (const k of keys) bus.on(k, cb);
  return () => {
    for (const k of keys) bus.off(k, cb);
  };
}
