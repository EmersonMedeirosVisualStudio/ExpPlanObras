import type { PlaybookActionExecutor, PlaybookActionType } from '@/modules/playbooks/types.js';
import { authExecutors } from '@/modules/playbooks/executors/auth.js';
import { incidentExecutors } from '@/modules/playbooks/executors/incidents.js';
import { complianceExecutors } from '@/modules/playbooks/executors/compliance.js';
import { legalHoldExecutors } from '@/modules/playbooks/executors/legal-hold.js';

const executors: PlaybookActionExecutor[] = [...authExecutors, ...incidentExecutors, ...complianceExecutors, ...legalHoldExecutors];
const map = new Map<PlaybookActionType, PlaybookActionExecutor>(executors.map((e) => [e.type, e]));

export function getPlaybookActionExecutor(type: PlaybookActionType): PlaybookActionExecutor | null {
  return map.get(type) || null;
}

