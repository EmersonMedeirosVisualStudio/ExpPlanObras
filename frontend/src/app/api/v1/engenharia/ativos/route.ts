import { NextRequest } from 'next/server';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { db } from '@/lib/db';
import { getDashboardScope, inClause } from '@/lib/dashboard/scope';

export const runtime = 'nodejs';

async function ensureAtivosTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_ativos (
      id_ativo BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      categoria ENUM('EQUIPAMENTO','FERRAMENTA','VEICULO') NOT NULL DEFAULT 'EQUIPAMENTO',
      descricao VARCHAR(255) NOT NULL,
      codigo_interno VARCHAR(80) NULL,
      patrimonio VARCHAR(80) NULL,
      proprietario ENUM('PROPRIO','TERCEIRO') NOT NULL DEFAULT 'PROPRIO',
      status ENUM('ATIVO','MANUTENCAO','DESCARTADO','INATIVO') NOT NULL DEFAULT 'ATIVO',
      local_tipo ENUM('OBRA','UNIDADE','ALMOXARIFADO','TERCEIRO') NULL,
      local_id BIGINT UNSIGNED NULL,
      id_contraparte BIGINT UNSIGNED NULL,
      id_contrato_locacao BIGINT UNSIGNED NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_ativo),
      KEY idx_tenant (tenant_id),
      KEY idx_local (tenant_id, local_tipo, local_id),
      KEY idx_status (tenant_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

async function ensureContrapartesTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_contrapartes (
      id_contraparte BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      tipo ENUM('PJ','PF') NOT NULL,
      nome_razao VARCHAR(255) NOT NULL,
      documento VARCHAR(32) NULL,
      email VARCHAR(120) NULL,
      telefone VARCHAR(40) NULL,
      status ENUM('ATIVO','INATIVO') NOT NULL DEFAULT 'ATIVO',
      observacao TEXT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_contraparte),
      KEY idx_tenant (tenant_id),
      KEY idx_tipo (tenant_id, tipo),
      KEY idx_doc (tenant_id, documento)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

async function ensureContratosLocacaoTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_contratos_locacao (
      id_contrato_locacao BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      tipo ENUM('ATIVO','PASSIVO','SERVICO') NOT NULL,
      id_contraparte BIGINT UNSIGNED NOT NULL,
      numero VARCHAR(80) NULL,
      descricao VARCHAR(255) NULL,
      codigo_servico VARCHAR(80) NULL,
      data_inicio DATE NULL,
      data_fim DATE NULL,
      valor_mensal DECIMAL(14,2) NULL,
      status ENUM('ATIVO','ENCERRADO') NOT NULL DEFAULT 'ATIVO',
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_contrato_locacao),
      KEY idx_tenant (tenant_id),
      KEY idx_contraparte (tenant_id, id_contraparte),
      KEY idx_tipo (tenant_id, tipo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

function buildOnlyFilter(ids: number[] | null, alias: string) {
  if (ids === null) return { sql: '', params: [] as number[] };
  if (!ids.length) return { sql: ' AND 1 = 0', params: [] as number[] };
  const c = inClause(ids);
  return { sql: ` AND ${alias} IN ${c.sql}`, params: c.params };
}

function normalizeCategoria(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'FERRAMENTA' || s === 'VEICULO' || s === 'EQUIPAMENTO' ? s : null;
}

function normalizeProprietario(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'TERCEIRO' || s === 'PROPRIO' ? s : null;
}

function normalizeStatus(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'ATIVO' || s === 'MANUTENCAO' || s === 'DESCARTADO' || s === 'INATIVO' ? s : null;
}

function normalizeLocalTipo(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'OBRA' || s === 'UNIDADE' || s === 'ALMOXARIFADO' || s === 'TERCEIRO' ? s : null;
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const scope = await getDashboardScope(current);

    const idObra = Number(req.nextUrl.searchParams.get('idObra') || 0);
    const idUnidade = Number(req.nextUrl.searchParams.get('idUnidade') || 0);
    const categoria = normalizeCategoria(req.nextUrl.searchParams.get('categoria'));
    const status = normalizeStatus(req.nextUrl.searchParams.get('status'));
    const q = String(req.nextUrl.searchParams.get('q') || '').trim();

    if (!scope.empresaTotal) {
      if (idObra && !scope.obras.includes(idObra)) return fail(403, 'Obra fora da abrangência');
      if (idUnidade && !scope.unidades.includes(idUnidade)) return fail(403, 'Unidade fora da abrangência');
    }

    await ensureAtivosTables();

    const obrasSelecionadas = idObra ? [idObra] : scope.empresaTotal && !idUnidade ? null : scope.obras;
    const unidadesSelecionadas = idUnidade ? [idUnidade] : scope.empresaTotal && !idObra ? null : scope.unidades;

    const fObra = buildOnlyFilter(obrasSelecionadas, 'a.local_id');
    const fUn = buildOnlyFilter(unidadesSelecionadas, 'a.local_id');

    const where: string[] = ['a.tenant_id = ?'];
    const params: any[] = [current.tenantId];

    if (categoria) {
      where.push('a.categoria = ?');
      params.push(categoria);
    }
    if (status) {
      where.push('a.status = ?');
      params.push(status);
    }
    if (q) {
      where.push('(a.descricao LIKE ? OR a.codigo_interno LIKE ? OR a.patrimonio LIKE ?)');
      const s = `%${q}%`;
      params.push(s, s, s);
    }

    if (idObra || (!scope.empresaTotal && !idUnidade)) {
      where.push(`a.local_tipo = 'OBRA' ${fObra.sql}`);
      params.push(...fObra.params);
    } else if (idUnidade || (!scope.empresaTotal && !idObra)) {
      where.push(`a.local_tipo = 'UNIDADE' ${fUn.sql}`);
      params.push(...fUn.params);
    }

    const [rows]: any = await db.query(
      `
      SELECT
        a.id_ativo AS idAtivo,
        a.categoria,
        a.descricao,
        a.codigo_interno AS codigoInterno,
        a.patrimonio,
        a.proprietario,
        a.status,
        a.local_tipo AS localTipo,
        a.local_id AS localId,
        a.id_contraparte AS idContraparte,
        a.id_contrato_locacao AS idContratoLocacao,
        a.criado_em AS criadoEm,
        a.atualizado_em AS atualizadoEm
      FROM engenharia_ativos a
      WHERE ${where.join(' AND ')}
      ORDER BY a.atualizado_em DESC, a.id_ativo DESC
      LIMIT 500
      `,
      params
    );
    return ok((rows as any[]).map((r) => ({ ...r, idAtivo: Number(r.idAtivo), localId: r.localId ? Number(r.localId) : null })));
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  const conn = await db.getConnection();
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const scope = await getDashboardScope(current);
    const body = await req.json().catch(() => null);

    const categoria = normalizeCategoria(body?.categoria) || 'EQUIPAMENTO';
    const descricao = String(body?.descricao || '').trim();
    const codigoInterno = body?.codigoInterno ? String(body.codigoInterno).trim() : null;
    const patrimonio = body?.patrimonio ? String(body.patrimonio).trim() : null;
    const proprietario = normalizeProprietario(body?.proprietario) || 'PROPRIO';
    const status = normalizeStatus(body?.status) || 'ATIVO';
    const localTipo = normalizeLocalTipo(body?.localTipo);
    const localId = body?.localId ? Number(body.localId) : null;
    const idContraparte = body?.idContraparte ? Number(body.idContraparte) : null;
    const idContratoLocacao = body?.idContratoLocacao ? Number(body.idContratoLocacao) : null;

    if (!descricao) return fail(422, 'descricao é obrigatória');
    if (localTipo && (!Number.isFinite(Number(localId)) || !localId)) return fail(422, 'localId é obrigatório quando localTipo informado');
    if (idContraparte != null && (!Number.isFinite(idContraparte) || idContraparte <= 0)) return fail(422, 'idContraparte inválido');
    if (idContratoLocacao != null && (!Number.isFinite(idContratoLocacao) || idContratoLocacao <= 0)) return fail(422, 'idContratoLocacao inválido');

    if (!scope.empresaTotal && localTipo === 'OBRA' && localId && !scope.obras.includes(localId)) return fail(403, 'Obra fora da abrangência');
    if (!scope.empresaTotal && localTipo === 'UNIDADE' && localId && !scope.unidades.includes(localId)) return fail(403, 'Unidade fora da abrangência');

    await ensureAtivosTables();
    await ensureContrapartesTables();
    await ensureContratosLocacaoTables();

    let resolvedContraparteId = idContraparte;
    if (idContratoLocacao) {
      const [[ct]]: any = await conn.query(
        `
        SELECT id_contrato_locacao AS idContratoLocacao, tipo, id_contraparte AS idContraparte
        FROM engenharia_contratos_locacao
        WHERE tenant_id = ? AND id_contrato_locacao = ?
        LIMIT 1
        `,
        [current.tenantId, idContratoLocacao]
      );
      if (!ct) return fail(404, 'Contrato de locação não encontrado');
      const tipoContrato = String(ct.tipo || '').toUpperCase();
      if (tipoContrato === 'PASSIVO' && proprietario !== 'TERCEIRO') return fail(422, 'Para contrato PASSIVO, proprietario deve ser TERCEIRO');
      if (tipoContrato === 'ATIVO' && proprietario !== 'PROPRIO') return fail(422, 'Para contrato ATIVO, proprietario deve ser PROPRIO');
      if (!resolvedContraparteId) resolvedContraparteId = Number(ct.idContraparte);
      if (resolvedContraparteId && Number(ct.idContraparte) !== Number(resolvedContraparteId)) return fail(422, 'Contraparte não confere com o contrato');
    }

    if (resolvedContraparteId) {
      const [[cp]]: any = await conn.query(
        `SELECT id_contraparte FROM engenharia_contrapartes WHERE tenant_id = ? AND id_contraparte = ? LIMIT 1`,
        [current.tenantId, resolvedContraparteId]
      );
      if (!cp) return fail(404, 'Contraparte não encontrada');
    }

    await conn.beginTransaction();
    const [ins]: any = await conn.query(
      `
      INSERT INTO engenharia_ativos
        (tenant_id, categoria, descricao, codigo_interno, patrimonio, proprietario, status, local_tipo, local_id, id_contraparte, id_contrato_locacao)
      VALUES
        (?,?,?,?,?,?,?,?,?,?,?)
      `,
      [
        current.tenantId,
        categoria,
        descricao.slice(0, 255),
        codigoInterno ? codigoInterno.slice(0, 80) : null,
        patrimonio ? patrimonio.slice(0, 80) : null,
        proprietario,
        status,
        localTipo,
        localId,
        resolvedContraparteId,
        idContratoLocacao,
      ]
    );
    await conn.commit();
    return ok({ idAtivo: Number(ins.insertId) });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}
