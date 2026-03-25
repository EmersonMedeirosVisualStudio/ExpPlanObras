import { db } from '@/lib/db';
import { ok, fail, handleApiError, ApiError } from '@/lib/api/http';
import { requireApiPermission } from '@/lib/api/authz';
import { PERMISSIONS } from '@/lib/auth/permissions';
import type { SyncBatchRequestDTO, SyncBatchResponseDTO } from '@/lib/offline/types';

export const runtime = 'nodejs';

async function obterProfissionalSstDoUsuario(tenantId: number, idFuncionario: number | null) {
  if (!idFuncionario) return null;
  const [rows]: any = await db.query(
    `
    SELECT id_sst_profissional
    FROM sst_profissionais
    WHERE tenant_id = ? AND id_funcionario = ? AND ativo = 1
    `,
    [tenantId, idFuncionario]
  );
  return rows[0] || null;
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
    const current = await requireApiPermission(PERMISSIONS.SST_CHECKLISTS_EXECUTAR);
    const body = (await req.json().catch(() => null)) as SyncBatchRequestDTO | null;
    if (!body?.itens?.length) return fail(422, 'itens obrigatório');

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

        if (tipoOperacao === 'CRIAR_EXECUCAO') {
          const payload = item.payload || {};
          const idModeloChecklist = Number((payload as any).idModeloChecklist || 0);
          const tipoLocal = String((payload as any).tipoLocal || '').toUpperCase();
          const dataReferencia = String((payload as any).dataReferencia || '').trim();
          const idObra = (payload as any).idObra ? Number((payload as any).idObra) : null;
          const idUnidade = (payload as any).idUnidade ? Number((payload as any).idUnidade) : null;
          const idFuncionarioResponsavelCiencia = (payload as any).idFuncionarioResponsavelCiencia
            ? Number((payload as any).idFuncionarioResponsavelCiencia)
            : null;
          const observacao = (payload as any).observacao ? String((payload as any).observacao) : null;

          if (!idModeloChecklist || !tipoLocal || !dataReferencia) throw new ApiError(422, 'Modelo, local e data são obrigatórios');

          const profissional = await obterProfissionalSstDoUsuario(current.tenantId, current.idFuncionario || null);
          if (!profissional) throw new ApiError(403, 'Usuário não é profissional SST ativo');

          const [aloc]: any = await db.query(
            `
            SELECT id_sst_alocacao
            FROM sst_profissionais_alocacoes
            WHERE id_sst_profissional = ?
              AND atual = 1
              AND (
                (? = 'OBRA' AND tipo_local = 'OBRA' AND id_obra = ?)
                OR
                (? = 'UNIDADE' AND tipo_local = 'UNIDADE' AND id_unidade = ?)
              )
            `,
            [profissional.id_sst_profissional, tipoLocal, idObra || 0, tipoLocal, idUnidade || 0]
          );
          if (!aloc.length) throw new ApiError(403, 'Profissional SST não está alocado neste local');

          const [modeloRows]: any = await db.query(
            `
            SELECT *
            FROM sst_checklists_modelos
            WHERE id_modelo_checklist = ? AND tenant_id = ? AND ativo = 1
            `,
            [idModeloChecklist, current.tenantId]
          );
          if (!modeloRows.length) throw new ApiError(404, 'Modelo não encontrado');
          const modelo = modeloRows[0];
          if (String(modelo.tipo_local_permitido) !== 'AMBOS' && String(modelo.tipo_local_permitido) !== tipoLocal) throw new ApiError(422, 'Modelo não permitido para este tipo de local');

          const abrangeTerceirizados =
            (payload as any).abrangeTerceirizados === null || (payload as any).abrangeTerceirizados === undefined
              ? modelo.abrange_terceirizados
                ? 1
                : 0
              : (payload as any).abrangeTerceirizados
                ? 1
                : 0;

          const [result]: any = await db.query(
            `
            INSERT INTO sst_checklists_execucoes
            (tenant_id, id_modelo_checklist, tipo_local, id_obra, id_unidade,
             data_referencia, status_execucao, id_sst_profissional_executor, id_usuario_executor,
             abrange_terceirizados, id_funcionario_responsavel_ciencia, observacao)
            VALUES (?, ?, ?, ?, ?, ?, 'EM_PREENCHIMENTO', ?, ?, ?, ?, ?)
            `,
            [
              current.tenantId,
              idModeloChecklist,
              tipoLocal,
              idObra,
              idUnidade,
              dataReferencia,
              profissional.id_sst_profissional,
              current.id,
              abrangeTerceirizados,
              idFuncionarioResponsavelCiencia,
              observacao,
            ]
          );

          const entidadeId = Number(result.insertId);
          const resposta = { id: entidadeId };
          await putIdempotency({
            tenantId: current.tenantId,
            userId: current.id,
            operacaoUuid,
            modulo: 'SST',
            entidadeTipo: 'CHECKLIST_EXECUCAO',
            entidadeId,
            status: 'APLICADO',
            resposta,
          });
          resultados.push({ operacaoUuid, status: 'APLICADO', entidadeServidorId: entidadeId, serverSnapshot: resposta });
          continue;
        }

        if (tipoOperacao === 'UPSERT_ITENS') {
          const idExecucao = item.entidadeServidorId ? Number(item.entidadeServidorId) : NaN;
          if (!Number.isFinite(idExecucao)) throw new ApiError(422, 'entidadeServidorId obrigatório');
          const payload = item.payload || {};
          const itens = Array.isArray((payload as any).itens) ? (payload as any).itens : [];
          if (!itens.length) throw new ApiError(422, 'itens obrigatório');

          const conn = await db.getConnection();
          try {
            const [execRows]: any = await conn.query(
              `SELECT * FROM sst_checklists_execucoes WHERE id_execucao_checklist = ? AND tenant_id = ?`,
              [idExecucao, current.tenantId]
            );
            if (!execRows.length) throw new ApiError(404, 'Execução não encontrada');
            if (String(execRows[0].status_execucao) !== 'EM_PREENCHIMENTO') throw new ApiError(422, 'Execução não pode ser alterada');

            await conn.beginTransaction();
            for (const it of itens) {
              const geraNc = it.conformeFlag === 0 && it.geraNcQuandoReprovado ? 1 : 0;
              await conn.query(
                `
                INSERT INTO sst_checklists_execucoes_itens
                (id_execucao_checklist, id_modelo_item, resposta_valor, conforme_flag, observacao, gera_nc)
                VALUES (?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                  resposta_valor = VALUES(resposta_valor),
                  conforme_flag = VALUES(conforme_flag),
                  observacao = VALUES(observacao),
                  gera_nc = VALUES(gera_nc)
                `,
                [idExecucao, it.idModeloItem, it.respostaValor || null, it.conformeFlag ?? null, it.observacao || null, geraNc]
              );
            }
            await conn.commit();
          } catch (e) {
            await conn.rollback();
            throw e;
          } finally {
            conn.release();
          }

          const resposta = { id: idExecucao };
          await putIdempotency({
            tenantId: current.tenantId,
            userId: current.id,
            operacaoUuid,
            modulo: 'SST',
            entidadeTipo: 'CHECKLIST_EXECUCAO',
            entidadeId: idExecucao,
            status: 'APLICADO',
            resposta,
          });
          resultados.push({ operacaoUuid, status: 'APLICADO', entidadeServidorId: idExecucao, serverSnapshot: resposta });
          continue;
        }

        await putIdempotency({
          tenantId: current.tenantId,
          userId: current.id,
          operacaoUuid,
          modulo: 'SST',
          entidadeTipo: 'CHECKLIST_EXECUCAO',
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

