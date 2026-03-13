import prisma from '../src/plugins/prisma.js';
import bcrypt from 'bcryptjs';

function getTrialEndsAt() {
  const days = Number(process.env.TRIAL_DAYS || '30');
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function ensureDemoTenant(input: {
  tenant: {
    name: string;
    slug: string;
    cnpj: string;
    link?: string;
    street?: string;
    number?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    cep?: string;
  };
  representative: {
    name: string;
    email: string;
    cpf: string;
    password: string;
    whatsapp?: string;
  };
}) {
  const hashedPassword = await bcrypt.hash(input.representative.password, 10);

  const tenant = await prisma.tenant.upsert({
    where: { cnpj: input.tenant.cnpj },
    create: {
      name: input.tenant.name,
      slug: input.tenant.slug,
      cnpj: input.tenant.cnpj,
      link: input.tenant.link,
      street: input.tenant.street,
      number: input.tenant.number,
      neighborhood: input.tenant.neighborhood,
      city: input.tenant.city,
      state: input.tenant.state,
      cep: input.tenant.cep,
      status: 'TEMPORARY',
      subscriptionStatus: 'TRIAL',
      trialEndsAt: getTrialEndsAt(),
    },
    update: {
      name: input.tenant.name,
      slug: input.tenant.slug,
      link: input.tenant.link,
      street: input.tenant.street,
      number: input.tenant.number,
      neighborhood: input.tenant.neighborhood,
      city: input.tenant.city,
      state: input.tenant.state,
      cep: input.tenant.cep,
    },
  });

  const user = await prisma.user.upsert({
    where: { email: input.representative.email },
    create: {
      email: input.representative.email,
      cpf: input.representative.cpf,
      name: input.representative.name,
      password: hashedPassword,
      whatsapp: input.representative.whatsapp,
    },
    update: {
      name: input.representative.name,
      cpf: input.representative.cpf,
      password: hashedPassword,
      whatsapp: input.representative.whatsapp,
    },
  });

  await prisma.tenantUser.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
    create: { tenantId: tenant.id, userId: user.id, role: 'ADMIN' },
    update: { role: 'ADMIN' },
  });

  await prisma.tenantHistoryEntry.create({
    data: {
      tenantId: tenant.id,
      source: 'SYSTEM',
      message: 'Empresa fictícia criada/atualizada para testes.',
      actorUserId: null,
    },
  });

  return { tenant, user };
}

async function main() {
  const items = [
    {
      tenant: {
        name: 'Construtora Alfa LTDA',
        slug: 'construtora-alfa',
        cnpj: '11222333000181',
        link: 'https://maps.google.com/?q=Av.+Paulista,+1000,+Bela+Vista,+Sao+Paulo,+SP,+01310-100',
        street: 'Av. Paulista',
        number: '1000',
        neighborhood: 'Bela Vista',
        city: 'São Paulo',
        state: 'SP',
        cep: '01310100',
      },
      representative: {
        name: 'Ana Souza',
        email: 'ana.alfa@demo.local',
        cpf: '11122233344',
        password: 'Demo@123456',
        whatsapp: '(11) 90000-0001',
      },
    },
    {
      tenant: {
        name: 'Engenharia Beta ME',
        slug: 'engenharia-beta',
        cnpj: '22333444000190',
        link: 'https://maps.google.com/?q=R.+das+Flores,+200,+Centro,+Belo+Horizonte,+MG,+30110-000',
        street: 'R. das Flores',
        number: '200',
        neighborhood: 'Centro',
        city: 'Belo Horizonte',
        state: 'MG',
        cep: '30110000',
      },
      representative: {
        name: 'Bruno Lima',
        email: 'bruno.beta@demo.local',
        cpf: '55566677788',
        password: 'Demo@123456',
        whatsapp: '(31) 90000-0002',
      },
    },
  ];

  for (const item of items) {
    const { tenant, user } = await ensureDemoTenant(item as any);
    console.log(`OK tenant=${tenant.id} cnpj=${tenant.cnpj} user=${user.email}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

