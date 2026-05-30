function isPlainObject(v: any) {
  return Object.prototype.toString.call(v) === '[object Object]';
}

function maskCpf(v: string) {
  const digits = v.replace(/\D+/g, '');
  if (digits.length < 11) return '***';
  return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2}).*$/, '$1.$2.***-**');
}

function maskCnpj(v: string) {
  const digits = v.replace(/\D+/g, '');
  if (digits.length < 14) return '***';
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2}).*$/, '$1.$2.$3/****-**');
}

function maskEmail(v: string) {
  const parts = String(v).split('@');
  if (parts.length !== 2) return '***';
  const user = parts[0];
  const domain = parts[1];
  const u = user.length <= 2 ? user[0] || '*' : user.slice(0, 2);
  return `${u}***@${domain}`;
}

function maskPhone(v: string) {
  const digits = v.replace(/\D+/g, '');
  if (digits.length < 4) return '****';
  return `***${digits.slice(-4)}`;
}

function redactValueByKey(key: string, value: any) {
  const k = key.toLowerCase();
  if (k.includes('password') || k.includes('senha')) return 'REDACTED';
  if (k.includes('token') || k.includes('secret') || k.includes('authorization') || k.includes('callback')) return 'REDACTED';
  if (k.includes('cpf')) return typeof value === 'string' ? maskCpf(value) : 'REDACTED';
  if (k.includes('cnpj')) return typeof value === 'string' ? maskCnpj(value) : 'REDACTED';
  if (k.includes('email')) return typeof value === 'string' ? maskEmail(value) : 'REDACTED';
  if (k.includes('telefone') || k.includes('phone') || k.includes('celular')) return typeof value === 'string' ? maskPhone(value) : 'REDACTED';
  if (k.includes('medico') || k.includes('saude')) return 'REDACTED';
  return null;
}

export function redactPayload(input: any): any {
  if (input == null) return null;
  if (Array.isArray(input)) return input.map((it) => redactPayload(it));
  if (!isPlainObject(input)) {
    if (typeof input === 'string' && input.length > 512) return input.slice(0, 128) + '...';
    return input;
  }
  const out: any = {};
  for (const [k, v] of Object.entries(input)) {
    const direct = redactValueByKey(k, v);
    if (direct !== null) {
      out[k] = direct;
      continue;
    }
    if (isPlainObject(v) || Array.isArray(v)) {
      out[k] = redactPayload(v);
      continue;
    }
    if (typeof v === 'string') {
      if (/^Bearer\s+/i.test(v) || v.length > 1024) {
        out[k] = 'REDACTED';
      } else {
        out[k] = v;
      }
    } else {
      out[k] = v;
    }
  }
  return out;
}
