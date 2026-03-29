import prisma from '../../../plugins/prisma.js';
import type { PlaybookActionExecutor } from '../types.js';

export const complianceExecutors: PlaybookActionExecutor[] = [
  {
    type: 'CRIAR_CASO_COMPLIANCE',
    async execute(input) {
      const incidenteId = input.incidenteId ? Number(input.incidenteId) : Number(input.configuracao?.incidenteId || 0);
      if (!incidenteId) return { ok: false, error: 'incidenteId ausente' };
      const tipoCaso = String(input.configuracao?.tipoCaso || 'SEGURANCA');
      const criticidade = String(input.configuracao?.criticidade || 'MEDIA');
      const ownerUserId = input.configuracao?.ownerUserId != null ? Number(input.configuracao.ownerUserId) : null;
      const prazoRespostaEm = input.configuracao?.prazoRespostaEm ? new Date(String(input.configuracao.prazoRespostaEm)) : null;
      const prazoConclusaoEm = input.configuracao?.prazoConclusaoEm ? new Date(String(input.configuracao.prazoConclusaoEm)) : null;
      const created = await prisma.observabilidadeCasoCompliance.create({
        data: {
          tenantId: input.tenantId,
          incidenteId,
          tipoCaso,
          statusCaso: 'ABERTO',
          criticidade,
          ownerUserId,
          prazoRespostaEm,
          prazoConclusaoEm,
        } as any,
      });
      await prisma.observabilidadeIncidenteTimeline.create({
        data: {
          tenantId: input.tenantId,
          incidenteId,
          tipoEventoTimeline: 'COMPLIANCE_CASO_ABERTO',
          titulo: 'Caso de compliance aberto',
          descricao: `Caso ${tipoCaso} aberto via playbook`,
          autorUserId: input.executorUserId,
          metadataJson: { casoId: created.id, playbookId: input.playbookId, execucaoId: input.execucaoId, passoId: input.passoId },
        },
      });
      return { ok: true, casoComplianceId: created.id, output: { casoId: created.id } };
    },
  },
];

