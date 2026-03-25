import { createHash, randomBytes } from 'crypto';
import { ApiError } from '@/lib/api/http';
import { db } from '@/lib/db';

export function hashExternalToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function generateExternalToken() {
  const raw = randomBytes(32).toString('hex');
  return `dw_${raw}`;
}

function assertSqlReady(err: unknown): never {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err || '').toLowerCase();
  if (msg.includes('analytics_external_tokens') || msg.includes('dw_cargas_') || msg.includes("doesn't exist") || msg.includes('unknown')) {
    throw new ApiError(501, 'Banco sem tabelas da camada Analytics/DW. Aplique o SQL desta etapa para habilitar.');
  }
  throw err as any;
}

export async function verifyExternalToken(args: { token: string }) {
  const token = String(args.token || '').trim();
  if (!token) throw new ApiError(401, 'Token ausente.');

  const tokenHash = hashExternalToken(token);
  try {
    const [[row]]: any = await db.query(
      `
      SELECT
        id_analytics_external_token AS id,
        tenant_id AS tenantId,
        nome,
        datasets_json AS datasetsJson,
        ativo,
        expira_em AS expiraEm
      FROM analytics_external_tokens
      WHERE token_hash = ?
      LIMIT 1
      `,
      [tokenHash]
    );
    if (!row) throw new ApiError(401, 'Token inválido.');
    if (!row.ativo) throw new ApiError(401, 'Token inativo.');
    if (row.expiraEm && new Date(row.expiraEm).getTime() < Date.now()) throw new ApiError(401, 'Token expirado.');
    const datasets = row.datasetsJson ? (typeof row.datasetsJson === 'string' ? JSON.parse(row.datasetsJson) : row.datasetsJson) : [];
    return {
      id: Number(row.id),
      tenantId: Number(row.tenantId),
      nome: String(row.nome),
      datasets: Array.isArray(datasets) ? datasets.map((d) => String(d)) : [],
    };
  } catch (e) {
    return assertSqlReady(e) as any;
  }
}

export function getBearerTokenFromRequest(req: Request) {
  const h = req.headers.get('authorization') || '';
  const [kind, value] = h.split(' ');
  if (String(kind).toLowerCase() !== 'bearer') return null;
  return value ? String(value).trim() : null;
}

