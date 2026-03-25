"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GlobalSearchApi } from "@/lib/search/api";
import type { GlobalSearchResultDTO, GlobalSearchResultType, GlobalSearchSuggestResponseDTO } from "@/lib/search/types";

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return v;
}

function groupLabel(type: string) {
  if (type === "FAVORITO") return "Favoritos";
  if (type === "RECENTE") return "Recentes";
  if (type === "ATALHO") return "Atalhos";
  if (type === "ACAO") return "Ações";
  return "Resultados";
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 250);
  const [loading, setLoading] = useState(false);
  const [suggest, setSuggest] = useState<GlobalSearchSuggestResponseDTO | null>(null);
  const [results, setResults] = useState<GlobalSearchResultDTO[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const visible = useMemo(() => {
    const q = String(debouncedQuery || "").trim();
    if (!q) {
      const s = suggest;
      const merged: GlobalSearchResultDTO[] = [];
      const withType = (x: GlobalSearchResultDTO, type: GlobalSearchResultType): GlobalSearchResultDTO => ({ ...x, type });
      if (s?.favoritos?.length) merged.push(...s.favoritos.map((x) => withType(x, "FAVORITO")));
      if (s?.recentes?.length) merged.push(...s.recentes.map((x) => withType(x, "RECENTE")));
      if (s?.atalhos?.length) merged.push(...s.atalhos.map((x) => withType(x, "ATALHO")));
      if (s?.acoes?.length) merged.push(...s.acoes.map((x) => withType(x, "ACAO")));
      return merged.slice(0, 30);
    }
    return results.slice(0, 30);
  }, [debouncedQuery, suggest, results]);

  const grouped = useMemo(() => {
    const map = new Map<string, GlobalSearchResultDTO[]>();
    for (const r of visible) {
      const k = groupLabel(r.type);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return Array.from(map.entries());
  }, [visible]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setActiveIndex(0);
    setLoading(true);
    GlobalSearchApi.sugestoes()
      .then((s) => setSuggest(s))
      .catch(() => setSuggest({ recentes: [], favoritos: [], atalhos: [], acoes: [] }))
      .finally(() => setLoading(false));
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = String(debouncedQuery || "").trim();
    if (!q) return;
    setLoading(true);
    GlobalSearchApi.buscar(q)
      .then((r) => setResults(r.resultados || []))
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, [open, debouncedQuery]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, Math.max(visible.length - 1, 0)));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const item = visible[activeIndex];
        if (item) selectItem(item);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, visible, activeIndex, onClose]);

  async function selectItem(item: GlobalSearchResultDTO) {
    try {
      if (item.type === "RECENTE") {
        setQuery(item.titulo);
        return;
      }
      if (item.rota) {
        GlobalSearchApi.registrarAcesso({
          entidadeTipo: item.entidadeTipo || undefined,
          entidadeId: item.entidadeId || undefined,
          rota: item.rota,
          titulo: item.titulo,
          modulo: item.modulo,
        }).catch(() => {});
        onClose();
        router.push(item.rota);
      }
    } catch {}
  }

  if (!open) return null;

  let flatIndex = -1;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="border-b p-3">
          <input
            ref={inputRef}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="Buscar... (Ctrl+K)"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
          />
          <div className="mt-2 text-xs text-slate-500">
            {loading ? "Carregando..." : visible.length ? `${visible.length} itens` : "Sem resultados"}
          </div>
        </div>

        <div className="max-h-[60vh] overflow-auto p-2">
          {grouped.map(([label, items]) => (
            <div key={label} className="mb-3">
              <div className="px-2 py-1 text-xs font-semibold text-slate-500">{label}</div>
              <div className="space-y-1">
                {items.map((it) => {
                  flatIndex++;
                  const active = flatIndex === activeIndex;
                  return (
                    <button
                      key={it.id}
                      type="button"
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm ${active ? "bg-slate-100" : "hover:bg-slate-50"}`}
                      onMouseEnter={() => setActiveIndex(flatIndex)}
                      onClick={() => selectItem(it)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{it.titulo}</div>
                          {it.subtitulo ? <div className="truncate text-xs text-slate-500">{it.subtitulo}</div> : null}
                        </div>
                        <div className="text-xs text-slate-400">{it.modulo}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="border-t p-3 text-xs text-slate-500">
          Enter: abrir • ↑/↓: navegar • Esc: fechar
        </div>
      </div>
    </div>
  );
}

