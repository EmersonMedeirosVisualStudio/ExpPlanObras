import type { QualifiedSignatureProvider } from './types.js';
import { MockQualifiedSignatureProvider } from './mock.js';

const providers: QualifiedSignatureProvider[] = [MockQualifiedSignatureProvider];

export function getQualifiedSignatureProvider(code: string): QualifiedSignatureProvider | null {
  const c = String(code || '').trim().toUpperCase();
  return providers.find((p) => p.code.toUpperCase() === c) || null;
}

