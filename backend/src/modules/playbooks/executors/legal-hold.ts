import type { PlaybookActionExecutor } from '../types.js';
import { aplicarLegalHoldPorCriteria } from '../../retencao/legal-hold.js';

export const legalHoldExecutors: PlaybookActionExecutor[] = [
  {
    type: 'LEGAL_HOLD_APLICAR',
    async execute(input) {
      const legalHoldId = Number(input.configuracao?.legalHoldId || 0);
      if (!legalHoldId) return { ok: false, error: 'legalHoldId ausente' };
      const criteriaJson = input.configuracao?.criteriaJson ?? input.configuracao?.criteria ?? null;
      if (!criteriaJson) return { ok: false, error: 'criteriaJson ausente' };
      const res = await aplicarLegalHoldPorCriteria({ tenantId: input.tenantId, userId: input.executorUserId, legalHoldId, criteriaJson });
      if (!res.ok) return { ok: false, error: res.reason || 'Falha ao aplicar hold' };
      return { ok: true, output: res };
    },
  },
];

