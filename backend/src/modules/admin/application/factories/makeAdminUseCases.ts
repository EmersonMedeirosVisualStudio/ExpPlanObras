import { PrismaAdminRepository } from '@/modules/admin/infrastructure/persistence/PrismaAdminRepository.js'
import { AcceptClaimAsAdmin } from '@/modules/admin/application/use-cases/commands/AcceptClaimAsAdmin.js'
import { ActivateTenantSubscription } from '@/modules/admin/application/use-cases/commands/ActivateTenantSubscription.js'
import { AddTenantHistory } from '@/modules/admin/application/use-cases/commands/AddTenantHistory.js'
import { CreateTenantByAdmin } from '@/modules/admin/application/use-cases/commands/CreateTenantByAdmin.js'
import { DeleteTenant } from '@/modules/admin/application/use-cases/commands/DeleteTenant.js'
import { ManualGrantTenantAccess } from '@/modules/admin/application/use-cases/commands/ManualGrantTenantAccess.js'
import { ResetRepresentativePassword } from '@/modules/admin/application/use-cases/commands/ResetRepresentativePassword.js'
import { RevokeManualTenantAccess } from '@/modules/admin/application/use-cases/commands/RevokeManualTenantAccess.js'
import { UpdateTenant } from '@/modules/admin/application/use-cases/commands/UpdateTenant.js'
import { UploadTenantHistoryAttachment } from '@/modules/admin/application/use-cases/commands/UploadTenantHistoryAttachment.js'
import { GetAllTenants } from '@/modules/admin/application/use-cases/queries/GetAllTenants.js'
import { GetHistoryAttachment } from '@/modules/admin/application/use-cases/queries/GetHistoryAttachment.js'
import { GetTenantHistory } from '@/modules/admin/application/use-cases/queries/GetTenantHistory.js'

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
