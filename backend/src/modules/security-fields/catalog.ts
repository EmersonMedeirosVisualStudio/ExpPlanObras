import type { FieldCatalogEntry } from './types.js';

export const FIELD_CATALOG: FieldCatalogEntry[] = [
  { resource: 'EMPRESA_REPRESENTANTE', path: 'cpf', classification: 'SENSIVEL', defaultEffect: 'MASK', defaultMaskStrategy: 'CPF' },
  { resource: 'EMPRESA_REPRESENTANTE', path: 'email', classification: 'SENSIVEL', defaultEffect: 'MASK', defaultMaskStrategy: 'EMAIL' },
  { resource: 'USER', path: 'cpf', classification: 'SENSIVEL', defaultEffect: 'MASK', defaultMaskStrategy: 'CPF' },
  { resource: 'USER', path: 'email', classification: 'SENSIVEL', defaultEffect: 'MASK', defaultMaskStrategy: 'EMAIL' },
  { resource: 'FUNCIONARIO', path: 'cpf', classification: 'SENSIVEL', defaultEffect: 'MASK', defaultMaskStrategy: 'CPF' },
  { resource: 'FUNCIONARIO', path: 'email', classification: 'SENSIVEL', defaultEffect: 'MASK', defaultMaskStrategy: 'EMAIL' },
  { resource: 'FUNCIONARIO', path: 'telefone', classification: 'SENSIVEL', defaultEffect: 'MASK', defaultMaskStrategy: 'PHONE' },
];

export function getCatalogForResource(resource: string) {
  const r = String(resource || '').trim();
  return FIELD_CATALOG.filter((e) => e.resource === r);
}

