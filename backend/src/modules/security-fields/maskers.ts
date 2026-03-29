import type { FieldMaskStrategy } from './types.js';

function onlyDigits(v: string) {
  return v.replace(/\D+/g, '');
}

function maskCpf(v: string) {
  const d = onlyDigits(v);
  if (d.length !== 11) return '***.***.***-**';
  return `***.${d.slice(3, 6)}.***-**`;
}

function maskCnpj(v: string) {
  const d = onlyDigits(v);
  if (d.length !== 14) return '**.***.***/****-**';
  return `**.${d.slice(2, 5)}.***/****-${d.slice(12, 14)}`;
}

function maskEmail(v: string) {
  const s = String(v || '').trim();
  const at = s.indexOf('@');
  if (at <= 1) return '***@***';
  const left = s.slice(0, at);
  const domain = s.slice(at + 1);
  const keep = Math.min(2, left.length);
  return `${left.slice(0, keep)}***@${domain}`;
}

function maskPhone(v: string) {
  const d = onlyDigits(v);
  if (d.length < 8) return '(**) *****-****';
  const last4 = d.slice(-4);
  return `(**) *****-${last4}`;
}

function maskLast4(v: string) {
  const s = String(v || '');
  if (s.length <= 4) return '****';
  return `****${s.slice(-4)}`;
}

function maskHashShort(v: string) {
  const s = String(v || '').trim();
  if (s.length <= 10) return '***';
  return `${s.slice(0, 4)}...${s.slice(-4)}`;
}

function maskNameInitials(v: string) {
  const s = String(v || '').trim();
  if (!s) return '';
  const parts = s.split(/\s+/g).filter(Boolean);
  const out = parts.map((p) => (p.length <= 1 ? '*' : `${p.slice(0, 1)}***`));
  return out.join(' ');
}

function yearOnly(v: unknown) {
  const s = String(v || '');
  const m = s.match(/^(\d{4})/);
  return m ? m[1] : null;
}

function ageRange(v: unknown) {
  const s = String(v || '');
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  if (age < 0 || age > 140) return null;
  const start = Math.floor(age / 5) * 5;
  return `${start}-${start + 4}`;
}

function moneyRange(v: unknown) {
  const n = typeof v === 'number' ? v : Number(String(v || '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  if (n < 2000) return '0-2K';
  if (n < 5000) return '2K-5K';
  if (n < 10000) return '5K-10K';
  if (n < 15000) return '10K-15K';
  if (n < 25000) return '15K-25K';
  return '25K+';
}

export function applyMask(strategy: FieldMaskStrategy, value: unknown): unknown {
  const v = value === null || value === undefined ? '' : String(value);
  if (strategy === 'CPF') return maskCpf(v);
  if (strategy === 'CNPJ') return maskCnpj(v);
  if (strategy === 'EMAIL') return maskEmail(v);
  if (strategy === 'PHONE') return maskPhone(v);
  if (strategy === 'NAME_INITIALS') return maskNameInitials(v);
  if (strategy === 'LAST4') return maskLast4(v);
  if (strategy === 'HASH_SHORT') return maskHashShort(v);
  if (strategy === 'YEAR_ONLY') return yearOnly(value);
  if (strategy === 'AGE_RANGE') return ageRange(value);
  if (strategy === 'MONEY_RANGE') return moneyRange(value);
  if (strategy === 'FULL_REDACT') return 'REDACTED';
  if (strategy === 'PARTIAL_TEXT') return `${String(v).slice(0, 2)}***`;
  return value;
}

