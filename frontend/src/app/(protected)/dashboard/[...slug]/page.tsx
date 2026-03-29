'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { APP_MENU } from '@/lib/navigation/menu';
import type { MenuItemConfig } from '@/lib/navigation/types';

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

export default function DashboardCatchAllPage() {
  const params = useParams<{ slug?: string[] }>();
  const slug = Array.isArray(params?.slug) ? params.slug : [];
  const path = `/dashboard/${slug.join('/')}`;
  const title = useMemo(() => {
    const labelMap = buildPathLabelMap();
    return labelMap.get(path) || slug[slug.length - 1]?.replace(/-/g, ' ') || 'Dashboard';
  }, [path, slug]);

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      <div className="mt-2 text-sm text-gray-600">Rota: {path}</div>
      <div className="mt-6 bg-white border rounded-lg p-6 text-gray-700">
        Página scaffoldada para a navegação completa. O conteúdo será implementado conforme o wireframe.
      </div>
    </div>
  );
}
