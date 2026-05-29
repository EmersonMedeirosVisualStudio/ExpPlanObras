import type { QualifiedSignatureProvider } from '@/modules/documentos-qualificados/providers/types.js';
import { MockQualifiedSignatureProvider } from '@/modules/documentos-qualificados/providers/mock.js';

const providers: QualifiedSignatureProvider[] = [MockQualifiedSignatureProvider];

export function getQualifiedSignatureProvider(code: string): QualifiedSignatureProvider | null {
  const c = String(code || '').trim().toUpperCase();
  return providers.find((p) => p.code.toUpperCase() === c) || null;
}

