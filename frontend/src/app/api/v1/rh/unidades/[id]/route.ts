import { db } from '@/lib/db';
import { audit } from '@/lib/api/audit';
import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

const TIPOS_UNIDADE = new Set([
  'ESCRITORIO',
  'FILIAL',
  'LOJA',
  'ALMOXARIFADO',
  'GARAGEM',
  'CENTRO_ADMINISTRATIVO',
  'UNIDADE_OPERACIONAL',
  'DEPOSITO',
  'OFICINA',
  'OUTRO_LOCAL_OPERACIONAL',
]);

async function ensureUnidadesTable() {
  await db
    .query(
      `
      CREATE TABLE IF NOT EXISTS unidades (
        id_unidade BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        tenant_id BIGINT UNSIGNED NOT NULL,
        nome VARCHAR(200) NOT NULL,
        tipo_unidade VARCHAR(40) NULL,
        ativo TINYINT NOT NULL DEFAULT 1,
        criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id_unidade),
        KEY idx_tenant (tenant_id),
        KEY idx_nome (tenant_id, nome)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `
    )
    .catch(() => null);

  await db.query(`ALTER TABLE unidades ADD COLUMN tipo_unidade VARCHAR(40) NULL`).catch(() => null);
  await db.query(`ALTER TABLE unidades ADD KEY idx_tipo (tenant_id, tipo_unidade)`).catch(() => null);
  await db.query(`ALTER TABLE unidades ADD UNIQUE KEY uk_unidade (tenant_id, tipo_unidade, nome)`).catch(() => null);
}

function normalizeTipoUnidade(v: unknown) {
  const raw = String(v || '')
    .trim()
    .toUpperCase()
    .replace(/[^\w]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!raw) return null;
  return raw;
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.RH_FUNCIONARIOS_VIEW);
    await ensureUnidadesTable();
    const { id } = await context.params;
    const idUnidade = Number(id);
    if (!Number.isFinite(idUnidade)) throw new ApiError(400, 'ID inválido.');

    const [[row]]: any = await db.query(
      `
      SELECT id_unidade AS id, nome, COALESCE(tipo_unidade,'') AS tipoUnidade, ativo, criado_em AS criadoEm, atualizado_em AS atualizadoEm
      FROM unidades
      WHERE tenant_id = ? AND id_unidade = ?
      LIMIT 1
      `,
      [current.tenantId, idUnidade]
    );
    if (!row) throw new ApiError(404, 'Unidade não encontrada');
    return ok({
      id: Number(row.id),
      nome: String(row.nome || ''),
      tipoUnidade: String(row.tipoUnidade || '').trim() || null,
      ativo: Boolean(row.ativo),
      criadoEm: row.criadoEm ? String(row.criadoEm) : null,
      atualizadoEm: row.atualizadoEm ? String(row.atualizadoEm) : null,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.RH_FUNCIONARIOS_CRUD);
    await ensureUnidadesTable();
    const { id } = await context.params;
    const idUnidade = Number(id);
    if (!Number.isFinite(idUnidade)) throw new ApiError(400, 'ID inválido.');
    const body = await req.json();

    const nome = body?.nome != null ? String(body.nome || '').trim() : null;
    const tipoUnidade = body?.tipoUnidade != null ? normalizeTipoUnidade(body.tipoUnidade) : null;
    const ativo = body?.ativo === true ? 1 : body?.ativo === false ? 0 : null;

    const [[row]]: any = await db.query(`SELECT id_unidade AS id FROM unidades WHERE tenant_id = ? AND id_unidade = ? LIMIT 1`, [
      current.tenantId,
      idUnidade,
    ]);
    if (!row?.id) throw new ApiError(404, 'Unidade não encontrada');

    const sets: string[] = [];
    const params: any[] = [];
    if (nome != null) {
      if (!nome) throw new ApiError(422, 'Nome obrigatório');
      sets.push('nome = ?');
      params.push(nome);
    }
    if (tipoUnidade != null) {
      if (!tipoUnidade) throw new ApiError(422, 'Tipo de unidade obrigatório');
      if (!TIPOS_UNIDADE.has(tipoUnidade)) throw new ApiError(422, 'Tipo de unidade inválido');
      sets.push('tipo_unidade = ?');
      params.push(tipoUnidade);
    }
    if (ativo != null) {
      sets.push('ativo = ?');
      params.push(ativo);
    }
    if (!sets.length) throw new ApiError(422, 'Nada para atualizar');

    await db.query(`UPDATE unidades SET ${sets.join(', ')} WHERE tenant_id = ? AND id_unidade = ?`, [...params, current.tenantId, idUnidade]);

    await audit({
      tenantId: current.tenantId,
      userId: current.id,
      entidade: 'unidades',
      idRegistro: String(idUnidade),
      acao: 'UPDATE',
      dadosNovos: { nome: nome ?? undefined, tipoUnidade: tipoUnidade ?? undefined, ativo: ativo != null ? Boolean(ativo) : undefined },
    });

    return ok({ id: idUnidade });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.RH_FUNCIONARIOS_CRUD);
    await ensureUnidadesTable();
    const { id } = await context.params;
    const idUnidade = Number(id);
    if (!Number.isFinite(idUnidade)) throw new ApiError(400, 'ID inválido.');

    const [res]: any = await db.query(`UPDATE unidades SET ativo = 0 WHERE tenant_id = ? AND id_unidade = ?`, [current.tenantId, idUnidade]);
    if (!res?.affectedRows) throw new ApiError(404, 'Unidade não encontrada');

    await audit({
      tenantId: current.tenantId,
      userId: current.id,
      entidade: 'unidades',
      idRegistro: String(idUnidade),
      acao: 'DELETE',
      dadosNovos: { ativo: false },
    });

    return ok({ id: idUnidade });
  } catch (e) {
    return handleApiError(e);
  }
}

