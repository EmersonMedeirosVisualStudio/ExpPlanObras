
import prisma from '../src/plugins/prisma.js';

async function main() {
    const cpf = process.argv[2];

    if (!cpf) {
        console.error("Please provide a CPF. Usage: npx tsx scripts/promote-admin.ts <cpf>");
        process.exit(1);
    }

    const user = await prisma.user.findUnique({
        where: { cpf }
    });

    if (!user) {
        console.error("User not found with CPF:", cpf);
        process.exit(1);
    }

    await prisma.user.update({
        where: { id: user.id },
        data: { isSystemAdmin: true }
    });

    console.log(`User ${user.name} (${user.cpf}) is now a System Admin.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
