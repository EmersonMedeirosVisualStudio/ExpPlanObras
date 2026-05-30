import { PrismaAdminRepository } from '@/infra/database/repositories/PrismaAdminRepository.js'
import { AcceptClaimAsAdmin } from '@/application/use-cases/admin/commands/AcceptClaimAsAdmin.js'
import { ActivateTenantSubscription } from '@/application/use-cases/admin/commands/ActivateTenantSubscription.js'
import { AddTenantHistory } from '@/application/use-cases/admin/commands/AddTenantHistory.js'
import { CreateTenantByAdmin } from '@/application/use-cases/admin/commands/CreateTenantByAdmin.js'
import { DeleteTenant } from '@/application/use-cases/admin/commands/DeleteTenant.js'
import { ManualGrantTenantAccess } from '@/application/use-cases/admin/commands/ManualGrantTenantAccess.js'
import { ResetRepresentativePassword } from '@/application/use-cases/admin/commands/ResetRepresentativePassword.js'
import { RevokeManualTenantAccess } from '@/application/use-cases/admin/commands/RevokeManualTenantAccess.js'
import { UpdateTenant } from '@/application/use-cases/admin/commands/UpdateTenant.js'
import { UploadTenantHistoryAttachment } from '@/application/use-cases/admin/commands/UploadTenantHistoryAttachment.js'
import { GetAllTenants } from '@/application/use-cases/admin/queries/GetAllTenants.js'
import { GetHistoryAttachment } from '@/application/use-cases/admin/queries/GetHistoryAttachment.js'
import { GetTenantHistory } from '@/application/use-cases/admin/queries/GetTenantHistory.js'

export function makeAdminUseCases() {
  const repo = new PrismaAdminRepository()
  return {
    createTenant: new CreateTenantByAdmin(repo),
    updateTenant: new UpdateTenant(repo),
    deleteTenant: new DeleteTenant(repo),
    activateSubscription: new ActivateTenantSubscription(repo),
    grantAccess: new ManualGrantTenantAccess(repo),
    revokeAccess: new RevokeManualTenantAccess(repo),
    acceptClaim: new AcceptClaimAsAdmin(repo),
    resetPassword: new ResetRepresentativePassword(repo),
    addHistory: new AddTenantHistory(repo),
    uploadHistoryAttachment: new UploadTenantHistoryAttachment(repo),
    getAllTenants: new GetAllTenants(repo),
    getTenantHistory: new GetTenantHistory(repo),
    getHistoryAttachment: new GetHistoryAttachment(repo),
  }
}
