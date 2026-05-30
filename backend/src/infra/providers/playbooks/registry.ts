import type { PlaybookActionExecutor, PlaybookActionType } from '@/infra/providers/playbooks/types.js';
import { authExecutors } from '@/infra/providers/playbooks/executors/auth.js';
import { incidentExecutors } from '@/infra/providers/playbooks/executors/incidents.js';
import { complianceExecutors } from '@/infra/providers/playbooks/executors/compliance.js';
import { legalHoldExecutors } from '@/infra/providers/playbooks/executors/legal-hold.js';

const executors: PlaybookActionExecutor[] = [...authExecutors, ...incidentExecutors, ...complianceExecutors, ...legalHoldExecutors];
const map = new Map<PlaybookActionType, PlaybookActionExecutor>(executors.map((e) => [e.type, e]));

export function getPlaybookActionExecutor(type: PlaybookActionType): PlaybookActionExecutor | null {
  return map.get(type) || null;
}

