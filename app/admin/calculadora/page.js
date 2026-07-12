"use client";

import CalculadoraPage from "../../calculadora/page";
import AdminShell from "../components/AdminShell";

export default function AdminCalculadoraPage() {
  return (
    <AdminShell
      title="Calculadora"
      subtitle="Cotiza servicios, diseños, retiros y extras desde el sistema interno."
      activeModule="calculadora"
    >
      <div className="overflow-hidden rounded-[1.75rem] bg-white shadow-sm">
        <CalculadoraPage />
      </div>
    </AdminShell>
  );
}
