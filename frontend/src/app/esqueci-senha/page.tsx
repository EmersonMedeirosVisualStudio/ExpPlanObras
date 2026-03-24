import Link from 'next/link';

export default function Page() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
      <div className="w-full max-w-md space-y-6 rounded-lg bg-white p-8 shadow-md">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Esqueci a senha</h1>
          <p className="mt-2 text-sm text-gray-600">
            Para redefinir sua senha, solicite ao Encarregado do Sistema da sua empresa (menu Governança → Usuários → Resetar acesso).
          </p>
        </div>

        <div className="space-y-3 rounded-lg border bg-slate-50 p-4 text-sm text-slate-700">
          <div>Se você não souber quem é o Encarregado, peça ao responsável de RH/SST/gestão do contrato para encaminhar a solicitação.</div>
          <div>
            Se você for o primeiro administrador (ainda não existe nenhum Encarregado/usuário cadastrado), a recuperação precisa ser feita por um administrador do sistema
            (suporte) ou pela equipe técnica, redefinindo a senha do seu e-mail de acesso.
          </div>
        </div>

        <div className="flex items-center justify-between">
          <Link href="/login" className="text-sm font-medium text-blue-600 hover:text-blue-500">
            Voltar para login
          </Link>
          <Link href="/login" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500">
            Voltar
          </Link>
        </div>
      </div>
    </div>
  );
}
