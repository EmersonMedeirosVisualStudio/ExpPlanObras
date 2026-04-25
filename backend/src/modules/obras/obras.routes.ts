import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createObraSchema, updateObraSchema, updateOrcamentoSchema, createCustoSchema } from './obras.schema.js';
import { createObra, getObras, getObraById, updateObra, deleteObra, getOrcamento, updateOrcamento, addCusto, removeCusto, getEnderecoObra, upsertEnderecoObra, listEnderecosObra, createEnderecoObra, updateEnderecoObraById, deleteEnderecoObraById, ensurePlanilhaContratadaMinima, getPlanilhaContratadaResumo, listPlanilhaContratadaItens, addPlanilhaContratadaItem, getObrasResumoFinanceiro, type AbrangenciaContext, type OrigemEndereco } from './obras.service.js';
import { authenticate } from '../../utils/authenticate.js';

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

  function removeDiacritics(value: string) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function normalizeStateName(value: string) {
    return removeDiacritics(String(value || '').trim())
      .toUpperCase()
      .replace(/[^A-Z\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const UF_LIST = [
    'AC',
    'AL',
    'AM',
    'AP',
    'BA',
    'CE',
    'DF',
    'ES',
    'GO',
    'MA',
    'MG',
    'MS',
    'MT',
    'PA',
    'PB',
    'PE',
    'PI',
    'PR',
    'RJ',
    'RN',
    'RO',
    'RR',
    'RS',
    'SC',
    'SE',
    'SP',
    'TO',
  ];

  const UF_BY_STATE_NAME: Record<string, string> = {
    ACRE: 'AC',
    ALAGOAS: 'AL',
    AMAPA: 'AP',
    AMAZONAS: 'AM',
    BAHIA: 'BA',
    CEARA: 'CE',
    'DISTRITO FEDERAL': 'DF',
    'ESPIRITO SANTO': 'ES',
    GOIAS: 'GO',
    MARANHAO: 'MA',
    'MATO GROSSO': 'MT',
    'MATO GROSSO DO SUL': 'MS',
    'MINAS GERAIS': 'MG',
    PARA: 'PA',
    PARAIBA: 'PB',
    PARANA: 'PR',
    PERNAMBUCO: 'PE',
    PIAUI: 'PI',
    'RIO DE JANEIRO': 'RJ',
    'RIO GRANDE DO NORTE': 'RN',
    'RIO GRANDE DO SUL': 'RS',
    RONDONIA: 'RO',
    RORAIMA: 'RR',
    'SANTA CATARINA': 'SC',
    'SAO PAULO': 'SP',
    SERGIPE: 'SE',
    TOCANTINS: 'TO',
  };

  function normalizeUfFromNominatim(candidate: unknown, isoCandidate: unknown, stateNameCandidate: unknown) {
    const uf = String(candidate || '').trim().toUpperCase();
    if (uf.length === 2 && UF_LIST.includes(uf)) return uf;

    const iso = String(isoCandidate || '').trim().toUpperCase();
    if (iso.startsWith('BR-') && iso.length >= 5) {
      const s = iso.slice(-2);
      if (UF_LIST.includes(s)) return s;
    }

    const stateName = normalizeStateName(String(stateNameCandidate || ''));
    if (!stateName) return null;
    return UF_BY_STATE_NAME[stateName] || null;
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
    const uf = normalizeUfFromNominatim(a.state_code, a['ISO3166-2-lvl4'], a.state);
    return {
      logradouro: a.road || a.pedestrian || a.highway || null,
      numero: a.house_number || null,
      bairro: a.suburb || a.neighbourhood || a.quarter || null,
      cidade: a.city || a.town || a.village || a.municipality || a.county || null,
      uf,
      cep: a.postcode ? normalizeCep(String(a.postcode)) : null,
    };
  }

  async function searchGeocode(query: string) {
    const provider = String(process.env.GEOCODING_PROVIDER || 'NOMINATIM').toUpperCase();
    if (provider !== 'NOMINATIM') return null;
    const q = String(query || '').trim();
    if (!q) return null;
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&addressdetails=1&limit=1`;
    const r = await fetch(url, { headers: { 'User-Agent': 'ExpPlanObras/1.0' } } as any).catch(() => null);
    if (!r || !r.ok) return null;
    const json: any = await r.json().catch(() => null);
    const row = Array.isArray(json) ? json[0] : null;
    if (!row) return null;
    const a = row?.address;
    const cep = a?.postcode ? normalizeCep(String(a.postcode)) : null;
    const lat = row?.lat != null ? String(row.lat) : null;
    const lon = row?.lon != null ? String(row.lon) : null;
    if (!lat || !lon) return null;
    return { latitude: lat, longitude: lon, cep };
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

  server.post(
    '/enderecos/preview/link',
    {
      schema: {
        body: z.object({
          link: z.string().min(8),
        }),
      },
    },
    async (request, reply) => {
      const body = request.body as any;
      try {
        const resolved = await resolveUrl(String(body.link || ''));
        const coords = parseLatLngFromText(resolved) || parseLatLngFromText(String(body.link || ''));
        if (!coords) return reply.code(400).send({ message: 'Não foi possível extrair latitude/longitude do link' });
        const addr = await reverseGeocode(coords.latitude, coords.longitude);
        return reply.send({
          latitude: coords.latitude,
          longitude: coords.longitude,
          logradouro: addr?.logradouro ?? null,
          numero: addr?.numero ?? null,
          complemento: null,
          bairro: addr?.bairro ?? null,
          cidade: addr?.cidade ?? null,
          uf: addr?.uf ?? null,
          cep: addr?.cep ?? null,
          origemEndereco: addr ? 'LINK' : 'MANUAL',
          origemCoordenada: 'LINK',
        });
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao buscar localização' });
      }
    }
  );

  server.post(
    '/enderecos/preview/cep',
    {
      schema: {
        body: z.object({
          cep: z.string().min(8),
        }),
      },
    },
    async (request, reply) => {
      const body = request.body as any;
      try {
        const base = await lookupCep(String(body.cep || ''));
        if (!base) return reply.code(400).send({ message: 'CEP inválido' });
        const q = [base.logradouro, base.bairro, base.cidade, base.uf, base.cep].filter(Boolean).join(', ');
        const coords = await searchGeocode(q);
        return reply.send({
          ...base,
          latitude: coords?.latitude ?? null,
          longitude: coords?.longitude ?? null,
          origemEndereco: 'CEP',
          origemCoordenada: coords?.latitude && coords?.longitude ? 'CEP' : 'MANUAL',
        });
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao buscar endereço por CEP' });
      }
    }
  );

  server.post(
    '/enderecos/preview/buscar-cep',
    {
      schema: {
        body: z.object({
          logradouro: z.string().optional().nullable(),
          numero: z.string().optional().nullable(),
          bairro: z.string().optional().nullable(),
          cidade: z.string().optional().nullable(),
          uf: z.string().optional().nullable(),
        }),
      },
    },
    async (request, reply) => {
      const body = request.body as any;
      try {
        const q = [body.logradouro, body.numero, body.bairro, body.cidade, body.uf].filter(Boolean).join(', ');
        if (!q) return reply.code(400).send({ message: 'Informe rua, cidade e UF para buscar o CEP' });
        const res = await searchGeocode(q);
        if (!res?.cep) return reply.code(400).send({ message: 'Não foi possível localizar o CEP para este endereço' });
        return reply.send({ cep: res.cep });
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao buscar CEP' });
      }
    }
  );

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
    '/:id/enderecos',
    { schema: { params: z.object({ id: z.coerce.number().int().positive() }) } },
    async (request, reply) => {
      const { tenantId } = request.user as any;
      const scope = (request.user as any)?.abrangencia as AbrangenciaContext | undefined;
      const { id } = request.params as { id: number };
      try {
        const enderecos = await listEnderecosObra(id, tenantId, scope);
        return reply.send(enderecos);
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao carregar endereços' });
      }
    }
  );

  const enderecoBodySchema = z
    .object({
      nomeEndereco: z.string().optional().nullable(),
      principal: z.boolean().optional(),
      origem: z.enum(['LINK', 'CEP', 'MANUAL']),
      origemEndereco: z.enum(['LINK', 'CEP', 'MANUAL']).optional(),
      origemCoordenada: z.enum(['LINK', 'CEP', 'MANUAL']).optional(),
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
    .passthrough();

  server.post(
    '/:id/enderecos',
    { schema: { params: z.object({ id: z.coerce.number().int().positive() }), body: enderecoBodySchema } },
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
          const saved = await createEnderecoObra(
            id,
            tenantId,
            {
              ...base,
              numero: body.numero ?? null,
              nomeEndereco: body.nomeEndereco ?? null,
              principal: body.principal ?? null,
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
          const saved = await createEnderecoObra(
            id,
            tenantId,
            {
              ...(addr || {}),
              latitude: coords.latitude,
              longitude: coords.longitude,
              nomeEndereco: body.nomeEndereco ?? null,
              principal: body.principal ?? null,
              origemEndereco: addr ? 'LINK' : 'MANUAL',
              origemCoordenada: 'LINK',
            },
            scope
          );
          return reply.send(saved);
        }

        const saved = await createEnderecoObra(
          id,
          tenantId,
          {
            nomeEndereco: body.nomeEndereco ?? null,
            principal: body.principal ?? null,
            cep: body.cep ? normalizeCep(String(body.cep)) || null : null,
            logradouro: body.logradouro ?? null,
            numero: body.numero ?? null,
            complemento: body.complemento ?? null,
            bairro: body.bairro ?? null,
            cidade: body.cidade ?? null,
            uf: body.uf ?? null,
            latitude: body.latitude ?? null,
            longitude: body.longitude ?? null,
            origemEndereco: String(body.origemEndereco || 'MANUAL').toUpperCase() === 'LINK' ? 'LINK' : String(body.origemEndereco || 'MANUAL').toUpperCase() === 'CEP' ? 'CEP' : 'MANUAL',
            origemCoordenada: String(body.origemCoordenada || 'MANUAL').toUpperCase() === 'LINK'
              ? 'LINK'
              : String(body.origemCoordenada || 'MANUAL').toUpperCase() === 'CEP'
                ? 'CEP'
                : 'MANUAL',
          },
          scope
        );
        return reply.send(saved);
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao salvar endereço' });
      }
    }
  );

  server.put(
    '/:id/enderecos/:enderecoId',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int().positive(), enderecoId: z.coerce.number().int().positive() }),
        body: enderecoBodySchema,
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user as any;
      const scope = (request.user as any)?.abrangencia as AbrangenciaContext | undefined;
      const { id, enderecoId } = request.params as { id: number; enderecoId: number };
      const body = request.body as any;
      const origem = String(body.origem || 'MANUAL').toUpperCase() as OrigemEndereco;

      try {
        if (origem === 'CEP') {
          const base = await lookupCep(String(body.cep || ''));
          if (!base) return reply.code(400).send({ message: 'CEP inválido' });
          const saved = await updateEnderecoObraById(
            id,
            enderecoId,
            tenantId,
            {
              ...base,
              numero: body.numero ?? null,
              nomeEndereco: body.nomeEndereco ?? null,
              principal: body.principal ?? null,
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
          const saved = await updateEnderecoObraById(
            id,
            enderecoId,
            tenantId,
            {
              ...(addr || {}),
              latitude: coords.latitude,
              longitude: coords.longitude,
              nomeEndereco: body.nomeEndereco ?? null,
              principal: body.principal ?? null,
              origemEndereco: addr ? 'LINK' : 'MANUAL',
              origemCoordenada: 'LINK',
            },
            scope
          );
          return reply.send(saved);
        }

        const saved = await updateEnderecoObraById(
          id,
          enderecoId,
          tenantId,
          {
            nomeEndereco: body.nomeEndereco ?? null,
            principal: body.principal ?? null,
            cep: body.cep ? normalizeCep(String(body.cep)) || null : null,
            logradouro: body.logradouro ?? null,
            numero: body.numero ?? null,
            complemento: body.complemento ?? null,
            bairro: body.bairro ?? null,
            cidade: body.cidade ?? null,
            uf: body.uf ?? null,
            latitude: body.latitude ?? null,
            longitude: body.longitude ?? null,
            origemEndereco: String(body.origemEndereco || 'MANUAL').toUpperCase() === 'LINK' ? 'LINK' : String(body.origemEndereco || 'MANUAL').toUpperCase() === 'CEP' ? 'CEP' : 'MANUAL',
            origemCoordenada: String(body.origemCoordenada || 'MANUAL').toUpperCase() === 'LINK'
              ? 'LINK'
              : String(body.origemCoordenada || 'MANUAL').toUpperCase() === 'CEP'
                ? 'CEP'
                : 'MANUAL',
          },
          scope
        );
        return reply.send(saved);
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao salvar endereço' });
      }
    }
  );

  server.delete(
    '/:id/enderecos/:enderecoId',
    { schema: { params: z.object({ id: z.coerce.number().int().positive(), enderecoId: z.coerce.number().int().positive() }) } },
    async (request, reply) => {
      const { tenantId } = request.user as any;
      const scope = (request.user as any)?.abrangencia as AbrangenciaContext | undefined;
      const { id, enderecoId } = request.params as { id: number; enderecoId: number };
      try {
        const result = await deleteEnderecoObraById(id, enderecoId, tenantId, scope);
        return reply.send(result);
      } catch (e: any) {
        return reply.code(400).send({ message: e?.message || 'Erro ao remover endereço' });
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
    const q = z.object({ contratoId: z.coerce.number().int().positive().optional() }).parse(request.query || {});
    const obras = await getObras(tenantId, scope, { contratoId: q.contratoId });
    return reply.send(obras);
  });

  server.get(
    '/resumo-financeiro',
    {
      schema: {
        querystring: z.object({ contratoId: z.coerce.number().int().positive().optional() }),
      },
    },
    async (request, reply) => {
      const { tenantId } = request.user as any;
      const scope = (request.user as any)?.abrangencia as AbrangenciaContext | undefined;
      const q = request.query as any;
      const rows = await getObrasResumoFinanceiro(tenantId, scope, { contratoId: q?.contratoId != null ? Number(q.contratoId) : undefined });
      return reply.send(rows);
    }
  );

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
