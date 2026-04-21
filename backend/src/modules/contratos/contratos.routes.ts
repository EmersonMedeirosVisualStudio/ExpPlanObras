import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../../utils/authenticate.js';
import { createContratoSchema, updateContratoSchema } from './contratos.schema.js';
import {
  createContrato,
  createContratoAditivo,
  createContratoServico,
  createCronogramaDependencia,
  cancelarContratoAditivo,
  deleteCronogramaDependencia,
  getContratoConsolidado,
  getContratoById,
  getContratoCronograma,
  getContratosDashboard,
  listContratoAditivos,
  listContratoServicos,
  listContratos,
  aprovarContratoAditivo,
  seedCronogramaFromServicos,
  updateContrato,
  updateContratoAditivo,
  updateCronogramaItemDatas,
} from './contratos.service.js';

export default async function contratosRoutes(server: FastifyInstance) {
  server.addHook('onRequest', authenticate);

  server.addHook('preHandler', async (request, reply) => {
    const tenantId = (request.user as any)?.tenantId;
    if (typeof tenantId !== 'number') {
      return reply.code(403).send({ message: 'Tenant não selecionado' });
    }
  });

  server.get('/', async (request, reply) => {
    const tenantId = (request.user as any).tenantId as number;
    const rows = await listContratos(tenantId);
    return reply.send(rows);
  });

  server.get(
    '/dashboard',
    {
      schema: {
        querystring: z.object({
          status: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const tenantId = (request.user as any).tenantId as number;
      const q = request.query as any;
      const data = await getContratosDashboard(tenantId, { status: q?.status });
      return reply.send(data);
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
          tipo: z.enum(['PRAZO', 'VALOR', 'AMBOS']),
          dataAssinatura: z.string().optional().nullable(),
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
          tipo: z.enum(['PRAZO', 'VALOR', 'AMBOS']).optional(),
          dataAssinatura: z.string().optional().nullable(),
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
      const created = await createContrato(tenantId, request.body as any);
      return reply.send(created);
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
        return reply.code(400).send({ message: e?.message || 'Erro ao atualizar contrato' });
      }
    }
  );
}
