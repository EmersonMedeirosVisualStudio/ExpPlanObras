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
        f.ativo
      FROM funcionarios f
      WHERE f.tenant_id = ?`;
    const params: any[] = [user.tenantId];

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
  const conn = await db.getConnection();
  try {
    const user = await requireApiPermission(PERMISSIONS.RH_FUNCIONARIOS_CRUD);
    const body = await req.json();

    if (!body?.matricula?.trim()) throw new ApiError(422, 'Matrícula obrigatória');
    if (!body?.nomeCompleto?.trim()) throw new ApiError(422, 'Nome obrigatório');
    if (!body?.cpf?.trim()) throw new ApiError(422, 'CPF obrigatório');
    if (!body?.dataAdmissao) throw new ApiError(422, 'Data de admissão obrigatória');

    const matricula = String(body.matricula).trim();
    const nomeCompleto = String(body.nomeCompleto).trim();
    const cpf = String(body.cpf).trim();

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
          body.dataNascimento || null,
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
          body.dataAdmissao,
          body.dataDesligamento || null,
          body.salarioBase || null,
          body.statusFuncional || 'ATIVO',
          body.emailPessoal || null,
          body.telefonePrincipal || null,
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
          body.telefonePrincipal || body.telefone || null,
          body.cargoContratual || body.cargo || null,
          body.funcaoPrincipal || null,
          body.statusFuncional || 'ATIVO',
          body.dataAdmissao,
          body.ativo ? 1 : 0,
        ]
      );
    }

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
    await conn.rollback();
    return handleApiError(error);
  } finally {
    conn.release();
  }
}
