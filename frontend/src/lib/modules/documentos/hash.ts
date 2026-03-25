import { createHash, randomBytes } from 'crypto';

export function sha256Hex(buf: Buffer | Uint8Array) {
  return createHash('sha256').update(buf).digest('hex');
}

export function randomToken(lenBytes: number) {
  return randomBytes(lenBytes).toString('hex');
}

export function buildCodigoVerificacao() {
  const raw = randomToken(8).toUpperCase();
  return `DOC-${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
}

