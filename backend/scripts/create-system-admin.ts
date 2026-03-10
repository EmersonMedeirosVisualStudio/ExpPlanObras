
import prisma from '../src/plugins/prisma.js';
import bcrypt from 'bcryptjs';

async function main() {
    const email = 'admin@sistema.com';
    const password = '123456'; // Em produção, usar variável de ambiente
    const cpf = '000.000.000-00'; // CPF Administrativo
    const name = 'Administrador Sistema';

    const hashedPassword = await bcrypt.hash(password, 10);

    // Verifica se usuário já existe
    const existingUser = await prisma.user.findUnique({
        where: { email }
    });

    if (existingUser) {
        console.log(`User ${email} already exists. Updating to System Admin...`);
        await prisma.user.update({
            where: { id: existingUser.id },
            data: { 
                isSystemAdmin: true,
                password: hashedPassword // Atualiza senha para garantir acesso
            }
        });
        console.log(`User ${email} updated successfully.`);
    } else {
        console.log(`Creating user ${email}...`);
        try {
            await prisma.user.create({
                data: {
                    email,
                    password: hashedPassword,
                    cpf,
                    name,
                    isSystemAdmin: true
                }
            });
            console.log(`User ${email} created successfully.`);
        } catch (error: any) {
            if (error.code === 'P2002') {
                console.error(`Error: CPF ${cpf} or Email ${email} already in use by another user.`);
            } else {
                console.error(error);
            }
        }
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
