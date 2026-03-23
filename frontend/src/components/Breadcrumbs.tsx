'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { MENU } from '@/lib/menuConfig';

type Crumb = { label: string; href: string };

function findLabelByPath(path: string): string | null {
  const stack = [...MENU];
  while (stack.length > 0) {
    const item = stack.shift()!;
    if (item.path === path) return item.label;
    if (item.children) stack.push(...item.children);
  }
  return null;
}

export function Breadcrumbs() {
  const pathname = usePathname();

  const crumbs = useMemo<Crumb[]>(() => {
    const parts = pathname.split('/').filter(Boolean);
    const list: Crumb[] = [];
    let acc = '';
    for (const p of parts) {
      acc += `/${p}`;
      if (!acc.startsWith('/dashboard')) continue;
      const label = findLabelByPath(acc) || p.replace(/-/g, ' ');
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

