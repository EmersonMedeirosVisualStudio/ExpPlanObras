import { db } from '@/lib/db';
import { ApiError, handleApiError, ok } from '@/lib/api/http';
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

export async function PUT(req: Request, context: { params: Promise<{ id: string; idEndereco: string }> }) {
  try {
    const user = await requireApiPermission(PERMISSIONS.RH_FUNCIONARIOS_CRUD);
    const { id, idEndereco } = await context.params;
    const idFuncionario = Number(id);
    const enderecoId = Number(idEndereco);
    if (!Number.isFinite(idFuncionario) || idFuncionario <= 0) throw new ApiError(400, 'ID inválido');
    if (!Number.isFinite(enderecoId) || enderecoId <= 0) throw new ApiError(400, 'ID do endereço inválido');

    const body = (await req.json().catch(() => null)) as any;
    const cep = body?.cep !== undefined ? (body?.cep == null ? null : String(body.cep).trim()) : undefined;
    const logradouro = body?.logradouro !== undefined ? (body?.logradouro == null ? null : String(body.logradouro).trim()) : undefined;
    const numero = body?.numero !== undefined ? (body?.numero == null ? null : String(body.numero).trim()) : undefined;
    const complemento = body?.complemento !== undefined ? (body?.complemento == null ? null : String(body.complemento).trim()) : undefined;
    const bairro = body?.bairro !== undefined ? (body?.bairro == null ? null : String(body.bairro).trim()) : undefined;
    const cidade = body?.cidade !== undefined ? (body?.cidade == null ? null : String(body.cidade).trim()) : undefined;
    const uf = body?.uf !== undefined ? (body?.uf == null ? null : String(body.uf).trim().toUpperCase()) : undefined;
    const observacao = body?.observacao !== undefined ? (body?.observacao == null ? null : String(body.observacao).trim()) : undefined;
    const principal = body?.principal !== undefined ? body?.principal === true : undefined;

    if (logradouro !== undefined && logradouro && logradouro.length < 3) throw new ApiError(422, 'Logradouro inválido');
    if (cidade !== undefined && cidade && cidade.length < 2) throw new ApiError(422, 'Cidade inválida');
    if (uf !== undefined && uf && uf.length !== 2) throw new ApiError(422, 'UF inválida');

    const { table, cols } = await resolveEnderecoTable();
    const idCol = pickIdColumn(cols);
    const funcCol = pickFuncionarioColumn(cols);

    const updates: string[] = [];
    const params: any[] = [];

    const add = (col: string, value: any) => {
      if (!cols.has(col)) return;
      updates.push(`${col} = ?`);
      params.push(value);
    };

    if (cep !== undefined) add('cep', cep);
    if (logradouro !== undefined) add('logradouro', logradouro);
    if (numero !== undefined) add('numero', numero);
    if (complemento !== undefined) add('complemento', complemento);
    if (bairro !== undefined) add('bairro', bairro);
    if (cidade !== undefined) add('cidade', cidade);
    if (uf !== undefined) add('uf', uf);
    if (observacao !== undefined) add('observacao', observacao);
    if (principal !== undefined && cols.has('principal')) add('principal', principal ? 1 : 0);
    if (cols.has('atualizado_em')) add('atualizado_em', new Date());
    else if (cols.has('updated_at')) add('updated_at', new Date());

    if (!updates.length) throw new ApiError(422, 'Nada para atualizar');

    const conn: any = await (db as any).getConnection?.();
    if (!conn) {
      if (principal === true && cols.has('principal')) {
        await db.execute(`UPDATE ${table} SET principal = 0 WHERE tenant_id = ? AND ${funcCol} = ?`, [user.tenantId, idFuncionario]);
        await db.execute(
          `UPDATE ${table} SET principal = 1 WHERE tenant_id = ? AND ${funcCol} = ? AND ${idCol} = ?`,
          [user.tenantId, idFuncionario, enderecoId]
        );
        return ok(null, 'Endereço atualizado');
      }

      await db.execute(
        `UPDATE ${table}
         SET ${updates.join(', ')}
         WHERE tenant_id = ?
           AND ${funcCol} = ?
           AND ${idCol} = ?`,
        [...params, user.tenantId, idFuncionario, enderecoId]
      );
      return ok(null, 'Endereço atualizado');
    }

    try {
      await conn.beginTransaction();
      if (principal === true && cols.has('principal')) {
        await conn.execute(`UPDATE ${table} SET principal = 0 WHERE tenant_id = ? AND ${funcCol} = ?`, [user.tenantId, idFuncionario]);
        await conn.execute(`UPDATE ${table} SET principal = 1 WHERE tenant_id = ? AND ${funcCol} = ? AND ${idCol} = ?`, [
          user.tenantId,
          idFuncionario,
          enderecoId,
        ]);
        await conn.commit();
        return ok(null, 'Endereço atualizado');
      }

      await conn.execute(
        `UPDATE ${table}
         SET ${updates.join(', ')}
         WHERE tenant_id = ?
           AND ${funcCol} = ?
           AND ${idCol} = ?`,
        [...params, user.tenantId, idFuncionario, enderecoId]
      );
      await conn.commit();
      return ok(null, 'Endereço atualizado');
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

export async function DELETE(_req: Request, context: { params: Promise<{ id: string; idEndereco: string }> }) {
  try {
    const user = await requireApiPermission(PERMISSIONS.RH_FUNCIONARIOS_CRUD);
    const { id, idEndereco } = await context.params;
    const idFuncionario = Number(id);
    const enderecoId = Number(idEndereco);
    if (!Number.isFinite(idFuncionario) || idFuncionario <= 0) throw new ApiError(400, 'ID inválido');
    if (!Number.isFinite(enderecoId) || enderecoId <= 0) throw new ApiError(400, 'ID do endereço inválido');

    const { table, cols } = await resolveEnderecoTable();
    const idCol = pickIdColumn(cols);
    const funcCol = pickFuncionarioColumn(cols);

    await db.execute(`DELETE FROM ${table} WHERE tenant_id = ? AND ${funcCol} = ? AND ${idCol} = ?`, [user.tenantId, idFuncionario, enderecoId]);

    return ok(null, 'Endereço excluído');
  } catch (e) {
    return handleApiError(e);
  }
}

