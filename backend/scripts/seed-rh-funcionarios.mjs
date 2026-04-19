import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const funcionarios = [
  ['Joao Pedro Lima', 'ENGENHEIRO CIVIL'],
  ['Carlos Henrique Souza', 'MESTRE DE OBRAS'],
  ['Marcos Vinicius Alves', 'ENCARREGADO DE OBRA'],
  ['Rafael Gomes Pinto', 'ALMOXARIFE'],
  ['Paulo Roberto Nunes', 'PEDREIRO'],
  ['Anderson Silva Costa', 'SERVENTE'],
  ['Felipe Santos Rocha', 'CARPINTEIRO'],
  ['Bruno Almeida Dias', 'ARMADOR'],
  ['Diego Ferreira Melo', 'ELETRICISTA'],
  ['Tiago Barros Lima', 'ENCANADOR'],
  ['Juliana Martins Araujo', 'ARQUITETA'],
  ['Patricia Fernandes Silva', 'TECNICA DE SEGURANCA'],
  ['Luciana Costa Menezes', 'ANALISTA DE RH'],
  ['Fernanda Ribeiro Araujo', 'AUXILIAR ADMINISTRATIVO'],
  ['Camila Rodrigues Paz', 'COORDENADORA FINANCEIRA'],
  ['Roberto Mendes Castro', 'COMPRADOR'],
  ['Gustavo Oliveira Prado', 'APONTADOR DE OBRA'],
  ['Leonardo Teixeira Moura', 'TOPOGRAFO'],
  ['Renata Almeida Siqueira', 'ASSISTENTE DE PLANEJAMENTO'],
  ['Eduardo Lopes Faria', 'GERENTE DE OBRAS'],
];

async function run() {
  const tenant = await prisma.tenant.findFirst({ orderBy: { id: 'asc' }, select: { id: true } });
  if (!tenant) {
    throw new Error('Nenhum tenant encontrado para semear funcionários.');
  }

  const tenantId = tenant.id;
  let inserted = 0;

  for (let i = 0; i < funcionarios.length; i += 1) {
    const [nomeCompleto, cargo] = funcionarios[i];
    const cpf = String(90000000000 + i);
    const matricula = `RH-AUTO-${String(i + 1).padStart(3, '0')}`;

    const existing = await prisma.funcionario.findFirst({
      where: {
        tenantId,
        OR: [{ cpf }, { matricula }],
      },
      select: { id: true },
    });

    if (existing) continue;

    await prisma.funcionario.create({
      data: {
        tenantId,
        matricula,
        nomeCompleto,
        cpf,
        cargo,
        funcaoPrincipal: cargo,
        statusFuncional: 'ATIVO',
        ativo: true,
        dataAdmissao: new Date('2025-01-15'),
      },
    });
    inserted += 1;
  }

  const total = await prisma.funcionario.count({ where: { tenantId } });
  console.log(JSON.stringify({ tenantId, inserted, total }, null, 2));
}

run()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

