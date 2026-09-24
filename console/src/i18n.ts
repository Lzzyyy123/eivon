import { useSyncExternalStore } from "react";
import { zhCN } from "./zh-CN";

export type Language = "en" | "zh-CN";
const storageKey = "eivon.language";
const subscribers = new Set<() => void>();

function storedLanguage(): Language {
  try { return localStorage.getItem(storageKey) === "zh-CN" ? "zh-CN" : "en"; }
  catch { return "en"; }
}

let language = storedLanguage();
if (typeof document !== "undefined") document.documentElement.lang = language;

export function getLanguage(): Language { return language; }
export function setLanguage(value: Language) {
  if (value === language) return;
  language = value;
  document.documentElement.lang = value;
  try { localStorage.setItem(storageKey, value); } catch { /* Storage is optional. */ }
  subscribers.forEach((notify) => notify());
}
export function useLanguage(): Language {
  return useSyncExternalStore(
    (notify) => { subscribers.add(notify); return () => subscribers.delete(notify); },
    getLanguage,
    () => "en",
  );
}

export function t(message: string, values?: Record<string, string | number>): string {
  let result = language === "zh-CN" ? zhCN[message] ?? message : message;
  if (values) for (const [key, value] of Object.entries(values)) result = result.replaceAll(`{${key}}`, String(value));
  return result;
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString(language === "zh-CN" ? "zh-CN" : "en-US");
}
