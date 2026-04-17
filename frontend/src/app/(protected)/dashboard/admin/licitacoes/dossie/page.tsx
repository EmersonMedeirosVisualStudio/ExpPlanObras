"use client";

import { useRouter } from "next/navigation";
import LicitacoesPicker from "../_components/LicitacoesPicker";

export default function AdminLicitacoesDossiePage() {
  const router = useRouter();
  return (
    <LicitacoesPicker
      title="Administração → Licitações → Dossiê da Licitação"
      subtitle="Centraliza documentos e vínculos (somente leitura no dossiê)."
      actionLabel="Abrir dossiê"
      onOpen={(idLicitacao) => router.push(`/dashboard/engenharia/licitacoes/${idLicitacao}?tab=DOSSIE`)}
    />
  );
}

