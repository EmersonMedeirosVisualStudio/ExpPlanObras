import prisma from '@/plugins/prisma.js';
import { normalizeEvent } from '@/modules/observabilidade/normalize.js';
import { redactPayload } from '@/modules/observabilidade/redaction.js';

export async function emitObservabilityEvent(args: any) {
  const tenantId = Number(args.tenantId);
  if (!tenantId) return { ok: false, reason: 'tenantId ausente' };
  const norm = normalizeEvent(args);
  const redacted = args.payload ? redactPayload(args.payload) : null;
  const created = await prisma.observabilidadeEvento.create({
    data: {
      tenantId,
      ...norm,
      payloadRedactedJson: redacted,
    },
  });
  return { ok: true, id: created.id, eventId: created.eventId };
}
