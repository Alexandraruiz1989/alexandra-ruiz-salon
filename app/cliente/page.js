import Link from "next/link";

export default function ClienteHomePage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#fff8f6_0%,#f6e7e3_48%,#fff_100%)] px-5 py-8 text-[#3b2b2d]">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col justify-center">
        <div className="rounded-[2.5rem] border border-white/80 bg-white/85 p-7 shadow-[0_30px_90px_rgba(189,123,131,0.18)] backdrop-blur md:p-12">
          <p className="text-xs uppercase tracking-[0.4em] text-[#bd7b83]">
            Alexandra Ruiz Salón
          </p>
          <h1 className="mt-5 max-w-3xl text-4xl font-light leading-tight md:text-6xl">
            Agenda tu próxima cita desde tu portal de clienta.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-[#765d5f]">
            Revisa servicios, encuentra horarios libres reales y envía tu
            solicitud sin ver información interna del salón ni citas de otras
            clientas.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/cliente/login"
              className="rounded-full bg-[#bd7b83] px-7 py-4 text-center text-white shadow-lg shadow-[#bd7b83]/20 transition hover:opacity-90"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/cliente/registro"
              className="rounded-full border border-[#d8b8b4] bg-white px-7 py-4 text-center text-[#7a5558] transition hover:border-[#bd7b83] hover:text-[#bd7b83]"
            >
              Crear cuenta
            </Link>
          </div>

          <div className="mt-10 grid gap-3 md:grid-cols-3">
            {[
              "Elige uno o varios servicios.",
              "Consulta solo horarios disponibles.",
              "El equipo confirma anticipo y detalles.",
            ].map((item) => (
              <div
                key={item}
                className="rounded-3xl bg-[#fff8f6] p-4 text-sm leading-6 text-[#765d5f]"
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
