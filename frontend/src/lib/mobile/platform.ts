export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  const w: any = window as any;
  return !!w.Capacitor;
}

export function getCapacitor(): any | null {
  if (!isNativeApp()) return null;
  const w: any = window as any;
  return w.Capacitor || null;
}

export function isWebPlatform(): boolean {
  return !isNativeApp();
}

