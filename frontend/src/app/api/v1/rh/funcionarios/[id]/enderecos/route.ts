import { db } from '@/lib/db';
import { ApiError, created, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

async function resolveEnderecoTable() {
  const candidates = ['funcionarios_enderecos', 'rh_funcionarios_enderecos', 'enderecos_funcionarios', 'funcionario_enderecos'];
  const [tables]: any = await db.query(
    `SELECT table_name tableName
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name IN (${candidates.map(() => '?').join(', ')})`,
    candidates
  );
  const found = Array.isArray(tables) && tables.length ? String(tables[0]?.tableName || tables[0]?.TABLE_NAME || '') : '';
  if (!found) throw new ApiError(501, 'Tabela de endereços de funcionário não encontrada no banco.');

  const [colRows]: any = await db.query(
    `SELECT COLUMN_NAME columnName
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?`,
    [found]
  );
  const cols = new Set<string>((Array.isArray(colRows) ? colRows : []).map((r: any) => String(r.columnName || r.COLUMN_NAME || '')));
  return { table: found, cols };
}

function pickIdColumn(cols: Set<string>) {
  if (cols.has('id_endereco')) return 'id_endereco';
  if (cols.has('id_funcionario_endereco')) return 'id_funcionario_endereco';
  if (cols.has('id')) return 'id';
  const fallback = Array.from(cols).find((c) => c.startsWith('id_') && c !== 'id_funcionario' && c !== 'id_tenant' && c !== 'tenant_id');
  if (!fallback) throw new ApiError(500, 'Tabela de endereços sem coluna de ID reconhecida.');
  return fallback;
}

function pickFuncionarioColumn(cols: Set<string>) {
  if (cols.has('id_funcionario')) return 'id_funcionario';
  if (cols.has('funcionario_id')) return 'funcionario_id';
  throw new ApiError(500, 'Tabela de endereços sem coluna id_funcionario reconhecida.');
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiPermission(PERMISSIONS.RH_FUNCIONARIOS_VIEW);
    const { id } = await context.params;
    const idFuncionario = Number(id);
    if (!Number.isFinite(idFuncionario) || idFuncionario <= 0) throw new ApiError(400, 'ID inválido');

    const { table, cols } = await resolveEnderecoTable();
    const idCol = pickIdColumn(cols);
    const funcCol = pickFuncionarioColumn(cols);

    const selectCols: string[] = [`e.${idCol} id`, `e.${funcCol} idFuncionario`];
    const map: Array<[string, string]> = [
      ['cep', 'cep'],
      ['logradouro', 'logradouro'],
      ['numero', 'numero'],
      ['complemento', 'complemento'],
      ['bairro', 'bairro'],
      ['cidade', 'cidade'],
      ['uf', 'uf'],
      ['observacao', 'observacao'],
      ['principal', 'principal'],
    ];
    for (const [col, alias] of map) {
      if (cols.has(col)) selectCols.push(`e.${col} ${alias}`);
    }
    if (cols.has('criado_em')) selectCols.push(`e.criado_em criadoEm`);
    else if (cols.has('created_at')) selectCols.push(`e.created_at criadoEm`);
    if (cols.has('atualizado_em')) selectCols.push(`e.atualizado_em atualizadoEm`);
    else if (cols.has('updated_at')) selectCols.push(`e.updated_at atualizadoEm`);

    const [rows]: any = await db.query(
      `SELECT ${selectCols.join(', ')}
       FROM ${table} e
       WHERE e.tenant_id = ?
         AND e.${funcCol} = ?
       ORDER BY ${cols.has('principal') ? 'e.principal DESC,' : ''} e.${idCol} DESC`,
      [user.tenantId, idFuncionario]
    );

    const nowIso = new Date().toISOString();
    const list = (Array.isArray(rows) ? rows : []).map((r: any) => ({
      id: Number(r.id),
      idFuncionario: Number(r.idFuncionario || idFuncionario),
      cep: r.cep == null ? null : String(r.cep),
      logradouro: r.logradouro == null ? null : String(r.logradouro),
      numero: r.numero == null ? null : String(r.numero),
      complemento: r.complemento == null ? null : String(r.complemento),
      bairro: r.bairro == null ? null : String(r.bairro),
      cidade: r.cidade == null ? null : String(r.cidade),
      uf: r.uf == null ? null : String(r.uf),
      observacao: r.observacao == null ? null : String(r.observacao),
      principal: cols.has('principal') ? !!r.principal : false,
      criadoEm: r.criadoEm ? new Date(r.criadoEm).toISOString() : nowIso,
      atualizadoEm: r.atualizadoEm ? new Date(r.atualizadoEm).toISOString() : (r.criadoEm ? new Date(r.criadoEm).toISOString() : nowIso),
    }));

    return ok(list);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiPermission(PERMISSIONS.RH_FUNCIONARIOS_CRUD);
    const { id } = await context.params;
    const idFuncionario = Number(id);
    if (!Number.isFinite(idFuncionario) || idFuncionario <= 0) throw new ApiError(400, 'ID inválido');

    const body = (await req.json().catch(() => null)) as any;
    const cep = body?.cep ? String(body.cep).trim() : null;
    const logradouro = body?.logradouro ? String(body.logradouro).trim() : null;
    const numero = body?.numero ? String(body.numero).trim() : null;
    const complemento = body?.complemento ? String(body.complemento).trim() : null;
    const bairro = body?.bairro ? String(body.bairro).trim() : null;
    const cidade = body?.cidade ? String(body.cidade).trim() : null;
    const uf = body?.uf ? String(body.uf).trim().toUpperCase() : null;
    const observacao = body?.observacao ? String(body.observacao).trim() : null;
    const principal = body?.principal === true;

    if (!logradouro || logradouro.length < 3) throw new ApiError(422, 'Logradouro é obrigatório');
    if (!cidade || cidade.length < 2) throw new ApiError(422, 'Cidade é obrigatória');
    if (!uf || uf.length !== 2) throw new ApiError(422, 'UF inválida');

    const { table, cols } = await resolveEnderecoTable();
    const funcCol = pickFuncionarioColumn(cols);

    const conn: any = await (db as any).getConnection?.();
    if (!conn) {
      const colsInsert: string[] = ['tenant_id', funcCol];
      const vals: any[] = [user.tenantId, idFuncionario];
      const add = (col: string, v: any) => {
        if (cols.has(col)) {
          colsInsert.push(col);
          vals.push(v);
        }
      };
      add('cep', cep);
      add('logradouro', logradouro);
      add('numero', numero);
      add('complemento', complemento);
      add('bairro', bairro);
      add('cidade', cidade);
      add('uf', uf);
      add('observacao', observacao);
      add('principal', principal ? 1 : 0);

      const [result]: any = await db.execute(
        `INSERT INTO ${table} (${colsInsert.join(', ')}) VALUES (${colsInsert.map(() => '?').join(', ')})`,
        vals
      );
      return created({ id: result.insertId }, 'Endereço criado');
    }

    try {
      await conn.beginTransaction();

      if (principal && cols.has('principal')) {
        await conn.execute(`UPDATE ${table} SET principal = 0 WHERE tenant_id = ? AND ${funcCol} = ?`, [user.tenantId, idFuncionario]);
      }

      const colsInsert: string[] = ['tenant_id', funcCol];
      const vals: any[] = [user.tenantId, idFuncionario];
      const add = (col: string, v: any) => {
        if (cols.has(col)) {
          colsInsert.push(col);
          vals.push(v);
        }
      };
      add('cep', cep);
      add('logradouro', logradouro);
      add('numero', numero);
      add('complemento', complemento);
      add('bairro', bairro);
      add('cidade', cidade);
      add('uf', uf);
      add('observacao', observacao);
      add('principal', principal ? 1 : 0);

      const [result]: any = await conn.execute(
        `INSERT INTO ${table} (${colsInsert.join(', ')}) VALUES (${colsInsert.map(() => '?').join(', ')})`,
        vals
      );

      await conn.commit();
      return created({ id: result.insertId }, 'Endereço criado');
    } catch (e) {
      try {
        await conn.rollback();
      } catch {}
      throw e;
    } finally {
      try {
        conn.release();
      } catch {}
    }
  } catch (e) {
    return handleApiError(e);
  }
}
