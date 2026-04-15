'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

function getToken() {
  try {
    return localStorage.getItem('token');
  } catch {
    return null;
  }
}

export function RouteGuard() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
      return;
    }
  }, [pathname, router]);

  return null;
}
