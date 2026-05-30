import { ExpireTrials } from "@/application/use-cases/maintenance/commands/ExpireTrials.js";
import { ProcessSubscriptionsDaily } from "@/application/use-cases/maintenance/commands/ProcessSubscriptionsDaily.js";
import { PurgeExpiredTenants } from "@/application/use-cases/maintenance/commands/PurgeExpiredTenants.js";
import { PrismaMaintenanceRepository } from "@/infra/database/repositories/PrismaMaintenanceRepository.js";

export function makeMaintenanceUseCases() {
  const repo = new PrismaMaintenanceRepository();
  return {
    purge: new PurgeExpiredTenants(repo),
    expireTrials: new ExpireTrials(repo),
    processDaily: new ProcessSubscriptionsDaily(repo),
  };
}
