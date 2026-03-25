import { db } from '@/lib/db';
import { ok, fail, handleApiError, ApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import type { SyncBatchRequestDTO, SyncBatchResponseDTO } from '@/lib/offline/types';

export const runtime = 'nodejs';

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

