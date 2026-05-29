import { TenantAccessDeniedError } from '../../domain/errors/AuthErrors.js';
import { assertTenantActive, buildSubscriptionAlert } from '../../domain/entities/Tenant.js';
export class SelectTenantUseCase {
    userRepo;
    tenantRepo;
    resolveSessionAccess;
    constructor(userRepo, tenantRepo, resolveSessionAccess) {
        this.userRepo = userRepo;
        this.tenantRepo = tenantRepo;
        this.resolveSessionAccess = resolveSessionAccess;
    }
    async execute(userId, tenantId, app) {
        const tenantUser = await this.tenantRepo.findTenantUser(tenantId, userId);
        if (!tenantUser)
            throw new TenantAccessDeniedError();
        assertTenantActive(tenantUser.tenant);
        const subscriptionAlert = buildSubscriptionAlert(tenantUser.tenant);
        const session = await this.resolveSessionAccess(userId, tenantId, tenantUser.role);
        const allTenants = await this.tenantRepo.getUserTenants(userId);
        const user = await this.userRepo.findById(userId);
        const token = app.jwt.sign({ userId, tenantId, role: tenantUser.role, email: user?.email ?? '' });
        return {
            token,
            subscriptionAlert,
            user: {
                id: userId,
                email: user?.email ?? '',
                name: user?.name ?? '',
                cpf: user?.cpf ?? null,
                perfis: session.perfis,
                permissoes: session.permissoes,
                abrangencia: session.abrangencia,
                tenants: allTenants.map((t) => ({ tenantId: t.tenantId, role: t.role, name: t.name, slug: t.slug })),
            },
        };
    }
}
