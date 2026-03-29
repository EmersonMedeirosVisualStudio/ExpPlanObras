import type { PlaybookActionExecutor, PlaybookActionType } from './types.js';
import { authExecutors } from './executors/auth.js';
import { incidentExecutors } from './executors/incidents.js';
import { complianceExecutors } from './executors/compliance.js';
import { legalHoldExecutors } from './executors/legal-hold.js';

const executors: PlaybookActionExecutor[] = [...authExecutors, ...incidentExecutors, ...complianceExecutors, ...legalHoldExecutors];
const map = new Map<PlaybookActionType, PlaybookActionExecutor>(executors.map((e) => [e.type, e]));

export function getPlaybookActionExecutor(type: PlaybookActionType): PlaybookActionExecutor | null {
  return map.get(type) || null;
}

