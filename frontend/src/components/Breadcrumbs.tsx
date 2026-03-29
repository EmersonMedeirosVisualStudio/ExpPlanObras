'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { APP_MENU } from '@/lib/navigation/menu';
import type { MenuSectionConfig, MenuItemConfig } from '@/lib/navigation/types';

type Crumb = { label: string; href: string };

function flatten(items: MenuItemConfig[], out: Map<string, string>) {
  for (const it of items) {
    if (it.href) out.set(it.href, it.label);
    if (it.children?.length) flatten(it.children, out);
  }
}

function buildPathLabelMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const sec of APP_MENU) flatten(sec.items, map);
  return map;
}

export function Breadcrumbs() {
  const pathname = usePathname();

  const crumbs = useMemo<Crumb[]>(() => {
    const parts = pathname.split('/').filter(Boolean);
    const list: Crumb[] = [];
    const labelMap = buildPathLabelMap();
    let acc = '';
    for (const p of parts) {
      acc += `/${p}`;
      if (!acc.startsWith('/dashboard')) continue;
      const label = labelMap.get(acc) || p.replace(/-/g, ' ');
      list.push({ label, href: acc });
    }
    return list;
  }, [pathname]);

  if (!pathname.startsWith('/dashboard')) return null;

  return (
    <nav className="text-sm text-gray-600">
      <div className="flex items-center gap-2 flex-wrap">
        {crumbs.map((c, idx) => (
          <span key={c.href} className="flex items-center gap-2">
            {idx === 0 ? null : <span>/</span>}
            <Link href={c.href} className="hover:text-gray-900">
              {c.label}
            </Link>
          </span>
        ))}
      </div>
    </nav>
  );
}
