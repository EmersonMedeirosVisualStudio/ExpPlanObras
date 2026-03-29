import { validateCNPJ, validateCPF } from '../../utils/validators.js';

export type PiiType = 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE';

function onlyDigits(v: string) {
  return v.replace(/\D+/g, '');
}

export function detectByFieldName(fieldPath: string): { type: PiiType; confidence: 'SUSPEITO' | 'PROVAVEL' } | null {
  const s = String(fieldPath || '').toLowerCase();
  if (s.includes('cpf')) return { type: 'CPF', confidence: 'PROVAVEL' };
  if (s.includes('cnpj')) return { type: 'CNPJ', confidence: 'PROVAVEL' };
  if (s.includes('email') || s.includes('e-mail')) return { type: 'EMAIL', confidence: 'PROVAVEL' };
  if (s.includes('telefone') || s.includes('celular') || s.includes('fone') || s.includes('phone')) return { type: 'PHONE', confidence: 'SUSPEITO' };
  return null;
}

export function detectByValue(value: unknown): { type: PiiType; confidence: 'SUSPEITO' | 'PROVAVEL' | 'CONFIRMADO' } | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
  if (emailRegex.test(s)) return { type: 'EMAIL', confidence: 'CONFIRMADO' };

  const digits = onlyDigits(s);
  if (digits.length === 11 && validateCPF(digits)) return { type: 'CPF', confidence: 'CONFIRMADO' };
  if (digits.length === 14 && validateCNPJ(digits)) return { type: 'CNPJ', confidence: 'CONFIRMADO' };

  if (digits.length >= 10 && digits.length <= 13) return { type: 'PHONE', confidence: 'SUSPEITO' };
  return null;
}

