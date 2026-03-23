import { db } from '@/lib/db';
import { audit } from '@/lib/api/audit';
import { ApiError, handleApiError, ok } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiPermission(PERMISSIONS.RH_FUNCIONARIOS_VIEW);
    const { id } = await context.params;
    const idFuncionario = Number(id);
    if (!Number.isFinite(idFuncionario)) throw new ApiError(400, 'ID inválido.');

    const [[f]]: any = await db.query(
      `
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

        f.nome_social nomeSocial,
        f.rg,
        f.orgao_emissor_rg orgaoEmissorRg,
        f.data_nascimento dataNascimento,
        f.sexo,
        f.estado_civil estadoCivil,
        f.pis_pasep pisPasep,
        f.ctps_numero ctpsNumero,
        f.ctps_serie ctpsSerie,
        f.ctps_uf ctpsUf,
        f.cnh_numero cnhNumero,
        f.cnh_categoria cnhCategoria,
        f.cbo_codigo cboCodigo,
        f.tipo_vinculo tipoVinculo,
        f.data_desligamento dataDesligamento,
        f.salario_base salarioBase,
        f.email_pessoal emailPessoal,
        f.telefone_principal telefonePrincipal,
        f.contato_emergencia_nome contatoEmergenciaNome,
        f.contato_emergencia_telefone contatoEmergenciaTelefone
      FROM funcionarios f
      WHERE f.tenant_id = ? AND f.id_funcionario = ?
      LIMIT 1
      `,
      [user.tenantId, idFuncionario]
    );
    if (!f) throw new ApiError(404, 'Funcionário não encontrado.');

    const [lotacoes]: any = await db.query(
      `
      SELECT
        id_lotacao id,
        tipo_lotacao tipoLotacao,
        id_obra idObra,
        id_unidade idUnidade,
        data_inicio dataInicio,
        data_fim dataFim,
        atual,
        observacao
      FROM funcionarios_lotacoes
      WHERE id_funcionario = ?
      ORDER BY atual DESC, data_inicio DESC, id_lotacao DESC
      `,
      [idFuncionario]
    );

    const [supervisoes]: any = await db.query(
      `
      SELECT
        s.id_supervisao id,
        s.id_supervisor_funcionario idSupervisorFuncionario,
        sup.nome_completo supervisorNome,
        s.data_inicio dataInicio,
        s.data_fim dataFim,
        s.atual,
        s.observacao
      FROM funcionarios_supervisao s
      JOIN funcionarios sup ON sup.id_funcionario = s.id_supervisor_funcionario
      WHERE s.id_funcionario = ?
      ORDER BY s.atual DESC, s.data_inicio DESC, s.id_supervisao DESC
      `,
      [idFuncionario]
    );

    const [jornadas]: any = await db.query(
      `
      SELECT
        id_jornada id,
        tipo_jornada tipoJornada,
        horas_semanais horasSemanais,
        hora_entrada horaEntrada,
        hora_saida horaSaida,
        intervalo_minutos intervaloMinutos,
        banco_horas_ativo bancoHorasAtivo,
        data_inicio dataInicio,
        data_fim dataFim,
        atual,
        observacao
      FROM funcionarios_jornadas
      WHERE id_funcionario = ?
      ORDER BY atual DESC, data_inicio DESC, id_jornada DESC
      `,
      [idFuncionario]
    );

    const [horasExtras]: any = await db.query(
      `
      SELECT
        id_hora_extra id,
        id_funcionario idFuncionario,
        data_referencia dataReferencia,
        quantidade_minutos quantidadeMinutos,
        tipo_hora_extra tipoHoraExtra,
        motivo,
        status_he statusHe,
        id_obra idObra,
        id_unidade idUnidade,
        observacao
      FROM funcionarios_horas_extras
      WHERE tenant_id = ? AND id_funcionario = ?
      ORDER BY data_referencia DESC, id_hora_extra DESC
      `,
      [user.tenantId, idFuncionario]
    );

    return ok({ ...f, lotacoes, supervisoes, jornadas, horasExtras });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
  const conn = await db.getConnection();
  try {
    const user = await requireApiPermission(PERMISSIONS.RH_FUNCIONARIOS_CRUD);
    const { id } = await context.params;
    const idFuncionario = Number(id);
    if (!Number.isFinite(idFuncionario)) throw new ApiError(400, 'ID inválido.');

    const body = await req.json();

    const [[before]]: any = await conn.query(`SELECT * FROM funcionarios WHERE tenant_id = ? AND id_funcionario = ? LIMIT 1`, [user.tenantId, idFuncionario]);
    if (!before) throw new ApiError(404, 'Funcionário não encontrado.');

    await conn.beginTransaction();

    try {
      await conn.execute(
        `
        UPDATE funcionarios
        SET
          matricula = ?,
          nome_completo = ?,
          nome_social = ?,
          cpf = ?,
          rg = ?,
          orgao_emissor_rg = ?,
          data_nascimento = ?,
          sexo = ?,
          estado_civil = ?,
          pis_pasep = ?,
          ctps_numero = ?,
          ctps_serie = ?,
          ctps_uf = ?,
          cnh_numero = ?,
          cnh_categoria = ?,
          cbo_codigo = ?,
          cargo_contratual = ?,
          funcao_principal = ?,
          tipo_vinculo = ?,
          data_admissao = ?,
          data_desligamento = ?,
          salario_base = ?,
          status_funcional = ?,
          email_pessoal = ?,
          telefone_principal = ?,
          contato_emergencia_nome = ?,
          contato_emergencia_telefone = ?,
          status_cadastro_rh = 'PENDENTE_ENDOSSO',
          id_usuario_endosso_rh = NULL,
          data_endosso_rh = NULL,
          motivo_rejeicao_endosso = NULL,
          ativo = ?
        WHERE tenant_id = ? AND id_funcionario = ?
        `,
        [
          String(body?.matricula || '').trim(),
          String(body?.nomeCompleto || '').trim(),
          body?.nomeSocial ? String(body.nomeSocial).trim() : null,
          String(body?.cpf || '').trim(),
          body?.rg ? String(body.rg).trim() : null,
          body?.orgaoEmissorRg ? String(body.orgaoEmissorRg).trim() : null,
          body?.dataNascimento ? String(body.dataNascimento) : null,
          body?.sexo ? String(body.sexo) : null,
          body?.estadoCivil ? String(body.estadoCivil) : null,
          body?.pisPasep ? String(body.pisPasep) : null,
          body?.ctpsNumero ? String(body.ctpsNumero) : null,
          body?.ctpsSerie ? String(body.ctpsSerie) : null,
          body?.ctpsUf ? String(body.ctpsUf) : null,
          body?.cnhNumero ? String(body.cnhNumero) : null,
          body?.cnhCategoria ? String(body.cnhCategoria) : null,
          body?.cboCodigo ? String(body.cboCodigo) : null,
          body?.cargoContratual ? String(body.cargoContratual) : null,
          body?.funcaoPrincipal ? String(body.funcaoPrincipal) : null,
          body?.tipoVinculo ? String(body.tipoVinculo) : 'CLT',
          body?.dataAdmissao ? String(body.dataAdmissao) : null,
          body?.dataDesligamento ? String(body.dataDesligamento) : null,
          body?.salarioBase === null || body?.salarioBase === undefined ? null : Number(body.salarioBase),
          body?.statusFuncional ? String(body.statusFuncional) : 'ATIVO',
          body?.emailPessoal ? String(body.emailPessoal) : null,
          body?.telefonePrincipal ? String(body.telefonePrincipal) : null,
          body?.contatoEmergenciaNome ? String(body.contatoEmergenciaNome) : null,
          body?.contatoEmergenciaTelefone ? String(body.contatoEmergenciaTelefone) : null,
          body?.ativo === false ? 0 : 1,
          user.tenantId,
          idFuncionario,
        ]
      );
    } catch {
      await conn.execute(
        `
        UPDATE funcionarios
        SET
          matricula = ?,
          nome_completo = ?,
          cpf = ?,
          email = ?,
          telefone = ?,
          cargo = ?,
          funcao_principal = ?,
          status_funcional = ?,
          data_admissao = ?,
          ativo = ?
        WHERE tenant_id = ? AND id_funcionario = ?
        `,
        [
          String(body?.matricula || '').trim(),
          String(body?.nomeCompleto || '').trim(),
          String(body?.cpf || '').trim(),
          body?.emailPessoal || body?.email || null,
          body?.telefonePrincipal || body?.telefone || null,
          body?.cargoContratual || body?.cargo || null,
          body?.funcaoPrincipal || null,
          body?.statusFuncional || 'ATIVO',
          body?.dataAdmissao || null,
          body?.ativo === false ? 0 : 1,
          user.tenantId,
          idFuncionario,
        ]
      );
    }

    await audit({
      tenantId: user.tenantId,
      userId: user.id,
      entidade: 'funcionarios',
      idRegistro: String(idFuncionario),
      acao: 'UPDATE',
      dadosAnteriores: before,
      dadosNovos: body,
    });

    await conn.commit();
    const { searchParams } = new URL(req.url);
    searchParams.set('_', String(Date.now()));
    return GET(new Request(`${req.url.split('?')[0]}?${searchParams.toString()}`, { method: 'GET' }), { params: Promise.resolve({ id: String(idFuncionario) }) });
  } catch (error) {
    await conn.rollback();
    return handleApiError(error);
  } finally {
    conn.release();
  }
}
