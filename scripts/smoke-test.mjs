const apiBaseUrl = process.env.API_BASE_URL;
if (!apiBaseUrl) {
  console.error('Missing API_BASE_URL');
  process.exit(1);
}

const password = process.env.SMOKE_PASSWORD || 'smoke-pass-123';
const now = Date.now();
const suffix = String(now);

const email = `smoke.${suffix}@example.com`;
const cpf = String(10000000000 + (now % 89999999999)).slice(0, 11);
const cnpj = String(10000000000000 + (now % 89999999999999)).slice(0, 14);
const tenantSlug = `smoke-${suffix}`.slice(0, 30);

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function request(path, options = {}) {
  const res = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: res.ok, status: res.status, data };
}

async function waitForHealth() {
  const attempts = 30;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await request('/health', { method: 'GET', headers: {} });
      if (res.ok) return;
    } catch {}
    await sleep(2000);
  }
  throw new Error('API did not become healthy in time');
}

async function main() {
  await waitForHealth();

  const register = await request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Smoke User',
      email,
      cpf,
      password,
      tenantName: 'Smoke Tenant',
      tenantSlug,
      cnpj
    })
  });
  if (!register.ok && register.status !== 409) {
    throw new Error(`Register failed: ${register.status} ${JSON.stringify(register.data)}`);
  }

  const login = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  if (!login.ok) {
    throw new Error(`Login failed: ${login.status} ${JSON.stringify(login.data)}`);
  }
  const token = login.data?.token;
  if (!token) {
    throw new Error(`Login did not return token: ${JSON.stringify(login.data)}`);
  }

  const obraCreate = await request('/api/obras', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: `Obra Smoke ${suffix}`,
      type: 'PARTICULAR',
      status: 'NAO_INICIADA',
      city: 'Natal',
      state: 'RN',
      valorPrevisto: 1000.5
    })
  });
  if (!obraCreate.ok) {
    throw new Error(`Create obra failed: ${obraCreate.status} ${JSON.stringify(obraCreate.data)}`);
  }
  const obraId = obraCreate.data?.id;
  if (!obraId) throw new Error('Create obra did not return id');

  const orcamento = await request(`/api/obras/${obraId}/orcamento`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!orcamento.ok) {
    throw new Error(`Get orçamento failed: ${orcamento.status} ${JSON.stringify(orcamento.data)}`);
  }

  const addCusto = await request(`/api/obras/${obraId}/custos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      description: 'Custo Smoke',
      amount: 10.25
    })
  });
  if (!addCusto.ok) {
    throw new Error(`Add custo failed: ${addCusto.status} ${JSON.stringify(addCusto.data)}`);
  }

  const obrasList = await request('/api/obras', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!obrasList.ok) {
    throw new Error(`List obras failed: ${obrasList.status} ${JSON.stringify(obrasList.data)}`);
  }

  console.log('SMOKE_OK');
}

main().catch((e) => {
  console.error(String(e?.stack || e));
  process.exit(1);
});

