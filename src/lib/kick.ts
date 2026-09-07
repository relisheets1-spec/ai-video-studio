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
  bus.emit(`kick:${userId}`);
}

export function onKick(userId: string, cb: () => void): () => void {
  const key = `kick:${userId}`;
  bus.on(key, cb);
  return () => bus.off(key, cb);
}
