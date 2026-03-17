
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createTenantSchema, updateTenantSchema } from './admin.schema.js';
import { activateTenantSubscription, createTenantByAdmin, deleteTenant, getAllTenants, grantTenantAccessDays, manualGrantTenantAccess, updateTenant } from './admin.service.js';
import { checkSystemAdmin } from '../../utils/authenticate.js';
import prisma from '../../plugins/prisma.js';

function extractLatLngFromGoogleMapsLink(link: string) {
  const v = String(link || '').trim();
  const atMatch = v.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/);
  if (atMatch) return { lat: atMatch[1], lon: atMatch[2] };
  const bangMatch = v.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  if (bangMatch) return { lat: bangMatch[1], lon: bangMatch[2] };
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
        'User-Agent': 'ExpPlanObras/1.0 (admin maps resolve)',
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    const data: any = await res.json().catch(() => null);
    return { ok: res.ok, data };
  } finally {
    clearTimeout(id);
  }
}

function mapNominatimAddress(addr: any) {
  const street = typeof addr?.road === 'string' ? addr.road : '';
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
  return { street, neighborhood, city, state, cep };
}

export default async function adminRoutes(server: FastifyInstance) {
  server.addHook('onRequest', checkSystemAdmin);

  server.post(
    '/tenants',
    {
      schema: {
        body: createTenantSchema,
      },
    },
    async (request, reply) => {
      try {
        const result = await createTenantByAdmin(request.body as z.infer<typeof createTenantSchema>);
        const actorUserId = (request.user as any)?.userId;
        await prisma.tenantHistoryEntry.create({
          data: {
            tenantId: result.tenant.id,
            source: 'ADMIN',
            actorUserId: typeof actorUserId === 'number' ? actorUserId : null,
            message: 'Empresa cadastrada pelo administrador. Status: TEMPORARY (fase experimental).',
          },
        });
        return reply.code(201).send(result);
      } catch (error: any) {
        server.log.error(error);
        if (error.code === 'P2002') {
            return reply.code(409).send({ message: 'Email, CPF, CNPJ or Slug already exists' });
        }
        return reply.code(500).send({ message: error.message || 'Internal Server Error' });
      }
    }
  );

  server.get(
    '/tenants',
    async (request, reply) => {
        const tenants = await getAllTenants();
        return reply.send(tenants);
    }
  );

  server.post(
    '/maps/resolve',
    {
      schema: {
        body: z.object({ link: z.string().min(3) }),
      },
    },
    async (request, reply) => {
      const { link } = request.body as { link: string };
      const latLng = extractLatLngFromGoogleMapsLink(link);
      const q = extractQueryFromLink(link);

      if (latLng) {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&lat=${encodeURIComponent(
          latLng.lat
        )}&lon=${encodeURIComponent(latLng.lon)}`;
        const res = await fetchJson(url);
        if (!res.ok) return reply.code(400).send({ message: 'Falha ao consultar endereço' });
        const addr = res.data?.address;
        const mapped = mapNominatimAddress(addr);
        return reply.send({
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
          ...mapped,
          latitude: String(item?.lat || ''),
          longitude: String(item?.lon || ''),
        });
      }

      return reply.code(400).send({ message: 'Link inválido para busca' });
    }
  );

  server.put(
    '/tenants/:id',
    {
      schema: {
        params: z.object({
            id: z.coerce.number().int()
        }),
        body: updateTenantSchema
      }
    },
    async (request, reply) => {
        const { id } = request.params as { id: number };
        try {
            const before = await prisma.tenant.findUnique({ where: { id } });
            const tenant = await updateTenant(id, request.body as z.infer<typeof updateTenantSchema>);
            const actorUserId = (request.user as any)?.userId;
            const changes: string[] = [];
            if (before) {
              const body = request.body as any;
              if (typeof body.status === 'string' && body.status !== before.status) changes.push(`Status: ${before.status} → ${body.status}`);
              if (typeof body.subscriptionStatus === 'string' && body.subscriptionStatus !== before.subscriptionStatus) changes.push(`Assinatura: ${before.subscriptionStatus} → ${body.subscriptionStatus}`);
              if (typeof body.link === 'string' && body.link !== (before as any).link) changes.push(`Link atualizado`);
              if (typeof body.street === 'string' && body.street !== (before as any).street) changes.push(`Rua atualizada`);
              if (typeof body.city === 'string' && body.city !== (before as any).city) changes.push(`Cidade atualizada`);
              if (typeof body.state === 'string' && body.state !== (before as any).state) changes.push(`UF atualizada`);
              if (typeof body.cep === 'string' && body.cep !== (before as any).cep) changes.push(`CEP atualizado`);
            } else {
              changes.push('Atualização aplicada');
            }
            if (changes.length > 0) {
              await prisma.tenantHistoryEntry.create({
                data: {
                  tenantId: id,
                  source: 'ADMIN',
                  actorUserId: typeof actorUserId === 'number' ? actorUserId : null,
                  message: `Edição pelo administrador: ${changes.join('; ')}`,
                },
              });
            }
            return reply.send(tenant);
        } catch (error: any) {
            server.log.error(error);
            return reply.code(500).send({ message: error.message || 'Error updating tenant' });
        }
    }
  );

  server.post(
    '/tenants/:id/activate',
    {
      schema: {
        params: z.object({
          id: z.coerce.number().int(),
        }),
        body: z.object({
          months: z.coerce.number().int().min(1).max(36).default(1),
        }),
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: number };
      const { months } = request.body as { months: number };
      const tenant = await activateTenantSubscription(id, months);
      const actorUserId = (request.user as any)?.userId;
      await prisma.tenantHistoryEntry.create({
        data: {
          tenantId: id,
          source: 'ADMIN',
          actorUserId: typeof actorUserId === 'number' ? actorUserId : null,
          message: `Liberação manual: assinatura ativada por ${months} mês(es). Status: ACTIVE.`,
        },
      });
      return reply.send(tenant);
    }
  );

  server.post(
    '/tenants/:id/grant-access',
    {
      schema: {
        params: z.object({
          id: z.coerce.number().int(),
        }),
        body: z.object({
          days: z.coerce.number().int(),
        }),
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: number };
      const { days } = request.body as { days: number };
      if (![30, 60, 90, 365].includes(days)) {
        return reply.code(400).send({ message: 'Dias inválidos' });
      }
      const tenant = await grantTenantAccessDays(id, days);
      const actorUserId = (request.user as any)?.userId;
      await prisma.tenantHistoryEntry.create({
        data: {
          tenantId: id,
          source: 'ADMIN',
          actorUserId: typeof actorUserId === 'number' ? actorUserId : null,
          message: `Liberação manual. Motivo: Pagamento confirmado. Prazo: ${days} dia(s). Status: ${String((tenant as any).subscriptionStatus || 'ACTIVE')}.`,
        },
      });
      return reply.send(tenant);
    }
  );

  server.post(
    '/tenants/:id/manual-grant',
    {
      schema: {
        params: z.object({
          id: z.coerce.number().int(),
        }),
        body: z.object({
          reason: z.enum(['PAYMENT', 'TRIAL_EXTENSION']),
          days: z.coerce.number().int(),
        }),
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: number };
      const { reason, days } = request.body as { reason: 'PAYMENT' | 'TRIAL_EXTENSION'; days: number };
      const tenantBefore = await prisma.tenant.findUnique({
        where: { id },
        select: { status: true, subscriptionStatus: true, trialEndsAt: true, paidUntil: true, gracePeriodEndsAt: true },
      });

      const tenant = await manualGrantTenantAccess(id, { reason, days });
      const actorUserId = (request.user as any)?.userId;

      const reasonLabel = reason === 'PAYMENT' ? 'Pagamento confirmado' : 'Extensão do período de teste';
      const beforeStatus = tenantBefore?.status ? String(tenantBefore.status) : '?';
      const beforeSub = tenantBefore?.subscriptionStatus ? String(tenantBefore.subscriptionStatus) : '?';
      const afterStatus = String((tenant as any).status || '');
      const afterSub = String((tenant as any).subscriptionStatus || '');
      const until =
        reason === 'PAYMENT'
          ? (tenant as any).paidUntil
            ? new Date((tenant as any).paidUntil).toISOString()
            : ''
          : (tenant as any).trialEndsAt
            ? new Date((tenant as any).trialEndsAt).toISOString()
            : '';

      await prisma.tenantHistoryEntry.create({
        data: {
          tenantId: id,
          source: 'ADMIN',
          actorUserId: typeof actorUserId === 'number' ? actorUserId : null,
          message: `Liberação manual. Motivo: ${reasonLabel}. Prazo: ${days} dia(s). ${beforeStatus}/${beforeSub} → ${afterStatus}/${afterSub}${until ? `. Válido até: ${until}.` : '.'}`,
        },
      });

      return reply.send(tenant);
    }
  );

  server.get(
    '/tenants/:id/history',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int() }),
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: number };
      const items = await prisma.tenantHistoryEntry.findMany({
        where: { tenantId: id },
        orderBy: { createdAt: 'desc' },
        include: {
          attachments: { select: { id: true, entryId: true, url: true, filename: true, mimeType: true } },
          actorUser: { select: { id: true, name: true, email: true } },
        },
      });
      return reply.send(items);
    }
  );

  server.post(
    '/tenants/:id/history',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int() }),
        body: z.object({
          message: z.string().min(1),
          attachmentUrls: z.array(z.string()).optional(),
        }),
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: number };
      const { message, attachmentUrls } = request.body as { message: string; attachmentUrls?: string[] };
      const actorUserId = (request.user as any)?.userId;
      const entry = await prisma.tenantHistoryEntry.create({
        data: {
          tenantId: id,
          source: 'ADMIN',
          actorUserId: typeof actorUserId === 'number' ? actorUserId : null,
          message,
        },
      });
      const urls = (attachmentUrls || []).map((u) => String(u || '').trim()).filter((u) => u.length > 0);
      if (urls.length > 0) {
        await prisma.tenantHistoryAttachment.createMany({
          data: urls.map((url) => ({ entryId: entry.id, url })),
        });
      }
      const full = await prisma.tenantHistoryEntry.findUnique({
        where: { id: entry.id },
        include: {
          attachments: { select: { id: true, entryId: true, url: true, filename: true, mimeType: true } },
          actorUser: { select: { id: true, name: true, email: true } },
        },
      });
      return reply.code(201).send(full);
    }
  );

  server.post(
    '/tenants/:id/history/upload',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int() }),
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: number };
      const actorUserId = (request.user as any)?.userId;

      const parts = (request as any).parts();
      let message = '';
      const files: Array<{ filename: string; mimetype: string; buffer: Buffer }> = [];

      for await (const part of parts) {
        if (part.type === 'field' && part.fieldname === 'message') {
          message = String(part.value || '');
          continue;
        }
        if (part.type === 'file' && part.filename) {
          const mimetype = String(part.mimetype || '');
          if (!mimetype.startsWith('image/')) {
            return reply.code(400).send({ message: 'Apenas imagens são aceitas' });
          }
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) {
            chunks.push(chunk as Buffer);
          }
          files.push({ filename: String(part.filename), mimetype, buffer: Buffer.concat(chunks) });
        }
      }

      if (!message || message.trim().length === 0) {
        return reply.code(400).send({ message: 'Mensagem obrigatória' });
      }
      if (files.length === 0) {
        return reply.code(400).send({ message: 'Envie ao menos 1 imagem' });
      }

      const entry = await prisma.tenantHistoryEntry.create({
        data: {
          tenantId: id,
          source: 'ADMIN',
          actorUserId: typeof actorUserId === 'number' ? actorUserId : null,
          message: message.trim(),
        },
      });

      await prisma.tenantHistoryAttachment.createMany({
        data: files.map((f) => ({
          entryId: entry.id,
          url: null,
          filename: f.filename,
          mimeType: f.mimetype,
          data: Buffer.from(f.buffer),
        })),
      });

      const full = await prisma.tenantHistoryEntry.findUnique({
        where: { id: entry.id },
        include: {
          attachments: { select: { id: true, entryId: true, url: true, filename: true, mimeType: true } },
          actorUser: { select: { id: true, name: true, email: true } },
        },
      });
      return reply.code(201).send(full);
    }
  );

  server.get(
    '/tenant-history/attachments/:id',
    {
      schema: {
        params: z.object({ id: z.coerce.number().int() }),
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: number };
      const att = await prisma.tenantHistoryAttachment.findUnique({
        where: { id },
        select: { id: true, url: true, filename: true, mimeType: true, data: true },
      });
      if (!att) return reply.code(404).send({ message: 'Anexo não encontrado' });

      if (att.url && (!att.data || (att.data as any).length === 0)) {
        return reply.redirect(att.url);
      }
      if (!att.data) return reply.code(404).send({ message: 'Arquivo não encontrado' });

      reply.header('content-type', att.mimeType || 'application/octet-stream');
      const name = att.filename || `anexo-${att.id}`;
      reply.header('content-disposition', `inline; filename="${name}"`);
      return reply.send(att.data);
    }
  );

  server.delete(
    '/tenants/:id',
    {
        schema: {
            params: z.object({
                id: z.coerce.number().int()
            })
        }
    },
    async (request, reply) => {
        const { id } = request.params as { id: number };
        try {
            await deleteTenant(id);
            return reply.code(204).send();
        } catch (error) {
            return reply.code(404).send({ message: 'Tenant not found' });
        }
    }
  );
}
