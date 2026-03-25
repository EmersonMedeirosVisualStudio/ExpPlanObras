import type { ApprovalEntityHandler } from './types-internal';
import { backupRestauracaoApprovalHandler } from './handlers/backup-restauracao';

export const APPROVAL_ENTITY_HANDLERS: ApprovalEntityHandler[] = [backupRestauracaoApprovalHandler];

export function getApprovalHandler(entidadeTipo: string): ApprovalEntityHandler | null {
  const tipo = String(entidadeTipo || '').trim().toUpperCase();
  return APPROVAL_ENTITY_HANDLERS.find((h) => h.entidadeTipo.toUpperCase() === tipo) ?? null;
}

