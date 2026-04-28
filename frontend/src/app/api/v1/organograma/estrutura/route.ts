import { db } from '@/lib/db';
import { handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

const ORGANOGRAMA_CARGOS_BASE = [
  'Servente',
  'Pedreiro',
  'Pedreiro de Acabamento',
  'Carpinteiro',
  'Armador',
  'Eletricista',
  'Eletricista Industrial',
  'Encanador',
  'Pintor',
  'Gesseiro',
  'Azulejista',
  'Serralheiro',
  'Soldador',
  'Topógrafo',
  'Auxiliar de Topografia',
  'Mestre de Obras',
  'Encarregado',
  'Engenheiro Civil',
  'Engenheiro de Segurança',
  'Técnico em Edificações',
  'Técnico de Segurança do Trabalho',
  'Apontador',
  'Almoxarife',
  'Operador de Máquinas',
  'Operador de Betoneira',
  'Operador de Retroescavadeira',
  'Operador de Escavadeira',
  'Motorista',
  'Vigia',
  'Auxiliar Administrativo',
  'Comprador',
] as const;

async function ensureOrganogramaCargosBase(tenantId: number) {
  const nomes = ORGANOGRAMA_CARGOS_BASE.map((s) => String(s).trim()).filter(Boolean);
  if (!nomes.length) return;

  const [existing]: any = await db.query(
    `SELECT nome_cargo nomeCargo
     FROM organizacao_cargos
     WHERE tenant_id = ?
       AND nome_cargo IN (${nomes.map(() => '?').join(', ')})`,
    [tenantId, ...nomes]
  );
  const existingSet = new Set<string>((Array.isArray(existing) ? existing : []).map((r: any) => String(r?.nomeCargo || r?.nome_cargo || '').trim()));
  const toInsert = nomes.filter((n) => !existingSet.has(n));
  if (!toInsert.length) return;

  const valuesSql = toInsert.map(() => '(?, ?, 1)').join(', ');
  const params: any[] = [];
  for (const n of toInsert) params.push(tenantId, n);

  await db.query(`INSERT INTO organizacao_cargos (tenant_id, nome_cargo, ativo) VALUES ${valuesSql}`, params);
}

export async function GET() {
  try {
    const current = await requireApiPermission(PERMISSIONS.ORGANOGRAMA_VIEW);
    await ensureOrganogramaCargosBase(current.tenantId);

    const [setores]: any = await db.query(
      `
      SELECT id_setor AS id,
             nome_setor AS nomeSetor,
             tipo_setor AS tipoSetor,
             id_setor_pai AS idSetorPai,
             ativo
      FROM organizacao_setores
      WHERE tenant_id = ?
      ORDER BY nome_setor
      `,
      [current.tenantId]
    );

    const [cargos]: any = await db.query(
      `
      SELECT id_cargo AS id,
             nome_cargo AS nomeCargo,
             ativo
      FROM organizacao_cargos
      WHERE tenant_id = ?
      ORDER BY nome_cargo
      `,
      [current.tenantId]
    );

    let posicoes: any;
    try {
      [posicoes] = await db.query(
        `
        SELECT p.id_posicao AS id,
               p.id_setor AS idSetor,
               p.id_cargo AS idCargo,
               p.titulo_exibicao AS tituloExibicao,
               p.ordem_exibicao AS ordemExibicao,
               p.ativo,
               s.nome_setor AS setorNome,
               c.nome_cargo AS cargoNome
        FROM organograma_posicoes p
        INNER JOIN organizacao_setores s ON s.id_setor = p.id_setor
        INNER JOIN organizacao_cargos c ON c.id_cargo = p.id_cargo
        WHERE p.tenant_id = ?
        ORDER BY p.ordem_exibicao, p.titulo_exibicao
        `,
        [current.tenantId]
      );
    } catch {
      [posicoes] = await db.query(
        `
        SELECT p.id_posicao AS id,
               p.id_setor AS idSetor,
               p.id_cargo AS idCargo,
               p.titulo_exibicao AS tituloExibicao,
               0 AS ordemExibicao,
               p.ativo,
               s.nome_setor AS setorNome,
               c.nome_cargo AS cargoNome
        FROM organograma_posicoes p
        INNER JOIN organizacao_setores s ON s.id_setor = p.id_setor
        INNER JOIN organizacao_cargos c ON c.id_cargo = p.id_cargo
        WHERE p.tenant_id = ?
        ORDER BY p.titulo_exibicao
        `,
        [current.tenantId]
      );
    }

    const [vinculos]: any = await db.query(
      `
      SELECT v.id_vinculo AS id,
             v.id_posicao_superior AS idPosicaoSuperior,
             v.id_posicao_subordinada AS idPosicaoSubordinada
      FROM organograma_vinculos v
      INNER JOIN organograma_posicoes p1 ON p1.id_posicao = v.id_posicao_superior
      INNER JOIN organograma_posicoes p2 ON p2.id_posicao = v.id_posicao_subordinada
      WHERE v.ativo = 1 AND p1.tenant_id = ? AND p2.tenant_id = ?
      `,
      [current.tenantId, current.tenantId]
    );

    const [ocupacoes]: any = await db.query(
      `
      SELECT fp.id_funcionario_posicao AS id,
             fp.id_funcionario AS idFuncionario,
             fp.id_posicao AS idPosicao,
             f.nome_completo AS funcionarioNome,
             fp.data_inicio AS dataInicio,
             fp.data_fim AS dataFim,
             fp.vigente
      FROM funcionarios_posicoes fp
      INNER JOIN funcionarios f ON f.id_funcionario = fp.id_funcionario
      INNER JOIN organograma_posicoes p ON p.id_posicao = fp.id_posicao
      WHERE p.tenant_id = ?
      ORDER BY fp.vigente DESC, f.nome_completo
      `,
      [current.tenantId]
    );

    return ok({ setores, cargos, posicoes, vinculos, ocupacoes });
  } catch (error) {
    return handleApiError(error);
  }
}
