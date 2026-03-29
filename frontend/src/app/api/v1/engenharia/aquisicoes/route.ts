import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import { getDashboardScope } from '@/lib/dashboard/scope';
import { audit } from '@/lib/api/audit';

export const runtime = 'nodejs';

async function ensureTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS engenharia_solicitacoes_aquisicao (
      id_solicitacao BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      tipo_local ENUM('OBRA','UNIDADE') NOT NULL,
      id_local BIGINT UNSIGNED NOT NULL,
      categoria ENUM('EQUIPAMENTO','FERRAMENTA','COMBUSTIVEL','OUTRO') NOT NULL DEFAULT 'OUTRO',
      descricao VARCHAR(255) NOT NULL,
      quantidade DECIMAL(14,4) NOT NULL DEFAULT 1,
      unidade_medida VARCHAR(32) NULL,
      codigo_servico VARCHAR(80) NULL,
      prioridade ENUM('BAIXA','MEDIA','ALTA','CRITICA') NOT NULL DEFAULT 'MEDIA',
      status ENUM('RASCUNHO','ENVIADA','APROVADA','REJEITADA','CANCELADA') NOT NULL DEFAULT 'RASCUNHO',
      justificativa TEXT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      enviado_em DATETIME NULL,
      aprovado_em DATETIME NULL,
      id_usuario_solicitante BIGINT UNSIGNED NULL,
      id_usuario_aprovador BIGINT UNSIGNED NULL,
      motivo_rejeicao TEXT NULL,
      PRIMARY KEY (id_solicitacao),
      KEY idx_local (tenant_id, tipo_local, id_local),
      KEY idx_status (tenant_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

async function assertServicoExists(tenantId: number, codigo: string) {
  const [[row]]: any = await db.query(`SELECT 1 AS ok FROM engenharia_servicos WHERE tenant_id = ? AND codigo = ? LIMIT 1`, [tenantId, codigo]);
  if (!row) throw new Error('Código de serviço inválido');
}

function normalizeTipoLocal(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'OBRA' || s === 'UNIDADE' ? s : null;
}

function normalizeCategoria(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'EQUIPAMENTO' || s === 'FERRAMENTA' || s === 'COMBUSTIVEL' || s === 'OUTRO' ? s : null;
}

function normalizePrioridade(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'BAIXA' || s === 'MEDIA' || s === 'ALTA' || s === 'CRITICA' ? s : null;
}

function normalizeStatus(v: unknown) {
  const s = String(v ?? '').trim().toUpperCase();
  return s === 'RASCUNHO' || s === 'ENVIADA' || s === 'APROVADA' || s === 'REJEITADA' || s === 'CANCELADA' ? s : null;
}

function toNumber(v: unknown) {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

export async function GET(req: NextRequest) {
  try {
    const current = await requireApiPermission(PERMISSIONS.DASHBOARD_ENGENHARIA_VIEW);
    const scope = await getDashboardScope(current);

    const tipoLocal = normalizeTipoLocal(req.nextUrl.searchParams.get('tipoLocal'));
    const idLocal = Number(req.nextUrl.searchParams.get('idLocal') || 0);
    const status = normalizeStatus(req.nextUrl.searchParams.get('status'));
    const limite = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get('limite') || 50)));

    if (tipoLocal) {
      if (!Number.isFinite(idLocal) || idLocal <= 0) return fail(422, 'idLocal é obrigatório');
      if (!scope.empresaTotal && tipoLocal === 'OBRA' && !scope.obras.includes(idLocal)) return fail(403, 'Obra fora da abrangência');
      if (!scope.empresaTotal && tipoLocal === 'UNIDADE' && !scope.unidades.includes(idLocal)) return fail(403, 'Unidade fora da abrangência');
    } else if (!scope.empresaTotal) {
      return fail(422, 'Informe tipoLocal e idLocal');
    }

    await ensureTables();

    const where: string[] = ['tenant_id = ?'];
    const params: any[] = [current.tenantId];
    if (tipoLocal) {
      where.push('tipo_local = ? AND id_local = ?');
      params.push(tipoLocal, idLocal);
    }
    if (status) {
      where.push('status = ?');
      params.push(status);
    }

    const [rows]: any = await db.query(
      `
      SELECT
        id_solicitacao AS idSolicitacao,
        tipo_local AS tipoLocal,
        id_local AS idLocal,
        categoria,
        descricao,
        quantidade,
        unidade_medida AS unidadeMedida,
        codigo_servico AS codigoServico,
        prioridade,
        status,
        criado_em AS criadoEm,
        enviado_em AS enviadoEm,
        aprovado_em AS aprovadoEm
      FROM engenharia_solicitacoes_aquisicao
      WHERE ${where.join(' AND ')}
      ORDER BY id_solicitacao DESC
      LIMIT ?
      `,
      [...params, limite]
    );
    return ok(
      (rows as any[]).map((r) => ({
        ...r,
        idSolicitacao: Number(r.idSolicitacao),
        idLocal: Number(r.idLocal),
        quantidade: Number(r.quantidade || 0),
      }))
    );
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

    const tipoLocal = normalizeTipoLocal(body?.tipoLocal);
    const idLocal = Number(body?.idLocal || 0);
    const categoria = normalizeCategoria(body?.categoria) || 'OUTRO';
    const descricao = String(body?.descricao || '').trim();
    const quantidade = toNumber(body?.quantidade ?? 1);
    const unidadeMedida = body?.unidadeMedida ? String(body.unidadeMedida).trim() : null;
    const codigoServico = body?.codigoServico ? String(body.codigoServico).trim() : null;
    const prioridade = normalizePrioridade(body?.prioridade) || 'MEDIA';
    const justificativa = body?.justificativa ? String(body.justificativa).trim() : null;

    if (!tipoLocal) return fail(422, 'tipoLocal é obrigatório (OBRA|UNIDADE)');
    if (!Number.isFinite(idLocal) || idLocal <= 0) return fail(422, 'idLocal é obrigatório');
    if (!descricao) return fail(422, 'descricao é obrigatória');
    if (!Number.isFinite(quantidade) || quantidade <= 0) return fail(422, 'quantidade inválida');
    if (codigoServico) await assertServicoExists(current.tenantId, codigoServico);
    if (!scope.empresaTotal && tipoLocal === 'OBRA' && !scope.obras.includes(idLocal)) return fail(403, 'Obra fora da abrangência');
    if (!scope.empresaTotal && tipoLocal === 'UNIDADE' && !scope.unidades.includes(idLocal)) return fail(403, 'Unidade fora da abrangência');

    await ensureTables();

    await conn.beginTransaction();
    const [ins]: any = await conn.query(
      `
      INSERT INTO engenharia_solicitacoes_aquisicao
        (tenant_id, tipo_local, id_local, categoria, descricao, quantidade, unidade_medida, codigo_servico, prioridade, status, justificativa, id_usuario_solicitante)
      VALUES
        (?,?,?,?,?,?,?,?,?,'RASCUNHO',?,?)
      `,
      [
        current.tenantId,
        tipoLocal,
        idLocal,
        categoria,
        descricao.slice(0, 255),
        quantidade,
        unidadeMedida ? unidadeMedida.slice(0, 32) : null,
        codigoServico ? codigoServico.slice(0, 80) : null,
        prioridade,
        justificativa,
        current.id,
      ]
    );

    await audit({
      tenantId: current.tenantId,
      userId: current.id,
      entidade: 'engenharia_solicitacoes_aquisicao',
      idRegistro: String(ins.insertId),
      acao: 'CREATE',
      dadosNovos: { tipoLocal, idLocal, categoria, descricao, quantidade, unidadeMedida, codigoServico, prioridade },
    });

    await conn.commit();
    return ok({ idSolicitacao: Number(ins.insertId) });
  } catch (e) {
    await conn.rollback();
    return handleApiError(e);
  } finally {
    conn.release();
  }
}

