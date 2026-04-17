"use client";

import { useEffect, useState } from "react";
import { CommandPalette } from "./CommandPalette";

export function GlobalSearchTrigger() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const isK = e.key.toLowerCase() === "k";
      const mod = e.ctrlKey || e.metaKey;
      if (mod && isK) {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <button type="button" className="rounded-lg border bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={() => setOpen(true)}>
        Buscar <span className="hidden md:inline text-slate-500">Ctrl+K</span>
      </button>
      <CommandPalette open={open} onClose={() => setOpen(false)} />
    </>
  );
}

