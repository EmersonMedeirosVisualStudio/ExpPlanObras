export default function ForbiddenPage() {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-6">
      <h1 className="text-xl font-semibold text-red-700">Acesso negado</h1>
      <p className="mt-2 text-red-600">Você não possui permissão para acessar esta área.</p>
    </div>
  );
}

