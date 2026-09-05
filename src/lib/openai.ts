import OpenAI from "openai";
import { OPENAI_API_KEY } from "./env";

// Пустой ключ не роняет процесс на импорте: сервер поднимется, а неверный
// ключ проявится понятной ошибкой 401 на первой же генерации.
export const openai = new OpenAI({ apiKey: OPENAI_API_KEY || "not-configured" });
