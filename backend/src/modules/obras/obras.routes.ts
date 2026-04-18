import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createObraSchema, updateObraSchema, updateOrcamentoSchema, createCustoSchema } from './obras.schema.js';
import { createObra, getObras, getObraById, updateObra, deleteObra, getOrcamento, updateOrcamento, addCusto, removeCusto, getEnderecoObra, upsertEnderecoObra, ensurePlanilhaContratadaMinima, getPlanilhaContratadaResumo, listPlanilhaContratadaItens, addPlanilhaContratadaItem, type AbrangenciaContext, type OrigemEndereco } from './obras.service.js';
import { authenticate } from '../../utils/authenticate.js';
import { parseCSV } from '../../utils/csv.js';
import { ensureContratoPendente } from '../contratos/contratos.service.js';

export default async function obraRoutes(server: FastifyInstance) {
  server.addHook('onRequest', authenticate);

  server.addHook('preHandler', async (request, reply) => {
    const tenantId = (request.user as any)?.tenantId;
    if (typeof tenantId !== 'number') {
      return reply.code(403).send({ message: 'Tenant não selecionado' });
    }
  });

  function onlyDigits(value: string) {
    return String(value || '').replace(/\D/g, '');
  }

  function normalizeCep(value: string) {
    const d = onlyDigits(value);
    return d.length === 8 ? d : '';
  }

  function parseLatLngFromText(value: string) {
    const s = String(value || '').trim();
    const m = s.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/) || s.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (!m) return null;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { latitude: String(lat), longitude: String(lng) };
  }

  async function resolveUrl(input: string) {
    const raw = String(input || '').trim();
    if (!raw) return '';
    let url = raw;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try {
      const u = new URL(url);
      if (u.hostname.includes('maps.app.goo.gl') || u.hostname.includes('goo.gl')) {
        const r = await fetch(url, { redirect: 'follow' as any });
        return r.url || url;
      }
      return url;
    } catch {
      return '';
    }
  }

  async function reverseGeocode(latitude: string, longitude: string) {
    const provider = String(process.env.GEOCODING_PROVIDER || 'NOMINATIM').toUpperCase();
    if (provider !== 'NOMINATIM') return null;
    const lat = String(latitude || '').trim();
    const lon = String(longitude || '').trim();
    if (!lat || !lon) return null;
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&addressdetails=1`;
    const r = await fetch(url, { headers: { 'User-Agent': 'ExpPlanObras/1.0' } } as any).catch(() => null);
    if (!r || !r.ok) return null;
    const json: any = await r.json().catch(() => null);
    const a = json?.address;
    if (!a) return null;
    return {
      logradouro: a.road || a.pedestrian || a.highway || null,
      bairro: a.suburb || a.neighbourhood || a.quarter || null,
      cidade: a.city || a.town || a.village || null,
      uf: a.state_code || a.state || null,
      cep: a.postcode ? normalizeCep(String(a.postcode)) : null,
    };
  }

  async function lookupCep(cepDigits: string) {
    const cep = normalizeCep(cepDigits);
    if (!cep) return null;
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`).catch(() => null);
    if (!r || !r.ok) return null;
    const json: any = await r.json().catch(() => null);
    if (!json || json.erro) return null;
    return {
      cep,
      logradouro: json.logradouro || null,
      complemento: json.complemento || null,
      bairro: json.bairro || null,
      cidade: json.localidade || null,
      uf: json.uf || null,
    };
  }

  server.get(
    '/:id/endereco',
    { schema: { params: z.object({ id: z.coerce.number().int() }) } },
    async (request, reply) => {
      const { tenantId } = request.user as any;
      const scope = (request.user as any)?.abrangencia as AbrangenciaContext | undefined;
      const { id } = request.params as { id: number };
      try {
        const endereco = await getEnderecoObra(id, tenantId, scope);
        return reply.send(endereco);
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao carregar endereço' });
      }
    }
  );

  server.put(
    '/:id/endereco',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int() }),
        body: z
          .object({
            origem: z.enum(['LINK', 'CEP', 'MANUAL']),
            link: z.string().optional(),
            cep: z.string().optional(),
            logradouro: z.string().optional().nullable(),
            numero: z.string().optional().nullable(),
            complemento: z.string().optional().nullable(),
            bairro: z.string().optional().nullable(),
            cidade: z.string().optional().nullable(),
            uf: z.string().optional().nullable(),
            latitude: z.string().optional().nullable(),
            longitude: z.string().optional().nullable(),
          })
          .passthrough(),
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user as any;
      const scope = (request.user as any)?.abrangencia as AbrangenciaContext | undefined;
      const { id } = request.params as { id: number };
      const body = request.body as any;
      const origem = String(body.origem || 'MANUAL').toUpperCase() as OrigemEndereco;

      try {
        if (origem === 'CEP') {
          const base = await lookupCep(String(body.cep || ''));
          if (!base) return reply.code(400).send({ message: 'CEP inválido' });
          const saved = await upsertEnderecoObra(
            id,
            tenantId,
            {
              ...base,
              numero: body.numero ?? null,
              origemEndereco: 'CEP',
              origemCoordenada: 'CEP',
            },
            scope
          );
          return reply.send(saved);
        }

        if (origem === 'LINK') {
          const resolved = await resolveUrl(String(body.link || ''));
          const coords = parseLatLngFromText(resolved) || parseLatLngFromText(String(body.link || ''));
          if (!coords) return reply.code(400).send({ message: 'Não foi possível extrair latitude/longitude do link' });
          const addr = await reverseGeocode(coords.latitude, coords.longitude);
          const saved = await upsertEnderecoObra(
            id,
            tenantId,
            {
              ...(addr || {}),
              latitude: coords.latitude,
              longitude: coords.longitude,
              origemEndereco: addr ? 'LINK' : 'MANUAL',
              origemCoordenada: 'LINK',
            },
            scope
          );
          return reply.send(saved);
        }

        const saved = await upsertEnderecoObra(
          id,
          tenantId,
          {
            cep: body.cep ? normalizeCep(String(body.cep)) || null : null,
            logradouro: body.logradouro ?? null,
            numero: body.numero ?? null,
            complemento: body.complemento ?? null,
            bairro: body.bairro ?? null,
            cidade: body.cidade ?? null,
            uf: body.uf ?? null,
            latitude: body.latitude ?? null,
            longitude: body.longitude ?? null,
            origemEndereco: 'MANUAL',
            origemCoordenada: body.latitude || body.longitude ? 'MANUAL' : 'MANUAL',
          },
          scope
        );
        return reply.send(saved);
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao salvar endereço' });
      }
    }
  );

  server.get(
    '/:id/planilha/resumo',
    { schema: { params: z.object({ id: z.coerce.number().int().positive() }) } },
    async (request, reply) => {
      const { tenantId } = request.user as any;
      const scope = (request.user as any)?.abrangencia as AbrangenciaContext | undefined;
      const { id } = request.params as { id: number };
      try {
        const resumo = await getPlanilhaContratadaResumo(id, tenantId, scope);
        return reply.send(resumo);
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao carregar planilha' });
      }
    }
  );

  server.post(
    '/:id/planilha/minima',
    { schema: { params: z.object({ id: z.coerce.number().int().positive() }) } },
    async (request, reply) => {
      const { tenantId } = request.user as any;
      const scope = (request.user as any)?.abrangencia as AbrangenciaContext | undefined;
      const { id } = request.params as { id: number };
      try {
        const result = await ensurePlanilhaContratadaMinima(id, tenantId, scope);
        return reply.send(result);
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao criar planilha mínima' });
      }
    }
  );

  server.get(
    '/:id/planilha/itens',
    { schema: { params: z.object({ id: z.coerce.number().int().positive() }) } },
    async (request, reply) => {
      const { tenantId } = request.user as any;
      const scope = (request.user as any)?.abrangencia as AbrangenciaContext | undefined;
      const { id } = request.params as { id: number };
      try {
        const itens = await listPlanilhaContratadaItens(id, tenantId, scope);
        return reply.send(itens);
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao carregar itens da planilha' });
      }
    }
  );

  server.post(
    '/:id/planilha/itens',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int().positive() }),
        body: z.object({
          codigoServico: z.string().min(3),
          descricao: z.string().optional().nullable(),
          unidade: z.string().optional().nullable(),
          quantidade: z.number().optional().nullable(),
          precoUnitario: z.number().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user as any;
      const scope = (request.user as any)?.abrangencia as AbrangenciaContext | undefined;
      const { id } = request.params as { id: number };
      try {
        const result = await addPlanilhaContratadaItem(id, tenantId, request.body as any, scope);
        return reply.send(result);
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao adicionar item na planilha' });
      }
    }
  );

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

    const contratoPendenteId = await ensureContratoPendente(tenantId);

    const results = { imported: 0, errors: [] as Array<{ line: number; error: string }> };
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      try {
        const contratoIdRaw = r[m('contratoid')] || r[m('contrato_id')] || r[m('id_contrato')] || '';
        const contratoIdParsed = contratoIdRaw ? Number(String(contratoIdRaw).trim()) : NaN;
        const contratoId = Number.isFinite(contratoIdParsed) && contratoIdParsed > 0 ? contratoIdParsed : contratoPendenteId;
        const input = {
          name: r[m('name')] || r[m('nome')] || '',
          contratoId,
          type: (r[m('type')] || r[m('tipo')] || 'PARTICULAR').toUpperCase() as any,
          status: (r[m('status')] || 'NAO_INICIADA').toUpperCase() as any,
          description: r[m('description')] || r[m('descricao')] || undefined,
          valorPrevisto: toNumber(r[m('valorprevisto')] || r[m('valor_previsto')])
        };
        if (!input.name || input.name.length < 3) {
          throw new Error('Nome da obra é obrigatório (mín. 3 caracteres)');
        }
        const created = await createObra(input as any, tenantId);

        const logradouro = r[m('street')] || r[m('rua')] || undefined;
        const numero = r[m('number')] || r[m('numero')] || undefined;
        const bairro = r[m('neighborhood')] || r[m('bairro')] || undefined;
        const cidade = r[m('city')] || r[m('cidade')] || undefined;
        const uf = r[m('state')] || r[m('uf')] || r[m('estado')] || undefined;
        const latitude = r[m('latitude')] || undefined;
        const longitude = r[m('longitude')] || undefined;
        const hasAny = !!(logradouro || numero || bairro || cidade || uf || latitude || longitude);

        if (hasAny) {
          await upsertEnderecoObra(
            Number(created.id),
            tenantId,
            {
              logradouro: logradouro ? String(logradouro) : null,
              numero: numero ? String(numero) : null,
              bairro: bairro ? String(bairro) : null,
              cidade: cidade ? String(cidade) : null,
              uf: uf ? String(uf) : null,
              latitude: latitude ? String(latitude) : null,
              longitude: longitude ? String(longitude) : null,
              origemEndereco: 'MANUAL',
              origemCoordenada: 'MANUAL',
            },
            { empresa: true, obras: [], unidades: [] }
          );
        }
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
      const scope = (request.user as any)?.abrangencia as AbrangenciaContext | undefined;
      const { id } = request.params as { id: number };
      if (scope && !scope.empresa && Array.isArray(scope.obras) && !scope.obras.includes(id)) {
        return reply.code(403).send({ message: 'Acesso negado' });
      }
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
      const scope = (request.user as any)?.abrangencia as AbrangenciaContext | undefined;
      const { id } = request.params as { id: number };
      const { valorPrevisto } = request.body as { valorPrevisto: number };
      const data = await updateOrcamento(id, valorPrevisto, tenantId, scope);
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
      const { tenantId } = request.user as any;
      const obra = await createObra(request.body as z.infer<typeof createObraSchema>, tenantId);
      return reply.code(201).send(obra);
    }
  );

  server.get('/', async (request, reply) => {
    const { tenantId } = request.user as any;
    const scope = (request.user as any)?.abrangencia as AbrangenciaContext | undefined;
    const obras = await getObras(tenantId, scope);
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
      const { tenantId } = request.user as any;
      const scope = (request.user as any)?.abrangencia as AbrangenciaContext | undefined;
      const { id } = request.params as { id: number };
      const obra = await getObraById(id, tenantId, scope);
      
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
      const { tenantId } = request.user as any;
      const scope = (request.user as any)?.abrangencia as AbrangenciaContext | undefined;
      const { id } = request.params as { id: number };
      try {
        const obra = await updateObra(id, request.body as z.infer<typeof updateObraSchema>, tenantId, scope);
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
      const { tenantId } = request.user as any;
      const scope = (request.user as any)?.abrangencia as AbrangenciaContext | undefined;
      const { id } = request.params as { id: number };
      try {
        await deleteObra(id, tenantId, scope);
        return reply.code(204).send();
      } catch (error) {
        return reply.code(404).send({ message: 'Obra not found' });
      }
    }
  );
}
