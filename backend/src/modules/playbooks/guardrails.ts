import type { PlaybookApprovalPolicy, PlaybookRiskLevel, PlaybookActionType } from './types.js';

const riskRank: Record<PlaybookRiskLevel, number> = { BAIXO: 1, MEDIO: 2, ALTO: 3, CRITICO: 4 };

const alwaysApproval: Set<PlaybookActionType> = new Set(['USUARIO_BLOQUEAR_TEMPORARIAMENTE', 'TOKEN_REVOGAR', 'EXPORTACOES_SENSIVEIS_PAUSAR', 'INTEGRACAO_DESABILITAR', 'LEGAL_HOLD_APLICAR']);

export function maxRisk(a: PlaybookRiskLevel, b: PlaybookRiskLevel): PlaybookRiskLevel {
  return riskRank[a] >= riskRank[b] ? a : b;
}

export function needsApproval(args: { policy: PlaybookApprovalPolicy; riskMax: PlaybookRiskLevel; actionTypes: PlaybookActionType[] }) {
  if (args.actionTypes.some((t) => alwaysApproval.has(t))) return true;
  if (args.policy === 'NAO_EXIGE') return false;
  if (args.policy === 'EXIGE_ANTES') return true;
  if (args.policy === 'QUATRO_OLHOS') return true;
  if (args.policy === 'EXIGE_SE_RISCO_ALTO') return args.riskMax === 'ALTO' || args.riskMax === 'CRITICO';
  return true;
}

