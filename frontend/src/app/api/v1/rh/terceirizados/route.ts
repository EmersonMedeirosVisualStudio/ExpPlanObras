import { db } from '@/lib/db';
import { ApiError, created, fail, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

async function ensureEmpresaParceiraPadrao(tenantId: number) {
  const [[row]]: any = await db.query(
    `SELECT id_empresa_parceira id FROM terceirizados_empresas_parceiras WHERE tenant_id = ? ORDER BY id_empresa_parceira ASC LIMIT 1`,
    [tenantId]
  );
  if (row?.id) return Number(row.id);

  const [result]: any = await db.execute(
    `INSERT INTO terceirizados_empresas_parceiras (tenant_id, razao_social, cnpj, telefone, email, ativo)
     VALUES (?, ?, NULL, NULL, NULL, 1)`,
    [tenantId, 'Não informado']
  );
  return Number(result.insertId);
}

export async function GET(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.RH_FUNCIONARIOS_VIEW);
    const { searchParams } = new URL(req.url);
    const q = String(searchParams.get('q') || '').trim();
    const idObra = Number(searchParams.get('idObra') || 0);
    const idContrato = Number(searchParams.get('idContrato') || 0);
    const limitParam = searchParams.get('limit');
    const requested = limitParam ? Number(limitParam) : NaN;
    const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 1000) : q ? 500 : 200;

    await ensureEmpresaParceiraPadrao(current.tenantId);

    let sql = `
      SELECT
        t.id_terceirizado_trabalhador id,
        t.nome_completo nomeCompleto,
        t.cpf,
        t.funcao,
        t.ativo,
        t.id_empresa_parceira idEmpresaParceira,
        ep.razao_social empresaParceira,
        CASE
          WHEN a.tipo_local = 'OBRA' THEN 'OBRA'
          WHEN a.tipo_local = 'UNIDADE' THEN 'UNIDADE'
          ELSE NULL
        END AS tipoLocal,
        a.id_obra AS idObra,
        a.id_unidade AS idUnidade,
        CASE
          WHEN a.tipo_local = 'OBRA' THEN COALESCE(NULLIF(o.nome_obra, ''), CONCAT('Obra #', o.id_obra))
          WHEN a.tipo_local = 'UNIDADE' THEN u.nome
          ELSE NULL
        END AS localNome,
        c.id_contrato AS contratoId,
        c.numero_contrato AS contratoNumero
      FROM terceirizados_trabalhadores t
      JOIN terceirizados_empresas_parceiras ep ON ep.id_empresa_parceira = t.id_empresa_parceira
      LEFT JOIN terceirizados_alocacoes a ON a.id_terceirizado_trabalhador = t.id_terceirizado_trabalhador AND a.atual = 1
      LEFT JOIN obras o ON o.id_obra = a.id_obra
      LEFT JOIN unidades u ON u.tenant_id = t.tenant_id AND u.id_unidade = a.id_unidade
      LEFT JOIN contratos c ON c.tenant_id = t.tenant_id AND c.id_contrato = o.id_contrato
      WHERE t.tenant_id = ?
    `;
    const params: any[] = [current.tenantId];

    if (Number.isFinite(idObra) && idObra > 0) {
      sql += ` AND a.tipo_local = 'OBRA' AND a.id_obra = ?`;
      params.push(idObra);
    }

    if (Number.isFinite(idContrato) && idContrato > 0) {
      sql += ` AND c.id_contrato = ?`;
      params.push(idContrato);
    }

    if (q) {
      sql += ` AND (t.nome_completo LIKE ? OR COALESCE(t.cpf,'') LIKE ? OR COALESCE(t.funcao,'') LIKE ? OR COALESCE(ep.razao_social,'') LIKE ?)`;
      params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
    }

    sql += ` ORDER BY t.nome_completo LIMIT ${limit}`;

    const [rows]: any = await db.query(sql, params);
    return ok(rows);
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.RH_FUNCIONARIOS_CRUD);
    const body = (await req.json().catch(() => null)) as any;

    const nomeCompleto = String(body?.nomeCompleto || '').trim();
    const funcao = body?.funcao ? String(body.funcao).trim() : null;
    const ativo = body?.ativo === false ? 0 : 1;
    const idEmpresaParceira = body?.idEmpresaParceira ? Number(body.idEmpresaParceira) : await ensureEmpresaParceiraPadrao(current.tenantId);
    const cpfDigits = String(body?.cpf || '').replace(/\D/g, '');
    const dataNascimento = body?.dataNascimento ? String(body.dataNascimento).slice(0, 10) : '';
    const telefoneWhatsapp = body?.telefoneWhatsapp ? String(body.telefoneWhatsapp).trim() : null;
    const identidade = body?.identidade ? String(body.identidade).trim() : null;
    const titulo = body?.titulo ? String(body.titulo).trim() : null;
    const nomeMae = body?.nomeMae ? String(body.nomeMae).trim() : null;
    const nomePai = body?.nomePai ? String(body.nomePai).trim() : null;
    const idContraparteEmpresa = body?.idContraparteEmpresa ? Number(body.idContraparteEmpresa) : null;

    if (nomeCompleto.length < 3) return fail(422, 'Nome completo é obrigatório');
    if (cpfDigits.length !== 11) return fail(422, 'CPF inválido: deve ter 11 dígitos');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataNascimento)) return fail(422, 'Data de nascimento inválida');
    if (!Number.isFinite(idEmpresaParceira) || idEmpresaParceira <= 0) throw new ApiError(422, 'Empresa parceira inválida');

    const [[empresa]]: any = await db.query(
      `SELECT id_empresa_parceira id FROM terceirizados_empresas_parceiras WHERE tenant_id = ? AND id_empresa_parceira = ? AND ativo = 1 LIMIT 1`,
      [current.tenantId, idEmpresaParceira]
    );
    if (!empresa) throw new ApiError(404, 'Empresa parceira não encontrada');

    const [result]: any = await db.execute(
      `INSERT INTO terceirizados_trabalhadores
       (tenant_id, id_empresa_parceira, nome_completo, cpf, funcao, cbo_codigo, telefone, ativo)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
      [current.tenantId, idEmpresaParceira, nomeCompleto, cpfDigits, funcao, telefoneWhatsapp, ativo]
    );

    try {
      const [colRows]: any = await db.query(
        `SELECT COLUMN_NAME columnName FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'terceirizados_trabalhadores'`
      );
      const cols = new Set<string>((Array.isArray(colRows) ? colRows : []).map((r: any) => String(r.columnName || r.COLUMN_NAME || '')));
      const setParts: string[] = [];
      const setParams: any[] = [];

      if (cols.has('data_nascimento')) {
        setParts.push(`data_nascimento = ?`);
        setParams.push(dataNascimento);
      }
      if (cols.has('identidade')) {
        setParts.push(`identidade = ?`);
        setParams.push(identidade);
      }
      if (cols.has('titulo')) {
        setParts.push(`titulo = ?`);
        setParams.push(titulo);
      }
      if (cols.has('nome_mae')) {
        setParts.push(`nome_mae = ?`);
        setParams.push(nomeMae);
      }
      if (cols.has('nome_pai')) {
        setParts.push(`nome_pai = ?`);
        setParams.push(nomePai);
      }
      if (cols.has('id_empresa')) {
        setParts.push(`id_empresa = ?`);
        setParams.push(idContraparteEmpresa);
      }
      if (cols.has('id_contraparte')) {
        setParts.push(`id_contraparte = ?`);
        setParams.push(idContraparteEmpresa);
      }

      if (setParts.length) {
        await db.execute(
          `UPDATE terceirizados_trabalhadores SET ${setParts.join(', ')} WHERE tenant_id = ? AND id_terceirizado_trabalhador = ?`,
          [...setParams, current.tenantId, Number(result.insertId)]
        );
      }
    } catch {}

    return created({ id: result.insertId }, 'Terceirizado criado com sucesso.');
  } catch (e) {
    return handleApiError(e);
  }
}
