import { idbPut } from './db';
import { listOutbox, updateOutboxStatus } from './outbox';
import type { OfflineOutboxItem, SyncBatchRequestDTO, SyncBatchResponseDTO } from './types';

function nowIso() {
  return new Date().toISOString();
}

function uuidLike() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

function resolveSyncEndpoint(item: OfflineOutboxItem): string | null {
  const entidade = String(item.entidadeTipo || '').toUpperCase();
  if (item.modulo === 'RH' && entidade === 'PRESENCA') return '/api/v1/sync/rh/presencas';
  if (item.modulo === 'SST' && (entidade === 'CHECKLIST_EXECUCAO' || entidade === 'CHECKLIST')) return '/api/v1/sync/sst/checklists';
  if (item.modulo === 'SST' && entidade === 'SST_REGISTRO') return '/api/v1/sync/sst/registros';
  return null;
}

export async function syncNow() {
  const items = await listOutbox();
  const pendentes = items.filter((i) => i.status === 'PENDENTE' || i.status === 'ERRO' || i.status === 'CONFLITO');
  if (!pendentes.length) return { total: 0, applied: 0, duplicated: 0, conflicts: 0, rejected: 0 };

  const dispositivoId = uuidLike();
  const byEndpoint = new Map<string, OfflineOutboxItem[]>();
  for (const it of pendentes) {
    const endpoint = resolveSyncEndpoint(it);
    if (!endpoint) continue;
    if (!byEndpoint.has(endpoint)) byEndpoint.set(endpoint, []);
    byEndpoint.get(endpoint)!.push(it);
  }

  let applied = 0;
  let duplicated = 0;
  let conflicts = 0;
  let rejected = 0;

  for (const [endpoint, batchItems] of byEndpoint.entries()) {
    for (const it of batchItems) await updateOutboxStatus(it.id, 'ENVIANDO');

    const reqBody: SyncBatchRequestDTO = {
      dispositivoId,
      itens: batchItems.map((it) => ({
        operacaoUuid: it.operacaoUuid,
        tipoOperacao: it.tipoOperacao,
        entidadeServidorId: it.entidadeServidorId ?? undefined,
        entidadeLocalId: it.entidadeLocalId ?? undefined,
        baseVersion: it.baseVersion ?? null,
        payload: it.payload,
        clientTimestamp: nowIso(),
      })),
    };

    let resp: SyncBatchResponseDTO | null = null;
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reqBody) });
      resp = (await res.json()) as any;
      if (!res.ok || !resp?.resultados) throw new Error('Falha no sync');
    } catch {
      for (const it of batchItems) await updateOutboxStatus(it.id, 'ERRO');
      continue;
    }

    const results = resp.resultados || [];
    await idbPut('syncResults', { id: uuidLike(), endpoint, dispositivoId, criadoEm: nowIso(), resultados: results });

    for (const it of batchItems) {
      const r = results.find((x) => x.operacaoUuid === it.operacaoUuid);
      if (!r) {
        await updateOutboxStatus(it.id, 'ERRO');
        continue;
      }
      if (r.status === 'APLICADO') {
        applied++;
        await updateOutboxStatus(it.id, 'SINCRONIZADO');
        continue;
      }
      if (r.status === 'DUPLICADO') {
        duplicated++;
        await updateOutboxStatus(it.id, 'SINCRONIZADO');
        continue;
      }
      if (r.status === 'CONFLITO') {
        conflicts++;
        await updateOutboxStatus(it.id, 'CONFLITO');
        continue;
      }
      rejected++;
      await updateOutboxStatus(it.id, 'ERRO');
    }
  }

  return { total: pendentes.length, applied, duplicated, conflicts, rejected };
}

