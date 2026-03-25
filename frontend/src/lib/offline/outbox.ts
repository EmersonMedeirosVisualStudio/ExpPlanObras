import { idbDelete, idbGetAll, idbPut } from './db';
import type { OfflineOutboxItem, OfflineOutboxStatus } from './types';

function nowIso() {
  return new Date().toISOString();
}

function uuidLike() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

export async function enqueueOutboxItem(input: Omit<OfflineOutboxItem, 'id' | 'operacaoUuid' | 'status' | 'tentativas' | 'criadoEm' | 'atualizadoEm'>) {
  const id = uuidLike();
  const item: OfflineOutboxItem = {
    ...input,
    id,
    operacaoUuid: uuidLike(),
    status: 'PENDENTE',
    tentativas: 0,
    criadoEm: nowIso(),
    atualizadoEm: nowIso(),
  };
  await idbPut('outbox', item);
  return item;
}

export async function listOutbox(): Promise<OfflineOutboxItem[]> {
  const items = await idbGetAll<OfflineOutboxItem>('outbox');
  return items.sort((a, b) => (a.criadoEm < b.criadoEm ? -1 : 1));
}

export async function countPendingOutbox(): Promise<number> {
  const items = await listOutbox();
  return items.filter((i) => i.status === 'PENDENTE' || i.status === 'ERRO' || i.status === 'CONFLITO').length;
}

export async function updateOutboxStatus(id: string, status: OfflineOutboxStatus) {
  const items = await listOutbox();
  const it = items.find((x) => x.id === id);
  if (!it) return;
  const next: OfflineOutboxItem = { ...it, status, atualizadoEm: nowIso(), tentativas: status === 'ENVIANDO' ? it.tentativas + 1 : it.tentativas };
  await idbPut('outbox', next);
}

export async function removeOutboxItem(id: string) {
  await idbDelete('outbox', id);
}

