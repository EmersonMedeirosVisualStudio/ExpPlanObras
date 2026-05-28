import { db } from '@/lib/db';
import { audit } from '@/lib/api/audit';
import { ApiError, created, ok, handleApiError } from '@/lib/api/http';
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

export async function GET(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.RH_FUNCIONARIOS_VIEW);
    await ensureUnidadesTable();
    const { searchParams } = new URL(req.url);
    const q = String(searchParams.get('q') || '').trim();
    const tipo = normalizeTipoUnidade(searchParams.get('tipo'));
    const ativo = String(searchParams.get('ativo') || '').trim();

    const where: string[] = ['tenant_id = ?'];
    const params: any[] = [current.tenantId];

    if (tipo) {
      where.push('tipo_unidade = ?');
      params.push(tipo);
    }
    if (ativo === '1' || ativo === '0') {
      where.push('ativo = ?');
      params.push(Number(ativo));
    }
    if (q) {
      where.push('nome LIKE ?');
      params.push(`%${q}%`);
    }

    const [rows]: any = await db.query(
      `
      SELECT
        id_unidade AS id,
        nome,
        COALESCE(tipo_unidade,'') AS tipoUnidade,
        ativo,
        criado_em AS criadoEm,
        atualizado_em AS atualizadoEm
      FROM unidades
      WHERE ${where.join(' AND ')}
      ORDER BY ativo DESC, nome ASC, id_unidade DESC
      LIMIT 500
      `,
      params
    );
    return ok(
      (Array.isArray(rows) ? rows : []).map((r: any) => ({
        id: Number(r.id),
        nome: String(r.nome || ''),
        tipoUnidade: String(r.tipoUnidade || '').trim() || null,
        ativo: Boolean(r.ativo),
        criadoEm: r.criadoEm ? String(r.criadoEm) : null,
        atualizadoEm: r.atualizadoEm ? String(r.atualizadoEm) : null,
      }))
    );
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.RH_FUNCIONARIOS_CRUD);
    await ensureUnidadesTable();
    const body = await req.json();
    const nome = String(body?.nome || '').trim();
    const tipoUnidade = normalizeTipoUnidade(body?.tipoUnidade) || 'OUTRO_LOCAL_OPERACIONAL';
    const ativo = body?.ativo === false ? 0 : 1;

    if (!nome) throw new ApiError(422, 'Nome obrigatório');
    if (!TIPOS_UNIDADE.has(tipoUnidade)) throw new ApiError(422, 'Tipo de unidade inválido');

    const [[exists]]: any = await db.query(
      `SELECT id_unidade AS id FROM unidades WHERE tenant_id = ? AND tipo_unidade = ? AND nome = ? LIMIT 1`,
      [current.tenantId, tipoUnidade, nome]
    );
    if (exists?.id) throw new ApiError(409, 'Já existe uma unidade com esse nome e tipo');

    const [result]: any = await db.query(`INSERT INTO unidades (tenant_id, nome, tipo_unidade, ativo) VALUES (?, ?, ?, ?)`, [
      current.tenantId,
      nome,
      tipoUnidade,
      ativo,
    ]);

    await audit({
      tenantId: current.tenantId,
      userId: current.id,
      entidade: 'unidades',
      idRegistro: String(result.insertId),
      acao: 'CREATE',
      dadosNovos: { nome, tipoUnidade, ativo: Boolean(ativo) },
    });

    return created({ id: Number(result.insertId) });
  } catch (e) {
    return handleApiError(e);
  }
}

