export type ActiveObra = {
  id: number;
  nome?: string;
};

const STORAGE_KEY = "expplan.activeObra";
const EVENT_NAME = "expplan.obra.changed";

export function getActiveObra(): ActiveObra | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as any;
    const id = Number(parsed?.id || 0);
    if (!Number.isInteger(id) || id <= 0) return null;
    const nome = parsed?.nome ? String(parsed.nome) : undefined;
    return { id, nome };
  } catch {
    return null;
  }
}

export function setActiveObra(next: ActiveObra | null) {
  if (typeof window === "undefined") return;
  if (!next) {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(EVENT_NAME));
    return;
  }
  const id = Number(next.id || 0);
  if (!Number.isInteger(id) || id <= 0) return;
  const payload: ActiveObra = { id, nome: next.nome ? String(next.nome) : undefined };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  window.dispatchEvent(new Event(EVENT_NAME));
}

export function subscribeActiveObra(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener("storage", handler);
  };
}
