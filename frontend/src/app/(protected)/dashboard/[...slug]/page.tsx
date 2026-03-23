'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { MENU } from '@/lib/menuConfig';

function findLabel(path: string) {
  const stack = [...MENU];
  while (stack.length > 0) {
    const item = stack.shift()!;
    if (item.path === path) return item.label;
    if (item.children) stack.push(...item.children);
  }
  return null;
}

export default function DashboardCatchAllPage() {
  const params = useParams<{ slug?: string[] }>();
  const slug = Array.isArray(params?.slug) ? params.slug : [];
  const path = `/dashboard/${slug.join('/')}`;
  const title = useMemo(() => findLabel(path) || slug[slug.length - 1]?.replace(/-/g, ' ') || 'Dashboard', [path, slug]);

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

