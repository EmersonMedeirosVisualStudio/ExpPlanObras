"use client";

import { useState } from "react";
import { HomeApi } from "@/lib/home/api";

export function FavoriteToggleButton({
  active,
  menuKey,
  onChange,
}: {
  active: boolean;
  menuKey: string;
  onChange?: (v: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      const next = !active;
      if (onChange) onChange(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`ml-2 rounded px-1 text-xs ${active ? "text-yellow-600" : "text-slate-400"}`}
      title={active ? "Desfavoritar" : "Favoritar"}
      aria-label="favorite"
    >
      {active ? "★" : "☆"}
    </button>
  );
}

