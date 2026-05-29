import bcrypt from 'bcryptjs';
import { assertTenantActive, buildSubscriptionAlert } from '../../domain/entities/Tenant.js';
import { InvalidCredentialsError } from '../../domain/errors/AuthErrors.js';
export class LoginUseCase {
    userRepo;
    tenantRepo;
    resolveSessionAccess;
    constructor(userRepo, tenantRepo, resolveSessionAccess) {
        this.userRepo = userRepo;
        this.tenantRepo = tenantRepo;
        this.resolveSessionAccess = resolveSessionAccess;
    }
    async execute(input, app) {
        const user = await this.userRepo.findByEmail(input.email);
        if (!user)
            throw new InvalidCredentialsError();
        const isValid = await bcrypt.compare(input.password, user.password);
        if (!isValid)
            throw new InvalidCredentialsError();
        if (user.isSystemAdmin) {
            const token = app.jwt.sign({ userId: user.id, role: 'SYSTEM_ADMIN', email: user.email, isSystemAdmin: true });
            return {
                token,
                subscriptionAlert: null,
                user: { id: user.id, email: user.email, name: user.name, cpf: user.cpf, isSystemAdmin: true, tenants: [] },
            };
        }
        const tenants = user.tenants;
        if (tenants.length === 1) {
            const selected = tenants[0];
            const fullTenant = await this.tenantRepo.findById(selected.tenantId);
            if (fullTenant)
                assertTenantActive(fullTenant);
            const subscriptionAlert = fullTenant ? buildSubscriptionAlert(fullTenant) : null;
            const session = await this.resolveSessionAccess(user.id, selected.tenantId, selected.role);
            const token = app.jwt.sign({ userId: user.id, tenantId: selected.tenantId, role: selected.role, email: user.email });
            return {
                token,
                subscriptionAlert,
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name,
                    cpf: user.cpf,
                    idFuncionario: selected.funcionarioId,
                    perfis: session.perfis,
                    permissoes: session.permissoes,
                    abrangencia: session.abrangencia,
                    tenants: tenants.map((t) => ({ tenantId: t.tenantId, role: t.role, name: t.name, slug: t.slug })),
                },
            };
        }
        return {
            token: null,
            subscriptionAlert: null,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                cpf: user.cpf,
                tenants: tenants.map((t) => ({ tenantId: t.tenantId, role: t.role, name: t.name, slug: t.slug })),
            },
        };
    }
}
