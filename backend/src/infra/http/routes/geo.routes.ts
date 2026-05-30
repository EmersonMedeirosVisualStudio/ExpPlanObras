import { FastifyInstance } from 'fastify';
import { z } from 'zod';

function extractLatLngFromGoogleMapsLink(link: string) {
  const v = String(link || '').trim();
  const atMatch = v.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (atMatch) return { lat: atMatch[1], lon: atMatch[2] };
  const bangMatch = v.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (bangMatch) return { lat: bangMatch[1], lon: bangMatch[2] };
  const queryLatLonMatch = v.match(/[?&](?:query|q)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/i);
  if (queryLatLonMatch) return { lat: queryLatLonMatch[1], lon: queryLatLonMatch[2] };
  return null;
}

function extractQueryFromLink(link: string) {
  const v = String(link || '').trim();
  const queryMatch = v.match(/[?&](?:query|q)=([^&]+)/i);
  if (queryMatch) {
    try {
      return decodeURIComponent(queryMatch[1].replace(/\+/g, ' ')).trim();
    } catch {
      return String(queryMatch[1] || '').trim();
    }
  }
  const placeMatch = v.match(/\/place\/([^/]+)/i);
  if (placeMatch) {
    try {
      return decodeURIComponent(placeMatch[1].replace(/\+/g, ' ')).trim();
    } catch {
      return String(placeMatch[1] || '').trim();
    }
  }
  return null;
}

async function fetchJson(url: string) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'ExpPlanObras/1.0 (geo)',
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    const data: any = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(id);
  }
}

function isAllowedMapsHost(hostname: string) {
  const host = String(hostname || '').toLowerCase();
  return (
    host === 'maps.app.goo.gl' ||
    host === 'goo.gl' ||
    host.endsWith('.goo.gl') ||
    host === 'google.com' ||
    host.endsWith('.google.com') ||
    host === 'www.google.com'
  );
}

async function resolveFinalUrl(inputUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(inputUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (!isAllowedMapsHost(parsed.hostname)) return null;

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(parsed.toString(), {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'ExpPlanObras/1.0 (geo)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: controller.signal,
    });
    return typeof res.url === 'string' && res.url.length > 0 ? res.url : null;
  } catch {
    return null;
  } finally {
    clearTimeout(id);
  }
}

function mapNominatimAddress(addr: any) {
  const street = typeof addr?.road === 'string' ? addr.road : '';
  const number = typeof addr?.house_number === 'string' ? addr.house_number : '';
  const neighborhood =
    typeof addr?.suburb === 'string'
      ? addr.suburb
      : typeof addr?.neighbourhood === 'string'
        ? addr.neighbourhood
        : typeof addr?.city_district === 'string'
          ? addr.city_district
          : '';
  const city =
    typeof addr?.city === 'string'
      ? addr.city
      : typeof addr?.town === 'string'
        ? addr.town
        : typeof addr?.village === 'string'
          ? addr.village
          : '';
  const state = typeof addr?.state === 'string' ? addr.state : '';
  const cep = typeof addr?.postcode === 'string' ? String(addr.postcode).replace(/\D+/g, '') : '';
  return { street, number, neighborhood, city, state, cep };
}

function normalizeCEP(cep: string) {
  const v = String(cep || '').replace(/\D+/g, '');
  if (v.length !== 8) throw new Error('CEP inválido');
  return v;
}

export default async function geoRoutes(server: FastifyInstance) {
  server.post(
    '/maps/resolve',
    {
      schema: {
        body: z.object({ link: z.string().min(3) }),
      },
    },
    async (request, reply) => {
      const { link } = request.body as { link: string };
      let latLng = extractLatLngFromGoogleMapsLink(link);
      let q = extractQueryFromLink(link);
      let resolvedLink = String(link || '').trim();

      if (!latLng && (!q || q.length === 0)) {
        const finalUrl = await resolveFinalUrl(resolvedLink);
        if (finalUrl) {
          resolvedLink = finalUrl;
          latLng = extractLatLngFromGoogleMapsLink(resolvedLink);
          q = extractQueryFromLink(resolvedLink);
        }
      }

      if (latLng) {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${encodeURIComponent(
          latLng.lat
        )}&lon=${encodeURIComponent(latLng.lon)}`;
        const res = await fetchJson(url);
        if (!res.ok) return reply.code(400).send({ message: 'Falha ao consultar endereço' });
        const mapped = mapNominatimAddress(res.data?.address);
        return reply.send({
          source: 'MAPS',
          ...mapped,
          latitude: String(res.data?.lat || latLng.lat),
          longitude: String(res.data?.lon || latLng.lon),
        });
      }

      if (q && q.length > 0) {
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=1&q=${encodeURIComponent(
          q
        )}`;
        const res = await fetchJson(url);
        if (!res.ok) return reply.code(400).send({ message: 'Falha ao consultar endereço' });
        const item = Array.isArray(res.data) ? res.data[0] : null;
        if (!item) return reply.code(404).send({ message: 'Endereço não encontrado' });
        const mapped = mapNominatimAddress(item?.address);
        return reply.send({
          source: 'MAPS',
          ...mapped,
          latitude: String(item?.lat || ''),
          longitude: String(item?.lon || ''),
        });
      }

      return reply.code(400).send({ message: 'Link inválido para busca' });
    }
  );

  server.post(
    '/cep/resolve',
    {
      schema: {
        body: z.object({ cep: z.string().min(1) }),
      },
    },
    async (request, reply) => {
      const { cep } = request.body as { cep: string };
      let clean: string;
      try {
        clean = normalizeCEP(cep);
      } catch (e: any) {
        return reply.code(400).send({ message: e.message || 'CEP inválido' });
      }

      const url = `https://viacep.com.br/ws/${encodeURIComponent(clean)}/json/`;
      const res = await fetchJson(url);
      if (!res.ok) return reply.code(400).send({ message: 'Falha ao consultar CEP' });
      if (res.data?.erro) return reply.code(404).send({ message: 'CEP não encontrado' });

      return reply.send({
        source: 'CEP',
        street: String(res.data?.logradouro || ''),
        neighborhood: String(res.data?.bairro || ''),
        city: String(res.data?.localidade || ''),
        state: String(res.data?.uf || ''),
        cep: clean,
      });
    }
  );

  server.post(
    '/geocode',
    {
      schema: {
        body: z.object({ query: z.string().min(3) }),
      },
    },
    async (request, reply) => {
      const { query } = request.body as { query: string };
      const q = String(query || '').trim();
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=0&limit=1&q=${encodeURIComponent(
        q
      )}`;
      const res = await fetchJson(url);
      if (!res.ok) return reply.code(400).send({ message: 'Falha ao consultar geocodificação' });
      const item = Array.isArray(res.data) ? res.data[0] : null;
      if (!item) return reply.code(404).send({ message: 'Localização não encontrada' });
      return reply.send({ latitude: String(item?.lat || ''), longitude: String(item?.lon || '') });
    }
  );

  server.get(
    '/ibge/municipios',
    {
      schema: {
        querystring: z.object({ uf: z.string().length(2) }),
      },
    },
    async (request, reply) => {
      const { uf } = request.query as { uf: string };
      const UF = String(uf || '').toUpperCase();
      const url = `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${encodeURIComponent(UF)}/municipios`;
      const res = await fetchJson(url);
      if (!res.ok) return reply.code(400).send({ message: 'Falha ao consultar municípios' });
      const list = Array.isArray(res.data) ? res.data : [];
      return reply.send(
        list
          .map((m: any) => String(m?.nome || '').trim())
          .filter((n: string) => n.length > 0)
          .sort((a: string, b: string) => a.localeCompare(b))
      );
    }
  );

  server.get(
    '/ibge/search-city',
    {
      schema: {
        querystring: z.object({ name: z.string().min(2) }),
      },
    },
    async (request, reply) => {
      const { name } = request.query as { name: string };
      const q = String(name || '').trim();
      const url = `https://servicodados.ibge.gov.br/api/v1/localidades/municipios?nome=${encodeURIComponent(q)}`;
      const res = await fetchJson(url);
      if (!res.ok) return reply.code(400).send({ message: 'Falha ao consultar cidade' });
      const list = Array.isArray(res.data) ? res.data : [];
      const mapped = list
        .map((m: any) => ({
          city: String(m?.nome || '').trim(),
          uf: String(m?.microrregiao?.mesorregiao?.UF?.sigla || '').trim(),
        }))
        .filter((x: any) => x.city.length > 0 && x.uf.length === 2);
      return reply.send(mapped);
    }
  );

  server.get(
    '/cep/search',
    {
      schema: {
        querystring: z.object({
          uf: z.string().length(2),
          city: z.string().min(2),
          street: z.string().min(2),
        }),
      },
    },
    async (request, reply) => {
      const { uf, city, street } = request.query as { uf: string; city: string; street: string };
      const UF = String(uf || '').toUpperCase();
      const c = String(city || '').trim();
      const s = String(street || '').trim();
      const url = `https://viacep.com.br/ws/${encodeURIComponent(UF)}/${encodeURIComponent(c)}/${encodeURIComponent(
        s
      )}/json/`;
      const res = await fetchJson(url);
      if (!res.ok) return reply.code(400).send({ message: 'Falha ao consultar CEP' });
      const list = Array.isArray(res.data) ? res.data : [];
      const ceps = list
        .map((i: any) => String(i?.cep || '').replace(/\D+/g, ''))
        .filter((v: string) => v.length === 8);
      const unique = Array.from(new Set(ceps));
      return reply.send(unique);
    }
  );
}
