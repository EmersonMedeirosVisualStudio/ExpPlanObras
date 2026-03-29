import crypto from 'crypto';

function getKey(): Buffer | null {
  const raw = process.env.APP_SECRETS_KEY;
  if (!raw) return null;
  try {
    const buf = Buffer.from(raw, 'base64');
    if (buf.length !== 32) return null;
    return buf;
  } catch {
    return null;
  }
}

export function encryptSecret(plain: string): string {
  const key = getKey();
  if (!key) throw new Error('APP_SECRETS_KEY_MISSING');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(plain, 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decryptSecret(enc: string): string {
  const key = getKey();
  if (!key) throw new Error('APP_SECRETS_KEY_MISSING');
  const parts = String(enc || '').split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('INVALID_ENCRYPTED_SECRET');
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const ciphertext = Buffer.from(parts[3], 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString('utf8');
}

export function hasSecretsKey() {
  return !!getKey();
}

