export interface IMaintenanceRepository {
  purgeExpiredTenants(): Promise<{ purged: number }>
  expireTrials(): Promise<{ updated: number }>
  processSubscriptionsDaily(): Promise<{ toGrace: number; toExpired: number }>
}
