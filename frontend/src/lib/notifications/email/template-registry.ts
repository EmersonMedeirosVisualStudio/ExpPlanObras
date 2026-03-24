import type { EmailTemplateBuildInput, EmailTemplateBuildOutput, NotificationEmailTemplateKey } from './types';
import { buildAlertaImediatoTemplate } from './templates/alerta-imediato';
import { buildDigestoDiarioTemplate } from './templates/digesto-diario';
import { buildDigestoSemanalTemplate } from './templates/digesto-semanal';
import { buildRelatorioAgendadoTemplate } from './templates/relatorio-agendado';

export function buildEmailTemplate(templateKey: NotificationEmailTemplateKey, input: EmailTemplateBuildInput): EmailTemplateBuildOutput {
  if (templateKey === 'ALERTA_IMEDIATO') return buildAlertaImediatoTemplate(input);
  if (templateKey === 'DIGESTO_DIARIO') return buildDigestoDiarioTemplate(input);
  if (templateKey === 'RELATORIO_AGENDADO') return buildRelatorioAgendadoTemplate(input);
  return buildDigestoSemanalTemplate(input);
}
