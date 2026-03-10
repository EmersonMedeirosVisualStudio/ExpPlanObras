import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createObraSchema, updateObraSchema, updateOrcamentoSchema, createCustoSchema } from './obras.schema.js';
import { createObra, getObras, getObraById, updateObra, deleteObra, getOrcamento, updateOrcamento, addCusto, removeCusto } from './obras.service.js';
import { authenticate } from '../../utils/authenticate.js';
import { parseCSV } from '../../utils/csv.js';

export default async function obraRoutes(server: FastifyInstance) {
  server.addHook('onRequest', authenticate);

  server.post('/import', async (request, reply) => {
    const { tenantId } = request.user as any;
    const file = await (request as any).file();
    if (!file) {
      return reply.code(400).send({ message: 'Arquivo CSV não enviado (campo "file")' });
    }
    const chunks: Buffer[] = [];
    for await (const chunk of file.file) {
      chunks.push(chunk as Buffer);
    }
    const buffer = Buffer.concat(chunks);
    const text = buffer.toString('utf-8');
    const { headers, rows } = parseCSV(text);

    if (headers.length === 0 || rows.length === 0) {
      return reply.code(400).send({ message: 'CSV vazio ou inválido' });
    }

    const m = (k: string) => k.toLowerCase();
    const toNumber = (v?: string) => {
      if (!v) return undefined;
      const norm = v.replace(/\./g, '').replace(',', '.');
      const n = parseFloat(norm);
      return isNaN(n) ? undefined : n;
    };

    const results = { imported: 0, errors: [] as Array<{ line: number; error: string }> };
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        const input = {
          name: r[m('name')] || r[m('nome')] || '',
          type: (r[m('type')] || r[m('tipo')] || 'PARTICULAR').toUpperCase() as any,
          status: (r[m('status')] || 'NAO_INICIADA').toUpperCase() as any,
          street: r[m('street')] || r[m('rua')] || undefined,
          number: r[m('number')] || r[m('numero')] || undefined,
          neighborhood: r[m('neighborhood')] || r[m('bairro')] || undefined,
          city: r[m('city')] || r[m('cidade')] || undefined,
          state: r[m('state')] || r[m('uf')] || r[m('estado')] || undefined,
          latitude: r[m('latitude')] || undefined,
          longitude: r[m('longitude')] || undefined,
          description: r[m('description')] || r[m('descricao')] || undefined,
          valorPrevisto: toNumber(r[m('valorprevisto')] || r[m('valor_previsto')])
        };
        if (!input.name || input.name.length < 3) {
          throw new Error('Nome da obra é obrigatório (mín. 3 caracteres)');
        }
        await createObra(input as any, tenantId);
        results.imported++;
      } catch (e: any) {
        results.errors.push({ line: i + 2, error: e.message || String(e) });
      }
    }

    return reply.code(207).send(results);
  });

  server.get(
    '/:id/orcamento',
    {
      schema: {
        params: z.object({
          id: z.coerce.number().int(),
        }),
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user as any;
      const { id } = request.params as { id: number };
      const data = await getOrcamento(id, tenantId);
      return reply.send(data);
    }
  );

  server.put(
    '/:id/orcamento',
    {
      schema: {
        params: z.object({
          id: z.coerce.number().int(),
        }),
        body: updateOrcamentoSchema,
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user as any;
      const { id } = request.params as { id: number };
      const { valorPrevisto } = request.body as { valorPrevisto: number };
      const data = await updateOrcamento(id, valorPrevisto, tenantId);
      return reply.send(data);
    }
  );

  server.get(
    '/:id/custos',
    {
      schema: {
        params: z.object({
          id: z.coerce.number().int(),
        }),
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user as any;
      const { id } = request.params as { id: number };
      const data = await getOrcamento(id, tenantId);
      return reply.send(data.custos);
    }
  );

  server.post(
    '/:id/custos',
    {
      schema: {
        params: z.object({
          id: z.coerce.number().int(),
        }),
        body: createCustoSchema,
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user as any;
      const { id } = request.params as { id: number };
      const data = await addCusto(id, request.body as any, tenantId);
      return reply.code(201).send(data);
    }
  );

  server.delete(
    '/:id/custos/:custoId',
    {
      schema: {
        params: z.object({
          id: z.coerce.number().int(),
          custoId: z.coerce.number().int(),
        }),
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user as any;
      const { id, custoId } = request.params as { id: number; custoId: number };
      const data = await removeCusto(id, custoId, tenantId);
      return reply.send(data);
    }
  );

  server.post(
    '/',
    {
      schema: {
        body: createObraSchema,
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user;
      const obra = await createObra(request.body as z.infer<typeof createObraSchema>, tenantId);
      return reply.code(201).send(obra);
    }
  );

  server.get('/', async (request, reply) => {
    const { tenantId } = request.user;
    const obras = await getObras(tenantId);
    return reply.send(obras);
  });

  server.get(
    '/:id',
    {
      schema: {
        params: z.object({
          id: z.coerce.number().int(),
        }),
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user;
      const { id } = request.params as { id: number };
      const obra = await getObraById(id, tenantId);
      
      if (!obra) {
        return reply.code(404).send({ message: 'Obra not found' });
      }
      
      return reply.send(obra);
    }
  );

  server.put(
    '/:id',
    {
      schema: {
        params: z.object({
          id: z.coerce.number().int(),
        }),
        body: updateObraSchema,
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user;
      const { id } = request.params as { id: number };
      try {
        const obra = await updateObra(id, request.body as z.infer<typeof updateObraSchema>, tenantId);
        return reply.send(obra);
      } catch (error) {
        return reply.code(404).send({ message: 'Obra not found' });
      }
    }
  );

  server.delete(
    '/:id',
    {
      schema: {
        params: z.object({
          id: z.coerce.number().int(),
        }),
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user;
      const { id } = request.params as { id: number };
      try {
        await deleteObra(id, tenantId);
        return reply.code(204).send();
      } catch (error) {
        return reply.code(404).send({ message: 'Obra not found' });
      }
    }
  );
}
