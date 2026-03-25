import type { WorkflowEntityHandler } from './types-internal';
import { backupRestauracaoWorkflowHandler } from './handlers/backup-restauracao';

export const WORKFLOW_ENTITY_HANDLERS: WorkflowEntityHandler[] = [backupRestauracaoWorkflowHandler];

export function getWorkflowHandler(entidadeTipo: string): WorkflowEntityHandler | null {
  const tipo = String(entidadeTipo || '').trim().toUpperCase();
  return WORKFLOW_ENTITY_HANDLERS.find((h) => h.entidadeTipo.toUpperCase() === tipo) ?? null;
}

