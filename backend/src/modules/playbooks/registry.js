import { authExecutors } from './executors/auth.js';
import { incidentExecutors } from './executors/incidents.js';
import { complianceExecutors } from './executors/compliance.js';
import { legalHoldExecutors } from './executors/legal-hold.js';
const executors = [...authExecutors, ...incidentExecutors, ...complianceExecutors, ...legalHoldExecutors];
const map = new Map(executors.map((e) => [e.type, e]));
export function getPlaybookActionExecutor(type) {
    return map.get(type) || null;
}
