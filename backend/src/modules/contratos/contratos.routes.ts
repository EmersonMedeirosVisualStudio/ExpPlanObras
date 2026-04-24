import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../utils/authenticate.js';
import { createContratoSchema, updateContratoSchema } from './contratos.schema.js';
import { subscribe } from './contratos.realtime.js';
import {
  createContrato,
  createContratoAditivo,
  createContratoServico,
  createCronogramaDependencia,
  cancelarContratoAditivo,
  addContratoEventoAnexo,
  createContratoMedicao,
  createContratoPagamento,
  createSubcontrato,
  deleteContratoPagamento,
  deleteSubcontrato,
  deleteCronogramaDependencia,
  getContratoConsolidado,
  getContratoById,
  getContratoCronograma,
  getContratosDashboard,
  getContratosFaturamento,
  getSubcontratosResumo,
  createContratoObservacao,
  downloadContratoEventoAnexo,
  listContratoAditivos,
  listContratoEventos,
  listContratoMedicoes,
  listContratoPagamentos,
  listContratoServicos,
  listSubcontratos,
  listContratos,
  aprovarContratoAditivo,
  seedCronogramaFromServicos,
  updateContrato,
  updateContratoAditivo,
  updateContratoMedicaoStatus,
  updateCronogramaItemDatas,
  updateSubcontrato,
} from './contratos.service.js';

export default async function contratosRoutes(server: FastifyInstance) {
  server.addHook('onRequest', authenticate);

  server.addHook('preHandler', async (request, reply) => {
    const tenantId = (request.user as any)?.tenantId;
    if (typeof tenantId !== 'number') {
      return reply.code(403).send({ message: 'Tenant não selecionado' });
    }
  });

  server.get(
    '/realtime/stream',
    {
      schema: {
        querystring: z.object({
          topics: z.string().optional(),
          contratoId: z.coerce.number().int().positive().optional(),
          token: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { topics, contratoId } = request.query as any;
      const topicList = String(topics || '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      if (contratoId) topicList.push(`contrato:${Number(contratoId)}`);
      if (!topicList.length) topicList.push('contratos');

      reply.raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
      reply.raw.setHeader('Connection', 'keep-alive');
      reply.raw.flushHeaders?.();

      const send = (data: any) => {
        reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
      };

      send({ topic: 'system', event: 'connected', payload: { ok: true, topics: topicList } });

      const unsubs = topicList.map((t) =>
        subscribe(t, (msg) => {
          send(msg);
        })
      );

      const interval = setInterval(() => {
        send({ topic: 'system', event: 'heartbeat', payload: { ts: Date.now() } });
      }, 20000);

      request.raw.on('close', () => {
        clearInterval(interval);
        for (const u of unsubs) u();
      });

      return reply;
    }
  );

  server.get(
    '/',
    {
      schema: {
        querystring: z.object({
          apenasPrincipais: z.coerce.boolean().optional(),
          papel: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const tenantId = (request.user as any).tenantId as number;
      const q = (request.query as any) || {};
      const rows = await listContratos(tenantId, { apenasPrincipais: Boolean(q.apenasPrincipais), papel: q.papel });
      return reply.send(rows);
    }
  );

  server.get(
    '/dashboard',
    {
      schema: {
        querystring: z.object({
          status: z.string().optional(),
          papel: z.string().optional(),
          tipoContratante: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const tenantId = (request.user as any).tenantId as number;
      const q = request.query as any;
      const data = await getContratosDashboard(tenantId, { status: q?.status, papel: q?.papel, tipoContratante: q?.tipoContratante });
      return reply.send(data);
    }
  );

  server.get(
    '/faturamento',
    {
      schema: {
        querystring: z.object({
          start: z.string().min(7),
          end: z.string().min(7),
          contratoId: z.coerce.number().int().positive().optional(),
          empresa: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const tenantId = (request.user as any).tenantId as number;
      const q = request.query as any;
      try {
        const data = await getContratosFaturamento(tenantId, {
          start: String(q.start),
          end: String(q.end),
          contratoId: q.contratoId != null ? Number(q.contratoId) : null,
          empresa: q.empresa != null ? String(q.empresa) : null,
        });
        return reply.send(data);
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao carregar faturamento' });
      }
    }
  );

  server.get(
    '/:id',
    { schema: { params: z.object({ id: z.coerce.number().int().positive() }) } },
    async (request, reply) => {
      const tenantId = (request.user as any).tenantId as number;
      const { id } = request.params as any;
      const row = await getContratoById(tenantId, id);
      if (!row) return reply.code(404).send({ message: 'Contrato não encontrado' });
      return reply.send(row);
    }
  );

  server.get(
    '/:id/consolidado',
    { schema: { params: z.object({ id: z.coerce.number().int().positive() }) } },
    async (request, reply) => {
      const tenantId = (request.user as any).tenantId as number;
      const { id } = request.params as any;
      try {
        const data = await getContratoConsolidado(tenantId, id);
        return reply.send(data);
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao carregar consolidado' });
      }
    }
  );

  server.get(
    '/:id/subcontratos/resumo',
    { schema: { params: z.object({ id: z.coerce.number().int().positive() }) } },
    async (request, reply) => {
      const tenantId = (request.user as any).tenantId as number;
      const { id } = request.params as any;
      try {
        const data = await getSubcontratosResumo(tenantId, id);
        return reply.send(data);
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao carregar resumo de subcontratos' });
      }
    }
  );

  server.get(
    '/:id/subcontratos',
    { schema: { params: z.object({ id: z.coerce.number().int().positive() }) } },
    async (request, reply) => {
      const tenantId = (request.user as any).tenantId as number;
      const { id } = request.params as any;
      try {
        const rows = await listSubcontratos(tenantId, id);
        return reply.send(rows);
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao listar subcontratos' });
      }
    }
  );

  server.post(
    '/:id/subcontratos',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int().positive() }),
        body: z.object({
          numeroContrato: z.string().optional().nullable(),
          subcontratadaNome: z.string().min(2),
          subcontratadaDocumento: z.string().optional().nullable(),
          objeto: z.string().min(2),
          valorTotal: z.number().positive(),
          dataInicio: z.string().min(10),
          dataFim: z.string().min(10),
          status: z.string().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const tenantId = (request.user as any).tenantId as number;
      const { id } = request.params as any;
      try {
        const created = await createSubcontrato(tenantId, id, request.body as any);
        return reply.send(created);
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao criar subcontrato' });
      }
    }
  );

  server.put(
    '/:id/subcontratos/:subId',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int().positive(), subId: z.coerce.number().int().positive() }),
        body: z.object({
          subcontratadaNome: z.string().optional().nullable(),
          subcontratadaDocumento: z.string().optional().nullable(),
          objeto: z.string().optional().nullable(),
          valorTotal: z.number().optional().nullable(),
          dataInicio: z.string().optional().nullable(),
          dataFim: z.string().optional().nullable(),
          status: z.string().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const tenantId = (request.user as any).tenantId as number;
      const { id, subId } = request.params as any;
      try {
        const updated = await updateSubcontrato(tenantId, id, subId, request.body as any);
        return reply.send(updated);
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao atualizar subcontrato' });
      }
    }
  );

  server.delete(
    '/:id/subcontratos/:subId',
    { schema: { params: z.object({ id: z.coerce.number().int().positive(), subId: z.coerce.number().int().positive() }) } },
    async (request, reply) => {
      const tenantId = (request.user as any).tenantId as number;
      const { id, subId } = request.params as any;
      try {
        const ok = await deleteSubcontrato(tenantId, id, subId);
        return reply.send(ok);
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao excluir subcontrato' });
      }
    }
  );

  server.get(
    '/:id/medicoes',
    { schema: { params: z.object({ id: z.coerce.number().int().positive() }) } },
    async (request, reply) => {
      const tenantId = (request.user as any).tenantId as number;
      const { id } = request.params as any;
      try {
        const rows = await listContratoMedicoes(tenantId, id);
        return reply.send(rows);
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao listar medições' });
      }
    }
  );

  server.post(
    '/:id/medicoes',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int().positive() }),
        body: z.object({
          date: z.string().min(10),
          amount: z.number().positive(),
          status: z.string().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const tenantId = (request.user as any).tenantId as number;
      const { id } = request.params as any;
      try {
        const created = await createContratoMedicao(tenantId, id, request.body as any);
        return reply.send(created);
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao criar medição' });
      }
    }
  );

  server.put(
    '/:id/medicoes/:medicaoId',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int().positive(), medicaoId: z.coerce.number().int().positive() }),
        body: z.object({ status: z.string().min(1) }),
      },
    },
    async (request, reply) => {
      const tenantId = (request.user as any).tenantId as number;
      const { id, medicaoId } = request.params as any;
      try {
        const updated = await updateContratoMedicaoStatus(tenantId, id, medicaoId, request.body as any);
        return reply.send(updated);
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao atualizar medição' });
      }
    }
  );

  server.get(
    '/:id/pagamentos',
    { schema: { params: z.object({ id: z.coerce.number().int().positive() }) } },
    async (request, reply) => {
      const tenantId = (request.user as any).tenantId as number;
      const { id } = request.params as any;
      try {
        const rows = await listContratoPagamentos(tenantId, id);
        return reply.send(rows);
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao listar pagamentos' });
      }
    }
  );

  server.post(
    '/:id/pagamentos',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int().positive() }),
        body: z.object({
          date: z.string().min(10),
          amount: z.number().positive(),
          medicaoId: z.number().int().positive().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const tenantId = (request.user as any).tenantId as number;
      const { id } = request.params as any;
      try {
        const created = await createContratoPagamento(tenantId, id, request.body as any);
        return reply.send(created);
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao criar pagamento' });
      }
    }
  );

  server.delete(
    '/:id/pagamentos/:pagamentoId',
    { schema: { params: z.object({ id: z.coerce.number().int().positive(), pagamentoId: z.coerce.number().int().positive() }) } },
    async (request, reply) => {
      const tenantId = (request.user as any).tenantId as number;
      const { id, pagamentoId } = request.params as any;
      try {
        const ok = await deleteContratoPagamento(tenantId, id, pagamentoId);
        return reply.send(ok);
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao excluir pagamento' });
      }
    }
  );

  server.get(
    '/:id/eventos',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int().positive() }),
        querystring: z
          .object({
            origens: z.string().optional(),
            incluirObservacoes: z.coerce.boolean().optional(),
            limit: z.coerce.number().int().positive().optional(),
          })
          .optional(),
      },
    },
    async (request, reply) => {
      const tenantId = (request.user as any).tenantId as number;
      const { id } = request.params as any;
      const q = (request.query as any) || {};
      const tiposOrigem = String(q.origens || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const incluirObservacoes = q.incluirObservacoes !== undefined ? Boolean(q.incluirObservacoes) : true;
      const limit = q.limit != null ? Number(q.limit) : 100;
      try {
        const data = await listContratoEventos(tenantId, id, { tiposOrigem, incluirObservacoes, limit });
        return reply.send(data);
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao listar eventos' });
      }
    }
  );

  server.post(
    '/:id/observacoes',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int().positive() }),
        body: z.object({
          texto: z.string().min(1),
          nivel: z.enum(['NORMAL', 'ALERTA', 'CRITICO']).optional().nullable(),
          tipoOrigem: z.enum(['CONTRATO', 'ADITIVO', 'OBRA', 'DOCUMENTO']).optional().nullable(),
          origemId: z.coerce.number().int().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const tenantId = (request.user as any).tenantId as number;
      const userId = (request.user as any).userId as number | undefined;
      const { id } = request.params as any;
      try {
        const created = await createContratoObservacao(tenantId, id, { ...(request.body as any), actorUserId: userId ?? null });
        return reply.send(created);
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao criar observação' });
      }
    }
  );

  server.post(
    '/:id/eventos/:eventoId/anexos',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int().positive(), eventoId: z.coerce.number().int().positive() }),
        body: z.object({
          nomeArquivo: z.string().min(1),
          mimeType: z.string().min(1),
          conteudoBase64: z.string().min(1),
        }),
      },
    },
    async (request, reply) => {
      const tenantId = (request.user as any).tenantId as number;
      const userId = (request.user as any).userId as number | undefined;
      const { id, eventoId } = request.params as any;
      try {
        const created = await addContratoEventoAnexo(tenantId, id, eventoId, { ...(request.body as any), actorUserId: userId ?? null });
        return reply.send(created);
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao anexar arquivo' });
      }
    }
  );

  server.get(
    '/:id/eventos/:eventoId/anexos/:anexoId',
    { schema: { params: z.object({ id: z.coerce.number().int().positive(), eventoId: z.coerce.number().int().positive(), anexoId: z.coerce.number().int().positive() }) } },
    async (request, reply) => {
      const tenantId = (request.user as any).tenantId as number;
      const { id, eventoId, anexoId } = request.params as any;
      try {
        const file = await downloadContratoEventoAnexo(tenantId, id, eventoId, anexoId);
        reply.header('Content-Type', file.mimeType);
        reply.header('Content-Length', String(file.tamanhoBytes));
        reply.header('Content-Disposition', `inline; filename="${encodeURIComponent(file.nomeArquivo)}"`);
        return reply.send(file.conteudo);
      } catch (e: any) {
        return reply.code(404).send({ message: e?.message || 'Anexo não encontrado' });
      }
    }
  );

  server.get(
    '/:id/aditivos',
    { schema: { params: z.object({ id: z.coerce.number().int().positive() }) } },
    async (request, reply) => {
      const tenantId = (request.user as any).tenantId as number;
      const { id } = request.params as any;
      try {
        const rows = await listContratoAditivos(tenantId, id);
        return reply.send(rows);
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao listar aditivos' });
      }
    }
  );

  server.post(
    '/:id/aditivos',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int().positive() }),
        body: z.object({
          numeroAditivo: z.string().min(1),
          tipo: z.enum(['PRAZO', 'VALOR', 'REPROGRAMACAO', 'AMBOS']),
          dataAssinatura: z.string().min(10),
          dataInicioVigencia: z.string().min(10).optional().nullable(),
          dataFimVigencia: z.string().min(10).optional().nullable(),
          alterouPlanilha: z.coerce.boolean(),
          justificativa: z.string().optional().nullable(),
          descricao: z.string().optional().nullable(),
          prazoAdicionadoDias: z.number().int().optional().nullable(),
          valorTotalAdicionado: z.number().optional().nullable(),
          valorConcedenteAdicionado: z.number().optional().nullable(),
          valorProprioAdicionado: z.number().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const tenantId = (request.user as any).tenantId as number;
      const { id } = request.params as any;
      try {
        const created = await createContratoAditivo(tenantId, id, request.body as any);
        return reply.send(created);
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao criar aditivo' });
      }
    }
  );

  server.put(
    '/:id/aditivos/:aditivoId',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int().positive(), aditivoId: z.coerce.number().int().positive() }),
        body: z.object({
          tipo: z.enum(['PRAZO', 'VALOR', 'REPROGRAMACAO', 'AMBOS']).optional(),
          dataAssinatura: z.string().min(10).optional().nullable(),
          dataInicioVigencia: z.string().min(10).optional().nullable(),
          dataFimVigencia: z.string().min(10).optional().nullable(),
          alterouPlanilha: z.coerce.boolean().optional(),
          justificativa: z.string().optional().nullable(),
          descricao: z.string().optional().nullable(),
          prazoAdicionadoDias: z.number().int().optional().nullable(),
          valorTotalAdicionado: z.number().optional().nullable(),
          valorConcedenteAdicionado: z.number().optional().nullable(),
          valorProprioAdicionado: z.number().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const tenantId = (request.user as any).tenantId as number;
      const { id, aditivoId } = request.params as any;
      try {
        const updated = await updateContratoAditivo(tenantId, id, aditivoId, request.body as any);
        return reply.send(updated);
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao atualizar aditivo' });
      }
    }
  );

  server.post(
    '/:id/aditivos/:aditivoId/aprovar',
    { schema: { params: z.object({ id: z.coerce.number().int().positive(), aditivoId: z.coerce.number().int().positive() }) } },
    async (request, reply) => {
      const tenantId = (request.user as any).tenantId as number;
      const { id, aditivoId } = request.params as any;
      try {
        const data = await aprovarContratoAditivo(tenantId, id, aditivoId);
        return reply.send(data);
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao aprovar aditivo' });
      }
    }
  );

  server.post(
    '/:id/aditivos/:aditivoId/cancelar',
    { schema: { params: z.object({ id: z.coerce.number().int().positive(), aditivoId: z.coerce.number().int().positive() }) } },
    async (request, reply) => {
      const tenantId = (request.user as any).tenantId as number;
      const { id, aditivoId } = request.params as any;
      try {
        const data = await cancelarContratoAditivo(tenantId, id, aditivoId);
        return reply.send(data);
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao cancelar aditivo' });
      }
    }
  );

  server.get(
    '/:id/servicos',
    { schema: { params: z.object({ id: z.coerce.number().int().positive() }) } },
    async (request, reply) => {
      const tenantId = (request.user as any).tenantId as number;
      const { id } = request.params as any;
      const rows = await listContratoServicos(tenantId, id);
      return reply.send(rows);
    }
  );

  server.post(
    '/:id/servicos',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int().positive() }),
        body: z.object({
          codigo: z.string().min(1),
          nome: z.string().min(1),
          unidade: z.string().optional().nullable(),
          quantidade: z.number().optional().nullable(),
          valorUnitario: z.number().optional().nullable(),
          percentualPeso: z.number().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const tenantId = (request.user as any).tenantId as number;
      const { id } = request.params as any;
      try {
        const created = await createContratoServico(tenantId, id, request.body as any);
        return reply.send(created);
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao criar serviço' });
      }
    }
  );

  server.get(
    '/:id/cronograma',
    { schema: { params: z.object({ id: z.coerce.number().int().positive() }) } },
    async (request, reply) => {
      const tenantId = (request.user as any).tenantId as number;
      const { id } = request.params as any;
      try {
        const data = await getContratoCronograma(tenantId, id);
        return reply.send(data);
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao carregar cronograma' });
      }
    }
  );

  server.post(
    '/:id/cronograma/seed',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int().positive() }),
        body: z
          .object({
            duracaoDiasPadrao: z.number().optional().nullable(),
          })
          .optional(),
      },
    },
    async (request, reply) => {
      const tenantId = (request.user as any).tenantId as number;
      const { id } = request.params as any;
      try {
        const data = await seedCronogramaFromServicos(tenantId, id, request.body as any);
        return reply.send(data);
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao gerar cronograma' });
      }
    }
  );

  server.put(
    '/:id/cronograma/:itemId',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int().positive(), itemId: z.coerce.number().int().positive() }),
        body: z.object({ dataInicio: z.string().min(1), dataFim: z.string().min(1) }),
      },
    },
    async (request, reply) => {
      const tenantId = (request.user as any).tenantId as number;
      const { id, itemId } = request.params as any;
      try {
        const updated = await updateCronogramaItemDatas(tenantId, id, itemId, request.body as any);
        return reply.send(updated);
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao atualizar cronograma' });
      }
    }
  );

  server.post(
    '/:id/cronograma/dependencias',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int().positive() }),
        body: z.object({
          origemItemId: z.coerce.number().int().positive(),
          destinoItemId: z.coerce.number().int().positive(),
          tipo: z.string().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const tenantId = (request.user as any).tenantId as number;
      const { id } = request.params as any;
      try {
        const created = await createCronogramaDependencia(tenantId, id, request.body as any);
        return reply.send(created);
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao criar dependência' });
      }
    }
  );

  server.delete(
    '/:id/cronograma/dependencias/:depId',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int().positive(), depId: z.coerce.number().int().positive() }),
      },
    },
    async (request, reply) => {
      const tenantId = (request.user as any).tenantId as number;
      const { id, depId } = request.params as any;
      try {
        const ok = await deleteCronogramaDependencia(tenantId, id, depId);
        return reply.send(ok);
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao remover dependência' });
      }
    }
  );

  server.post(
    '/',
    { schema: { body: createContratoSchema } },
    async (request, reply) => {
      const tenantId = (request.user as any).tenantId as number;
      try {
        const created = await createContrato(tenantId, request.body as any);
        return reply.send(created);
      } catch (e: any) {
        if (e?.code === 'P2002') {
          return reply.code(409).send({ message: 'Número do contrato já existe.' });
        }
        return reply.code(400).send({ message: e?.message || 'Erro ao criar contrato' });
      }
    }
  );

  server.put(
    '/:id',
    { schema: { params: z.object({ id: z.coerce.number().int().positive() }), body: updateContratoSchema } },
    async (request, reply) => {
      const tenantId = (request.user as any).tenantId as number;
      const { id } = request.params as any;
      try {
        const updated = await updateContrato(tenantId, id, request.body as any);
        return reply.send(updated);
      } catch (e: any) {
        if (e?.code === 'P2002') {
          return reply.code(409).send({ message: 'Número do contrato já existe.' });
        }
        return reply.code(400).send({ message: e?.message || 'Erro ao atualizar contrato' });
      }
    }
  );
}
