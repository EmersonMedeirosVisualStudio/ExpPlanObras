import prisma from '../../../plugins/prisma.js';
import type { PlaybookActionExecutor } from '../types.js';

export const incidentExecutors: PlaybookActionExecutor[] = [
  {
    type: 'ABRIR_INCIDENTE',
    async execute(input) {
      if (input.incidenteId) return { ok: true, incidenteId: input.incidenteId, output: { incidenteId: input.incidenteId } };
      const tipo = String(input.configuracao?.tipoIncidente || 'SEGURANCA');
      const titulo = String(input.configuracao?.titulo || 'Incidente aberto via playbook');
      const descricao = input.configuracao?.descricao != null ? String(input.configuracao.descricao) : null;
      const criticidade = String(input.configuracao?.criticidade || 'MEDIA');
      const ownerUserId = input.configuracao?.ownerUserId != null ? Number(input.configuracao.ownerUserId) : null;
      const created = await prisma.observabilidadeIncidente.create({
        data: {
          tenantId: input.tenantId,
          alertaOrigemId: input.alertaId ?? null,
          tipoIncidente: tipo,
          titulo,
          descricao,
          criticidade,
          statusIncidente: 'ABERTO',
          ownerUserId: ownerUserId || null,
        } as any,
      });
      if (input.eventoOrigemId) {
        await prisma.observabilidadeIncidenteEvento.create({
          data: { tenantId: input.tenantId, incidenteId: created.id, eventoId: input.eventoOrigemId },
        });
      }
      await prisma.observabilidadeIncidenteTimeline.create({
        data: {
          tenantId: input.tenantId,
          incidenteId: created.id,
          tipoEventoTimeline: 'INCIDENTE_ABERTO',
          titulo: 'Incidente aberto',
          descricao: 'Abertura automática via playbook',
          autorUserId: input.executorUserId,
          metadataJson: { playbookId: input.playbookId, execucaoId: input.execucaoId, passoId: input.passoId },
        },
      });
      return { ok: true, incidenteId: created.id, output: { incidenteId: created.id } };
    },
  },
];

