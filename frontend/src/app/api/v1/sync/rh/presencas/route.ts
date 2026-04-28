import { db } from '@/lib/db';
import { ok, fail, handleApiError, ApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import type { SyncBatchRequestDTO, SyncBatchResponseDTO } from '@/lib/offline/types';

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
      [args.tenantId, args.tenantId, cargo, cargo, funcao, funcao, cbo, cbo, args.tenantId, args.idFuncionario, args.dataReferencia]
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

async function getCurrentFuncionarioId(tenantId: number, userId: number) {
  const [[row]]: any = await db.query(`SELECT id_funcionario idFuncionario FROM usuarios WHERE tenant_id = ? AND id_usuario = ? LIMIT 1`, [
    tenantId,
    userId,
  ]);
  return row?.idFuncionario ? Number(row.idFuncionario) : null;
}

async function getIdempotency(tenantId: number, userId: number, operacaoUuid: string) {
  const [[row]]: any = await db.query(
    `
    SELECT status_resultado AS status, resposta_json AS respostaJson, entidade_id AS entidadeId
    FROM sync_operacoes_idempotencia
    WHERE tenant_id = ? AND id_usuario = ? AND operacao_uuid = ?
    LIMIT 1
    `,
    [tenantId, userId, operacaoUuid]
  );
  if (!row) return null;
  const resp = row.respostaJson ? (typeof row.respostaJson === 'string' ? JSON.parse(row.respostaJson) : row.respostaJson) : null;
  return { status: String(row.status), resposta: resp, entidadeId: row.entidadeId !== null ? Number(row.entidadeId) : null };
}

async function putIdempotency(args: {
  tenantId: number;
  userId: number;
  operacaoUuid: string;
  modulo: string;
  entidadeTipo: string;
  entidadeId: number | null;
  status: 'APLICADO' | 'DUPLICADO' | 'CONFLITO' | 'REJEITADO';
  resposta: any;
}) {
  await db.execute(
    `
    INSERT INTO sync_operacoes_idempotencia
      (tenant_id, id_usuario, operacao_uuid, modulo, entidade_tipo, entidade_id, status_resultado, resposta_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      status_resultado = VALUES(status_resultado),
      resposta_json = VALUES(resposta_json),
      entidade_id = VALUES(entidade_id),
      atualizado_em = CURRENT_TIMESTAMP
    `,
    [
      args.tenantId,
      args.userId,
      args.operacaoUuid,
      args.modulo,
      args.entidadeTipo,
      args.entidadeId,
      args.status,
      args.resposta ? JSON.stringify(args.resposta) : null,
    ]
  );
}

export async function POST(req: Request) {
  try {
    const current = await requireApiPermission(PERMISSIONS.RH_PRESENCAS_CRUD);
    const body = (await req.json().catch(() => null)) as SyncBatchRequestDTO | null;
    if (!body?.itens?.length) return fail(422, 'itens obrigatório');

    const idFuncionario = await getCurrentFuncionarioId(current.tenantId, current.id);
    if (!idFuncionario) throw new ApiError(403, 'Usuário sem vínculo com funcionário');
    await ensureAuthorizedForPresencas({ tenantId: current.tenantId, userId: current.id });
    const policy = await getPresencasPolicy(current.tenantId);

    const resultados: SyncBatchResponseDTO['resultados'] = [];

    for (const item of body.itens) {
      const operacaoUuid = String(item.operacaoUuid || '').trim();
      const tipoOperacao = String(item.tipoOperacao || '').trim().toUpperCase();
      if (!operacaoUuid || !tipoOperacao) continue;

      try {
        const prev = await getIdempotency(current.tenantId, current.id, operacaoUuid);
        if (prev) {
          resultados.push({
            operacaoUuid,
            status: 'DUPLICADO',
            entidadeServidorId: prev.entidadeId ?? undefined,
            message: 'Operação já processada',
            serverSnapshot: prev.resposta ?? undefined,
          });
          continue;
        }

        if (tipoOperacao === 'CRIAR_FICHA') {
          const payload = item.payload || {};
          const tipoLocal = String((payload as any)?.tipoLocal || '').toUpperCase();
          const dataReferencia = String((payload as any)?.dataReferencia || '').trim();
          const idObra = (payload as any)?.idObra ? Number((payload as any).idObra) : null;
          const idUnidade = (payload as any)?.idUnidade ? Number((payload as any).idUnidade) : null;
          const turno = (payload as any)?.turno ? String((payload as any).turno) : 'NORMAL';
          const observacao = (payload as any)?.observacao ? String((payload as any).observacao) : null;

          if (!tipoLocal || !dataReferencia) throw new ApiError(422, 'Tipo do local e data são obrigatórios');
          if (tipoLocal === 'OBRA' && !idObra) throw new ApiError(422, 'Informe a obra');
          if (tipoLocal === 'UNIDADE' && !idUnidade) throw new ApiError(422, 'Informe a unidade');

          const [result]: any = await db.query(
            `
            INSERT INTO presencas_cabecalho
              (tenant_id, tipo_local, id_obra, id_unidade, data_referencia, turno, status_presenca, id_supervisor_lancamento, observacao)
            VALUES
              (?, ?, ?, ?, ?, ?, 'EM_PREENCHIMENTO', ?, ?)
            `,
            [current.tenantId, tipoLocal, idObra, idUnidade, dataReferencia, turno, idFuncionario, observacao]
          );
          const entidadeId = Number(result.insertId);
          const resposta = { id: entidadeId };
          await putIdempotency({
            tenantId: current.tenantId,
            userId: current.id,
            operacaoUuid,
            modulo: 'RH',
            entidadeTipo: 'PRESENCA',
            entidadeId,
            status: 'APLICADO',
            resposta,
          });
          resultados.push({ operacaoUuid, status: 'APLICADO', entidadeServidorId: entidadeId, serverSnapshot: resposta });
          continue;
        }

        if (tipoOperacao === 'UPSERT_ITEM') {
          const idPresenca = item.entidadeServidorId ? Number(item.entidadeServidorId) : NaN;
          if (!Number.isFinite(idPresenca)) throw new ApiError(422, 'entidadeServidorId obrigatório');
          const payload = item.payload || {};
          if (!(payload as any).idFuncionario || !(payload as any).situacaoPresenca) throw new ApiError(422, 'Funcionário e situação são obrigatórios');

          const [headRows]: any = await db.query(`SELECT * FROM presencas_cabecalho WHERE id_presenca = ? AND tenant_id = ?`, [
            idPresenca,
            current.tenantId,
          ]);
          if (!headRows.length) throw new ApiError(404, 'Ficha não encontrada');
          const head = headRows[0];
          if (!['EM_PREENCHIMENTO', 'REJEITADA_RH'].includes(String(head.status_presenca))) throw new ApiError(422, 'Ficha não pode mais ser alterada');
          if (Number(head.id_supervisor_lancamento) !== Number(idFuncionario)) throw new ApiError(403, 'Somente o supervisor responsável pode lançar esta ficha');

          const idFuncionarioAlvo = Number((payload as any).idFuncionario);

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
            [current.tenantId, idFuncionarioAlvo]
          );
          if (!func) throw new ApiError(404, 'Funcionário não encontrado');
          if (!Boolean(func.ativo) || String(func.statusFuncional || '').toUpperCase() !== 'ATIVO') throw new ApiError(422, 'Funcionário inativo');

          const [teamRows]: any = await db.query(
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
            LIMIT 1
            `,
            [
              idFuncionarioAlvo,
              current.tenantId,
              idFuncionario,
              head.tipo_local,
              head.id_obra || 0,
              head.tipo_local,
              head.id_unidade || 0,
              head.data_referencia,
              head.data_referencia,
            ]
          );
          if (!teamRows.length) throw new ApiError(422, 'Funcionário não pertence à equipe/local do supervisor');

          if (policy.bloquearPorTreinamentoVencido) {
            await validateTreinamentosObrigatorios({
              tenantId: current.tenantId,
              idFuncionario: idFuncionarioAlvo,
              dataReferencia: String(head.data_referencia),
              cargo: func.cargoContratual || null,
              funcao: func.funcaoPrincipal || null,
              cbo: func.cboCodigo || null,
            });
          }

          const [valRows]: any = await db.query(
            `
            SELECT id_presenca_item
            FROM presencas_itens
            WHERE id_presenca = ? AND id_funcionario = ?
            LIMIT 1
            `,
            [idPresenca, idFuncionarioAlvo]
          );

          const data = {
            situacaoPresenca: String((payload as any).situacaoPresenca),
            horaEntrada: (payload as any).horaEntrada || null,
            horaSaida: (payload as any).horaSaida || null,
            minutosAtraso: (payload as any).minutosAtraso || 0,
            minutosHoraExtra: (payload as any).minutosHoraExtra || 0,
            idTarefaPlanejamento: (payload as any).idTarefaPlanejamento || null,
            idSubitemOrcamentario: (payload as any).idSubitemOrcamentario || null,
            descricaoTarefaDia: (payload as any).descricaoTarefaDia || null,
            requerAssinaturaFuncionario: (payload as any).requerAssinaturaFuncionario ? 1 : 0,
            motivoSemAssinatura: (payload as any).motivoSemAssinatura || null,
            observacao: (payload as any).observacao || null,
          };

          if (valRows.length) {
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
                data.situacaoPresenca,
                data.horaEntrada,
                data.horaSaida,
                data.minutosAtraso,
                data.minutosHoraExtra,
                data.idTarefaPlanejamento,
                data.idSubitemOrcamentario,
                data.descricaoTarefaDia,
                data.requerAssinaturaFuncionario,
                data.motivoSemAssinatura,
                data.observacao,
                Number(valRows[0].id_presenca_item),
              ]
            );
            const resposta = { idPresenca, idFuncionario: idFuncionarioAlvo };
            await putIdempotency({
              tenantId: current.tenantId,
              userId: current.id,
              operacaoUuid,
              modulo: 'RH',
              entidadeTipo: 'PRESENCA',
              entidadeId: idPresenca,
              status: 'APLICADO',
              resposta,
            });
            resultados.push({ operacaoUuid, status: 'APLICADO', entidadeServidorId: idPresenca, serverSnapshot: resposta });
            continue;
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
              idFuncionarioAlvo,
              data.situacaoPresenca,
              data.horaEntrada,
              data.horaSaida,
              data.minutosAtraso,
              data.minutosHoraExtra,
              data.idTarefaPlanejamento,
              data.idSubitemOrcamentario,
              data.descricaoTarefaDia,
              data.requerAssinaturaFuncionario,
              data.motivoSemAssinatura,
              data.observacao,
            ]
          );

          const resposta = { idPresenca, idPresencaItem: Number(result.insertId) };
          await putIdempotency({
            tenantId: current.tenantId,
            userId: current.id,
            operacaoUuid,
            modulo: 'RH',
            entidadeTipo: 'PRESENCA',
            entidadeId: idPresenca,
            status: 'APLICADO',
            resposta,
          });
          resultados.push({ operacaoUuid, status: 'APLICADO', entidadeServidorId: idPresenca, serverSnapshot: resposta });
          continue;
        }

        await putIdempotency({
          tenantId: current.tenantId,
          userId: current.id,
          operacaoUuid,
          modulo: 'RH',
          entidadeTipo: 'PRESENCA',
          entidadeId: item.entidadeServidorId ? Number(item.entidadeServidorId) : null,
          status: 'REJEITADO',
          resposta: { message: 'tipoOperacao não suportada' },
        });
        resultados.push({ operacaoUuid, status: 'REJEITADO', message: 'tipoOperacao não suportada' });
      } catch (err: any) {
        resultados.push({ operacaoUuid, status: 'REJEITADO', message: String(err?.message || 'Erro') });
      }
    }

    return ok({ resultados } satisfies SyncBatchResponseDTO);
  } catch (e) {
    return handleApiError(e);
  }
}

