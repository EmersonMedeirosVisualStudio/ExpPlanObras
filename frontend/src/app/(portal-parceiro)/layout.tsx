export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl p-4">
        <header className="mb-6 rounded-xl border bg-white p-4 shadow-sm">
          <div className="text-xl font-semibold text-slate-800">Portal do Parceiro</div>
          <div className="text-sm text-slate-500">Acesso restrito à empresa parceira</div>
        </header>
        {children}
      </div>
    </div>
  );
}
