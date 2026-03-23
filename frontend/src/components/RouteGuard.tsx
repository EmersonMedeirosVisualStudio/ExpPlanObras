'use client';

import { useEffect, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';

function getToken() {
  try {
    return localStorage.getItem('token');
  } catch {
    return null;
  }
}

function getActiveProfile() {
  try {
    return localStorage.getItem('active_profile') || '';
  } catch {
    return '';
  }
}

function isAllowed(pathname: string, profile: string) {
  if (!pathname.startsWith('/dashboard')) return true;

  if (profile === 'ENCARREGADO_SISTEMA_EMPRESA') {
    return pathname.startsWith('/dashboard/admin') || pathname.startsWith('/dashboard/administracao');
  }

  if (profile === 'REPRESENTANTE_EMPRESA' || profile === 'CEO') {
    if (pathname === '/dashboard') return true;
    if (pathname.startsWith('/dashboard/config')) return true;
    if (pathname.startsWith('/dashboard/obras')) return true;
    if (pathname.startsWith('/dashboard/organograma')) return true;
    if (pathname.startsWith('/dashboard/relatorios')) return true;
    return false;
  }

  return true;
}

export function RouteGuard() {
  const pathname = usePathname();
  const router = useRouter();

  const profile = useMemo(() => getActiveProfile(), []);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }
    if (!isAllowed(pathname, profile)) {
      router.replace('/dashboard');
    }
  }, [pathname, profile, router]);

  return null;
}

