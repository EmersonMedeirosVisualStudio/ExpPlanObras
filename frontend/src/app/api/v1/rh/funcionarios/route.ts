import { db } from '@/lib/db';
import { audit } from '@/lib/api/audit';
import { ApiError, created, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const user = await requireApiPermission(PERMISSIONS.RH_FUNCIONARIOS_VIEW);
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();
    const idObra = Number(searchParams.get('idObra') || 0);
    const idContrato = Number(searchParams.get('idContrato') || 0);
    const limitParam = searchParams.get('limit');
    const requested = limitParam ? Number(limitParam) : NaN;
    const limit = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 1000) : q ? 500 : 200;

    let sql = `
      SELECT
        f.id_funcionario id,
        f.matricula,
        f.nome_completo nomeCompleto,
        f.cpf,
        f.cargo_contratual cargoContratual,
        f.funcao_principal funcaoPrincipal,
        f.status_funcional statusFuncional,
        f.status_cadastro_rh statusCadastroRh,
        f.data_admissao dataAdmissao,
        f.ativo,
        CASE
          WHEN fl.tipo_lotacao = 'OBRA' THEN 'OBRA'
          WHEN fl.tipo_lotacao = 'UNIDADE' THEN 'UNIDADE'
          ELSE NULL
        END AS tipoLocal,
        fl.id_obra AS idObra,
        fl.id_unidade AS idUnidade,
        CASE
          WHEN fl.tipo_lotacao = 'OBRA' THEN COALESCE(NULLIF(o.nome_obra, ''), CONCAT('Obra #', o.id_obra))
          WHEN fl.tipo_lotacao = 'UNIDADE' THEN u.nome
          ELSE NULL
        END AS localNome,
        c.id_contrato AS contratoId,
        c.numero_contrato AS contratoNumero
      FROM funcionarios f
      LEFT JOIN funcionarios_lotacoes fl
        ON fl.tenant_id = f.tenant_id
       AND fl.id_funcionario = f.id_funcionario
       AND fl.atual = 1
      LEFT JOIN obras o ON o.id_obra = fl.id_obra
      LEFT JOIN unidades u ON u.tenant_id = f.tenant_id AND u.id_unidade = fl.id_unidade
      LEFT JOIN contratos c ON c.tenant_id = f.tenant_id AND c.id_contrato = o.id_contrato
      WHERE f.tenant_id = ?`;
    const params: any[] = [user.tenantId];

    if (Number.isFinite(idObra) && idObra > 0) {
      sql += ` AND fl.tipo_lotacao = 'OBRA' AND fl.id_obra = ?`;
      params.push(idObra);
    }

    if (Number.isFinite(idContrato) && idContrato > 0) {
      sql += ` AND c.id_contrato = ?`;
      params.push(idContrato);
    }

    if (q) {
      sql += ` AND (f.nome_completo LIKE ? OR f.matricula LIKE ? OR f.cpf LIKE ?)`;
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    sql += ` ORDER BY f.nome_completo LIMIT ${limit}`;

    const [rows]: any = await db.query(sql, params);
    return ok(rows);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: Request) {
  let conn: any = null;
  try {
    const user = await requireApiPermission(PERMISSIONS.RH_FUNCIONARIOS_CRUD);
    conn = await db.getConnection();
    const body = await req.json();

    if (!body?.nomeCompleto?.trim()) throw new ApiError(422, 'Nome obrigatório');
    if (!body?.cpf?.trim()) throw new ApiError(422, 'CPF obrigatório');
    if (!body?.dataNascimento) throw new ApiError(422, 'Data de nascimento obrigatória');

    const nomeCompleto = String(body.nomeCompleto).trim();
    const cpfDigits = String(body.cpf).replace(/\D/g, '');
    if (cpfDigits.length !== 11) throw new ApiError(422, 'CPF inválido: deve ter 11 dígitos');
    const cpf = cpfDigits;

    const hoje = new Date().toISOString().slice(0, 10);
    const dataAdmissao = body?.dataAdmissao ? String(body.dataAdmissao).slice(0, 10) : hoje;
    const dataNascimento = String(body.dataNascimento).slice(0, 10);

    const matricula = body?.matricula ? String(body.matricula).trim() : '';
    if (!matricula) throw new ApiError(422, 'Matrícula obrigatória');

    const rg = body?.rg ? String(body.rg).trim() : '';

    let cols: Set<string> | null = null;
    try {
      const [colRows]: any = await conn.query(
        `SELECT COLUMN_NAME columnName FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'funcionarios'`
      );
      cols = new Set<string>((Array.isArray(colRows) ? colRows : []).map((r: any) => String(r.columnName || r.COLUMN_NAME || '')));
    } catch {
      cols = null;
    }

    try {
      const [[m]]: any = await conn.query(`SELECT 1 ok FROM funcionarios WHERE tenant_id = ? AND matricula = ? LIMIT 1`, [user.tenantId, matricula]);
      if (m) throw new ApiError(409, 'Matrícula já cadastrada para este tenant');
    } catch (e) {
      if (e instanceof ApiError) throw e;
    }

    try {
      const [[c]]: any = await conn.query(`SELECT 1 ok FROM funcionarios WHERE tenant_id = ? AND cpf = ? LIMIT 1`, [user.tenantId, cpf]);
      if (c) throw new ApiError(409, 'CPF já cadastrado para este tenant');
    } catch (e) {
      if (e instanceof ApiError) throw e;
    }

    if (rg && (cols == null || cols.has('rg'))) {
      try {
        const [[r]]: any = await conn.query(`SELECT 1 ok FROM funcionarios WHERE tenant_id = ? AND rg = ? LIMIT 1`, [user.tenantId, rg]);
        if (r) throw new ApiError(409, 'Identidade (RG) já cadastrada para este tenant');
      } catch (e) {
        if (e instanceof ApiError) throw e;
      }
    }

    await conn.beginTransaction();

    let result: any;
    try {
      [result] = await conn.execute(
        `
        INSERT INTO funcionarios (
          tenant_id, matricula, nome_completo, nome_social, cpf, rg, orgao_emissor_rg,
          data_nascimento, sexo, estado_civil, pis_pasep, ctps_numero, ctps_serie,
          ctps_uf, cnh_numero, cnh_categoria, cbo_codigo, cargo_contratual,
          funcao_principal, tipo_vinculo, data_admissao, data_desligamento, salario_base,
          status_funcional, email_pessoal, telefone_principal, contato_emergencia_nome,
          contato_emergencia_telefone, status_cadastro_rh, ativo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDENTE_ENDOSSO', ?)
        `,
        [
          user.tenantId,
          matricula,
          nomeCompleto,
          body.nomeSocial || null,
          cpf,
          body.rg || null,
          body.orgaoEmissorRg || null,
          dataNascimento,
          body.sexo || null,
          body.estadoCivil || null,
          body.pisPasep || null,
          body.ctpsNumero || null,
          body.ctpsSerie || null,
          body.ctpsUf || null,
          body.cnhNumero || null,
          body.cnhCategoria || null,
          body.cboCodigo || null,
          body.cargoContratual || null,
          body.funcaoPrincipal || null,
          body.tipoVinculo || 'CLT',
          dataAdmissao,
          body.dataDesligamento || null,
          body.salarioBase || null,
          body.statusFuncional || 'ATIVO',
          body.emailPessoal || null,
          body.telefonePrincipal || body.telefoneWhatsapp || null,
          body.contatoEmergenciaNome || null,
          body.contatoEmergenciaTelefone || null,
          body.ativo ? 1 : 0,
        ]
      );
    } catch {
      [result] = await conn.execute(
        `
        INSERT INTO funcionarios
          (tenant_id, matricula, nome_completo, cpf, email, telefone, cargo, funcao_principal, status_funcional, data_admissao, ativo)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          user.tenantId,
          matricula,
          nomeCompleto,
          cpf,
          body.emailPessoal || body.email || null,
          body.telefonePrincipal || body.telefoneWhatsapp || body.telefone || null,
          body.cargoContratual || body.cargo || null,
          body.funcaoPrincipal || null,
          body.statusFuncional || 'ATIVO',
          dataAdmissao,
          body.ativo ? 1 : 0,
        ]
      );
    }

    try {
      let colsResolved = cols;
      if (!colsResolved) {
        const [colRows]: any = await conn.query(
          `SELECT COLUMN_NAME columnName FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'funcionarios'`
        );
        colsResolved = new Set<string>((Array.isArray(colRows) ? colRows : []).map((r: any) => String(r.columnName || r.COLUMN_NAME || '')));
      }
      const setParts: string[] = [];
      const setParams: any[] = [];

      const titulo = body?.titulo ? String(body.titulo).trim() : null;
      const nomeMae = body?.nomeMae ? String(body.nomeMae).trim() : null;
      const nomePai = body?.nomePai ? String(body.nomePai).trim() : null;
      const telefoneWhatsapp = body?.telefoneWhatsapp ? String(body.telefoneWhatsapp).trim() : null;
      const idEmpresa = body?.idEmpresa != null && body?.idEmpresa !== '' ? Number(body.idEmpresa) : null;

      if (colsResolved.has('titulo')) {
        setParts.push(`titulo = ?`);
        setParams.push(titulo);
      }
      if (colsResolved.has('nome_mae')) {
        setParts.push(`nome_mae = ?`);
        setParams.push(nomeMae);
      }
      if (colsResolved.has('nome_pai')) {
        setParts.push(`nome_pai = ?`);
        setParams.push(nomePai);
      }
      if (colsResolved.has('telefone_whatsapp')) {
        setParts.push(`telefone_whatsapp = ?`);
        setParams.push(telefoneWhatsapp);
      }
      if (colsResolved.has('id_empresa')) {
        setParts.push(`id_empresa = ?`);
        setParams.push(Number.isFinite(idEmpresa as any) ? idEmpresa : null);
      }
      if (!colsResolved.has('id_empresa') && colsResolved.has('id_contraparte')) {
        setParts.push(`id_contraparte = ?`);
        setParams.push(Number.isFinite(idEmpresa as any) ? idEmpresa : null);
      }

      if (setParts.length) {
        await conn.execute(
          `UPDATE funcionarios SET ${setParts.join(', ')} WHERE tenant_id = ? AND id_funcionario = ?`,
          [...setParams, user.tenantId, Number(result.insertId)]
        );
      }
    } catch {}

    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      entidade: 'funcionarios',
      idRegistro: String(result.insertId),
      acao: 'CREATE',
      dadosNovos: body,
    });

    const [[row]]: any = await conn.query(
      `
      SELECT
        id_funcionario AS id,
        matricula,
        nome_completo AS nomeCompleto,
        cpf,
        cargo_contratual AS cargoContratual,
        funcao_principal AS funcaoPrincipal,
        status_funcional AS statusFuncional,
        status_cadastro_rh AS statusCadastroRh,
        data_admissao AS dataAdmissao,
        ativo
      FROM funcionarios
      WHERE id_funcionario = ? AND tenant_id = ?
      `,
      [result.insertId, user.tenantId]
    );

    await conn.commit();
    return created(row);
  } catch (error) {
    try {
      if (conn) await conn.rollback();
    } catch {}
    return handleApiError(error);
  } finally {
    try {
      if (conn) conn.release();
    } catch {}
  }
}
