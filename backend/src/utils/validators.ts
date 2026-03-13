export function onlyDigits(s: string): string {
  return String(s || '').replace(/\D+/g, '');
}

export function normalizeEmail(email: string): string {
  return String(email || '').trim().toLowerCase();
}

export function validateCEP(cep: string): string {
  const v = onlyDigits(cep);
  if (v.length !== 8) {
    throw new Error('CEP inválido');
  }
  return v;
}

export function validateCPF(cpf: string): string {
  let v = onlyDigits(cpf);
  if (v.length !== 11) throw new Error('CPF inválido');
  // reject same digits
  if (/^(\d)\1{10}$/.test(v)) throw new Error('CPF inválido');
  const calc = (digits: string, factor: number) => {
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
      sum += parseInt(digits[i], 10) * (factor - i);
    }
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };
  const d1 = calc(v.slice(0, 9), 10);
  const d2 = calc(v.slice(0, 10), 11);
  if (d1 !== parseInt(v[9], 10) || d2 !== parseInt(v[10], 10)) {
    throw new Error('CPF inválido');
  }
  return v;
}

export function validateCNPJ(cnpj: string): string {
  let v = onlyDigits(cnpj);
  if (v.length !== 14) throw new Error('CNPJ inválido');
  if (/^(\d)\1{13}$/.test(v)) throw new Error('CNPJ inválido');
  const calc = (digits: string, posArray: number[]) => {
    let sum = 0;
    for (let i = 0; i < posArray.length; i++) {
      sum += parseInt(digits[i], 10) * posArray[i];
    }
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const p2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = calc(v.slice(0, 12), p1);
  const d2 = calc(v.slice(0, 13), p2);
  if (d1 !== parseInt(v[12], 10) || d2 !== parseInt(v[13], 10)) {
    throw new Error('CNPJ inválido');
  }
  return v;
}

export function validateSlug(slug: string): string {
  const value = String(slug || '').trim();
  if (!/^[a-z0-9-]+$/.test(value)) {
    throw new Error('Slug inválido: use letras minúsculas, números e hífen');
  }
  return value;
}

