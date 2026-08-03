import Link from "next/link";

export const PRIVACY_CONTACT_EMAIL = "alexandraruizsalon@gmail.com";

export function PrivacyContactLink() {
  return (
    <a
      href={`mailto:${PRIVACY_CONTACT_EMAIL}`}
      className="font-semibold text-[#bd7b83] underline-offset-4 hover:underline"
    >
      {PRIVACY_CONTACT_EMAIL}
    </a>
  );
}

const legalLinks = [
  { href: "/politica-de-privacidad", label: "Política de privacidad" },
  { href: "/terminos-y-condiciones", label: "Términos y condiciones" },
  { href: "/eliminacion-de-datos", label: "Eliminación de datos" },
];

export function LegalPage({ title, description, children }) {
  return (
    <main className="min-h-screen bg-[#fdf8f6] text-[#332727]">
      <header className="border-b border-[#ead2cf] bg-[#fdf8f6]/95 px-5 py-5 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="inline-flex items-center gap-3">
            <img
              src="/logo-alexandra-ruiz.png"
              alt="Alexandra Ruiz Salón"
              className="h-14 w-auto"
            />
          </Link>
          <nav
            aria-label="Enlaces legales"
            className="flex flex-wrap gap-3 text-xs uppercase tracking-[0.2em] text-[#8b6b66]"
          >
            {legalLinks.map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-[#bd7b83]">
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <section className="px-5 py-14 md:py-20">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs uppercase tracking-[0.4em] text-[#bd7b83]">
            Alexandra Ruiz Salón · Mérida, Yucatán
          </p>
          <h1 className="mt-5 text-4xl font-light leading-tight md:text-6xl">
            {title}
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-[#6d5a58]">
            {description}
          </p>

          <article className="mt-10 space-y-9 rounded-[2rem] border border-[#ead2cf] bg-white/85 p-6 leading-8 text-[#5f504d] shadow-xl md:p-10">
            {children}
          </article>
        </div>
      </section>

      <footer className="border-t border-[#ead2cf] bg-[#f8ebe8] px-5 py-10 text-center text-[#6d5a58]">
        <div className="text-3xl font-light tracking-[0.12em] text-[#bd7b83]">
          Alexandra Ruiz
        </div>
        <p className="mt-2 text-sm uppercase tracking-[0.35em]">Salón</p>
        <nav
          aria-label="Enlaces legales del sitio"
          className="mx-auto mt-6 flex max-w-3xl flex-wrap justify-center gap-x-6 gap-y-3 text-sm"
        >
          {legalLinks.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-[#bd7b83]">
              {link.label}
            </Link>
          ))}
        </nav>
        <p className="mt-6 text-sm">
          © 2026 Alexandra Ruiz Salón. Todos los derechos reservados.
        </p>
      </footer>
    </main>
  );
}

export function LegalSection({ title, children }) {
  return (
    <section>
      <h2 className="text-2xl font-light text-[#bd7b83]">{title}</h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function LegalList({ items }) {
  return (
    <ul className="list-disc space-y-2 pl-6">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
