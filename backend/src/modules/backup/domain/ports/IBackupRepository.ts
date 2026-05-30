export interface IBackupRepository {
  export(tenantId: number): Promise<unknown>
  restore(tenantId: number, backup: unknown): Promise<unknown>
}
