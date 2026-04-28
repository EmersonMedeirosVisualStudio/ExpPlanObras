import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { ok, fail, handleApiError, ApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';

export const runtime = 'nodejs';

async function ensurePolicyTables() {
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS tenant_configuracoes (
      id_config BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      chave VARCHAR(120) NOT NULL,
      valor_json JSON NULL,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      id_usuario_atualizador BIGINT UNSIGNED NULL,
      PRIMARY KEY (id_config),
      UNIQUE KEY uk_tenant_chave (tenant_id, chave),
      KEY idx_tenant (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
  await db.query(
    `
    CREATE TABLE IF NOT EXISTS rh_presencas_autorizacoes (
      id_autorizacao BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      tenant_id BIGINT UNSIGNED NOT NULL,
      id_usuario BIGINT UNSIGNED NOT NULL,
      termo_versao VARCHAR(40) NOT NULL,
      aceito_em DATETIME NOT NULL,
      ip_registro VARCHAR(80) NULL,
      user_agent VARCHAR(255) NULL,
      device_uuid VARCHAR(80) NULL,
      plataforma VARCHAR(20) NULL,
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id_autorizacao),
      UNIQUE KEY uk_tenant_user (tenant_id, id_usuario),
      KEY idx_tenant (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `
  );
}

async function getPresencasPolicy(tenantId: number) {
  await ensurePolicyTables();
  const [[row]]: any = await db.query(`SELECT valor_json AS valorJson FROM tenant_configuracoes WHERE tenant_id = ? AND chave = ? LIMIT 1`, [
    tenantId,
    'rh.presencas.politica',
  ]);
  const cfg = row?.valorJson ? (typeof row.valorJson === 'string' ? JSON.parse(row.valorJson) : row.valorJson) : {};
  return {
    exigirAutorizacaoDispositivo: cfg?.exigirAutorizacaoDispositivo === undefined ? true : !!cfg.exigirAutorizacaoDispositivo,
    bloquearPorTreinamentoVencido: cfg?.bloquearPorTreinamentoVencido === undefined ? true : !!cfg.bloquearPorTreinamentoVencido,
  };
}

async function ensureAuthorizedForPresencas(args: { tenantId: number; userId: number }) {
  const policy = await getPresencasPolicy(args.tenantId);
  if (!policy.exigirAutorizacaoDispositivo) return true;
  const [[row]]: any = await db.query(
    `
    SELECT 1 AS ok
    FROM rh_presencas_autorizacoes
    WHERE tenant_id = ? AND id_usuario = ? AND ativo = 1
    LIMIT 1
    `,
    [args.tenantId, args.userId]
  );
  if (!row?.ok) throw new ApiError(403, 'Dispositivo não autorizado para registro de presença. Abra o termo e aceite.');
  return true;
}

function assertTreinamentosSqlReady(err: unknown): never {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err || '').toLowerCase();
  if (msg.includes("doesn't exist") || msg.includes('unknown') || msg.includes('sst_treinamentos_')) {
    throw new ApiError(501, 'Banco sem tabelas de treinamentos SST. Aplique o SQL da etapa de SST para habilitar o bloqueio por treinamento.');
  }
  throw err as any;
}

async function validateTreinamentosObrigatorios(args: {
  tenantId: number;
  idFuncionario: number;
  dataReferencia: string;
  cargo: string | null;
  funcao: string | null;
  cbo: string | null;
}) {
  const cargo = args.cargo ? String(args.cargo).trim() : '';
  const funcao = args.funcao ? String(args.funcao).trim() : '';
  const cbo = args.cbo ? String(args.cbo).trim() : '';
  if (!cargo && !funcao && !cbo) return;

  try {
    const [missing]: any = await db.query(
      `
      SELECT
        m.codigo AS codigo,
        m.nome_treinamento AS nomeTreinamento
      FROM sst_treinamentos_modelos m
      INNER JOIN sst_treinamentos_requisitos r
        ON r.id_treinamento_modelo = m.id_treinamento_modelo
       AND r.tenant_id = ?
       AND r.ativo = 1
       AND r.obrigatorio = 1
      WHERE m.tenant_id = ?
        AND m.ativo = 1
        AND (
          (? <> '' AND r.tipo_regra = 'CARGO' AND r.valor_regra = ?)
          OR
          (? <> '' AND r.tipo_regra = 'FUNCAO' AND r.valor_regra = ?)
          OR
          (? <> '' AND r.tipo_regra = 'CBO' AND r.valor_regra = ?)
        )
        AND NOT EXISTS (
          SELECT 1
          FROM sst_treinamentos_participantes p
          INNER JOIN sst_treinamentos_turmas t ON t.id_treinamento_turma = p.id_treinamento_turma
          WHERE t.tenant_id = ?
            AND t.id_treinamento_modelo = m.id_treinamento_modelo
            AND p.tipo_participante = 'FUNCIONARIO'
            AND p.id_funcionario = ?
            AND (
              (m.exige_aprovacao = 1 AND p.status_participacao = 'APROVADO')
              OR
              (m.exige_aprovacao = 0 AND p.status_participacao IN ('PRESENTE','APROVADO'))
            )
            AND (p.validade_ate IS NULL OR p.validade_ate >= DATE(?))
          LIMIT 1
        )
      ORDER BY COALESCE(m.codigo, m.nome_treinamento)
      LIMIT 5
      `,
      [
        args.tenantId,
        args.tenantId,
        cargo,
        cargo,
        funcao,
        funcao,
        cbo,
        cbo,
        args.tenantId,
        args.idFuncionario,
        args.dataReferencia,
      ]
    );

    if (Array.isArray(missing) && missing.length) {
      const first = missing[0];
      const label = first?.codigo ? String(first.codigo) : String(first?.nomeTreinamento || 'Treinamento obrigatório');
      throw new ApiError(422, `Treinamento obrigatório ausente ou vencido: ${label}`);
    }
  } catch (e) {
    return assertTreinamentosSqlReady(e);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const current = await requireApiPermission(PERMISSIONS.RH_PRESENCAS_CRUD);
    const body = await req.json();
    const { id } = await params;
    const idPresenca = Number(id);

    if (!current.idFuncionario) return fail(403, 'Usuário sem vínculo com funcionário');
    await ensureAuthorizedForPresencas({ tenantId: current.tenantId, userId: current.id });
    if (!body.idFuncionario || !body.situacaoPresenca) return fail(422, 'Funcionário e situação são obrigatórios');

    const [headRows]: any = await db.query(`SELECT * FROM presencas_cabecalho WHERE id_presenca = ? AND tenant_id = ?`, [
      idPresenca,
      current.tenantId,
    ]);
    if (!headRows.length) return fail(404, 'Ficha não encontrada');

    const head = headRows[0];
    if (!['EM_PREENCHIMENTO', 'REJEITADA_RH'].includes(head.status_presenca)) {
      return fail(422, 'Ficha não pode mais ser alterada');
    }
    if (Number(head.id_supervisor_lancamento) !== Number(current.idFuncionario)) {
      return fail(403, 'Somente o supervisor responsável pode lançar esta ficha');
    }

    const policy = await getPresencasPolicy(current.tenantId);

    const [[func]]: any = await db.query(
      `
      SELECT
        id_funcionario AS id,
        ativo,
        status_funcional AS statusFuncional,
        cargo_contratual AS cargoContratual,
        funcao_principal AS funcaoPrincipal,
        cbo_codigo AS cboCodigo
      FROM funcionarios
      WHERE tenant_id = ? AND id_funcionario = ?
      LIMIT 1
      `,
      [current.tenantId, body.idFuncionario]
    );
    if (!func) return fail(404, 'Funcionário não encontrado');
    if (!Boolean(func.ativo) || String(func.statusFuncional || '').toUpperCase() !== 'ATIVO') return fail(422, 'Funcionário inativo');

    const [valRows]: any = await db.query(
      `
      SELECT f.id_funcionario
      FROM funcionarios f
      INNER JOIN funcionarios_supervisao fs ON fs.id_funcionario = f.id_funcionario AND fs.atual = 1
      INNER JOIN funcionarios_lotacoes fl ON fl.id_funcionario = f.id_funcionario AND fl.atual = 1
      WHERE f.id_funcionario = ?
        AND f.tenant_id = ?
        AND f.ativo = 1
        AND f.status_funcional = 'ATIVO'
        AND fs.id_supervisor_funcionario = ?
        AND (
          ( ? = 'OBRA' AND fl.tipo_lotacao = 'OBRA' AND fl.id_obra = ? )
          OR
          ( ? = 'UNIDADE' AND fl.tipo_lotacao = 'UNIDADE' AND fl.id_unidade = ? )
        )
        AND DATE(?) >= DATE(fl.data_inicio)
        AND (fl.data_fim IS NULL OR DATE(?) <= DATE(fl.data_fim))
      `,
      [
        body.idFuncionario,
        current.tenantId,
        current.idFuncionario,
        head.tipo_local,
        head.id_obra || 0,
        head.tipo_local,
        head.id_unidade || 0,
        head.data_referencia,
        head.data_referencia,
      ]
    );
    if (!valRows.length) return fail(422, 'Funcionário não pertence à equipe/local do supervisor');

    if (policy.bloquearPorTreinamentoVencido) {
      await validateTreinamentosObrigatorios({
        tenantId: current.tenantId,
        idFuncionario: Number(body.idFuncionario),
        dataReferencia: String(head.data_referencia),
        cargo: func.cargoContratual || null,
        funcao: func.funcaoPrincipal || null,
        cbo: func.cboCodigo || null,
      });
    }

    const [exists]: any = await db.query(`SELECT id_presenca_item FROM presencas_itens WHERE id_presenca = ? AND id_funcionario = ?`, [
      idPresenca,
      body.idFuncionario,
    ]);

    if (exists.length) {
      await db.query(
        `
        UPDATE presencas_itens
        SET situacao_presenca = ?, hora_entrada = ?, hora_saida = ?, minutos_atraso = ?, minutos_hora_extra = ?,
            id_tarefa_planejamento = ?, id_subitem_orcamentario = ?, descricao_tarefa_dia = ?,
            requer_assinatura_funcionario = ?, motivo_sem_assinatura = ?, observacao = ?,
            assinado_funcionario = CASE WHEN assinado_funcionario = 1 THEN 1 ELSE 0 END
        WHERE id_presenca_item = ?
        `,
        [
          body.situacaoPresenca,
          body.horaEntrada || null,
          body.horaSaida || null,
          body.minutosAtraso || 0,
          body.minutosHoraExtra || 0,
          body.idTarefaPlanejamento || null,
          body.idSubitemOrcamentario || null,
          body.descricaoTarefaDia || null,
          body.requerAssinaturaFuncionario ? 1 : 0,
          body.motivoSemAssinatura || null,
          body.observacao || null,
          exists[0].id_presenca_item,
        ]
      );
      return ok({ id: exists[0].id_presenca_item });
    }

    const [result]: any = await db.query(
      `
      INSERT INTO presencas_itens
      (id_presenca, id_funcionario, situacao_presenca, hora_entrada, hora_saida, minutos_atraso, minutos_hora_extra,
       id_tarefa_planejamento, id_subitem_orcamentario, descricao_tarefa_dia,
       requer_assinatura_funcionario, motivo_sem_assinatura, observacao)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        idPresenca,
        body.idFuncionario,
        body.situacaoPresenca,
        body.horaEntrada || null,
        body.horaSaida || null,
        body.minutosAtraso || 0,
        body.minutosHoraExtra || 0,
        body.idTarefaPlanejamento || null,
        body.idSubitemOrcamentario || null,
        body.descricaoTarefaDia || null,
        body.requerAssinaturaFuncionario ? 1 : 0,
        body.motivoSemAssinatura || null,
        body.observacao || null,
      ]
    );

    return ok({ id: result.insertId });
  } catch (e) {
    return handleApiError(e);
  }
}
