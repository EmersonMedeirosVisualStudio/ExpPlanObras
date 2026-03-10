
async function main() {
  const BASE_URL = 'http://localhost:3333';
  const tenantSlug = `tenant-${Date.now()}`;
  const email = `user-${Date.now()}@example.com`;
  const password = 'password123';

  console.log(`🚀 Iniciando teste de fluxo completo...`);
  console.log(`🌐 URL Base: ${BASE_URL}`);

  // 1. Registro
  console.log(`\n📝 1. Tentando registrar novo usuário e tenant...`);
  try {
    const registerRes = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test User',
        email,
        password,
        tenantName: 'Test Tenant',
        tenantSlug,
      }),
    });

    if (!registerRes.ok) {
      const error = await registerRes.text();
      throw new Error(`Falha no registro: ${registerRes.status} ${error}`);
    }

    const registerData = await registerRes.json();
    console.log('✅ Registro realizado com sucesso:', registerData);
  } catch (error) {
    console.error('❌ Erro no registro:', error);
    process.exit(1);
  }

  // 2. Login
  let token = '';
  console.log(`\n🔑 2. Tentando realizar login...`);
  try {
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
      }),
    });

    if (!loginRes.ok) {
      const error = await loginRes.text();
      throw new Error(`Falha no login: ${loginRes.status} ${error}`);
    }

    const loginData = await loginRes.json();
    token = loginData.token;
    console.log('✅ Login realizado com sucesso. Token obtido.');
  } catch (error) {
    console.error('❌ Erro no login:', error);
    process.exit(1);
  }

  // 3. Criar Obra
  console.log(`\n🏗️ 3. Tentando criar uma nova obra...`);
  try {
    const createObraRes = await fetch(`${BASE_URL}/api/obras`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name: 'Obra Teste 01',
        address: 'Rua Exemplo, 123',
        status: 'PLANEJAMENTO'
      }),
    });

    if (!createObraRes.ok) {
      const error = await createObraRes.text();
      throw new Error(`Falha ao criar obra: ${createObraRes.status} ${error}`);
    }

    const obraData = await createObraRes.json();
    console.log('✅ Obra criada com sucesso:', obraData);
  } catch (error) {
    console.error('❌ Erro ao criar obra:', error);
    process.exit(1);
  }

  // 4. Listar Obras
  console.log(`\n📋 4. Tentando listar obras...`);
  try {
    const listObrasRes = await fetch(`${BASE_URL}/api/obras`, {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${token}`
      }
    });

    if (!listObrasRes.ok) {
      const error = await listObrasRes.text();
      throw new Error(`Falha ao listar obras: ${listObrasRes.status} ${error}`);
    }

    const obrasList = await listObrasRes.json();
    console.log('✅ Obras listadas com sucesso:', obrasList);
    
    if (Array.isArray(obrasList) && obrasList.length > 0) {
        console.log(`🎉 Sucesso! Encontradas ${obrasList.length} obras.`);
    } else {
        console.warn('⚠️ Nenhuma obra encontrada (mas a requisição funcionou).');
    }

  } catch (error) {
    console.error('❌ Erro ao listar obras:', error);
    process.exit(1);
  }

  console.log('\n✨ Teste de fluxo completo finalizado com sucesso!');
}

main();
