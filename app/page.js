const whatsapp = "https://wa.me/529993642676?text=Hola,%20vi%20su%20pagina%20web%20y%20me%20interesa%20una%20cita";

const sections = [
  {
    title: "Cuidado sobre Uña Natural",
    subtitle: "Natural Nail Care",
    items: [
      ["Aplicación de Gel Semi Permanente", "$160", "Color y brillo duradero para un esmaltado impecable de rápida aplicación."],
      ["Recubrimiento con Rubber Base", "$280", "Nivelación, volumen y resistencia extra para uñas naturales."],
      ["Tratamiento Vitacare", "$300", "Nutrición y fortalecimiento profundo para uñas naturales."],
      ["Baño de Polygel Líquido", "$320", "Protección ligera y resistente sin perder naturalidad."],
      ["Baño en Gel de Construcción", "$300", "Estructura, soporte y máxima resistencia con acabado brillante."],
    ],
  },
  {
    title: "Extensiones de Uñas",
    subtitle: "Nail Extensions",
    items: [
      ["Extensiones en Acrílico con Tip", "$350", "Largo ideal al instante con máxima resistencia. Largo extra +$50."],
      ["Extensiones en Acrílico Esculturales", "$410", "Alargamiento artesanal personalizado. Largo extra +$50."],
      ["Extensiones Softgel", "$380", "Sistema ligero, flexible y ultra realista."],
      ["Extensiones en Polygel", "$350", "Fuerza, flexibilidad y ligereza en un acabado impecable. Largo extra +$50."],
      ["Extensiones en Gel de Construcción", "$410", "Alargamiento sofisticado, cristalino y resistente. Largo extra +$50."],
    ],
  },
  {
    title: "Mantenimientos y Rellenos",
    subtitle: "Refills & Maintenance",
    items: [
      ["Relleno de Uñas Acrílicas", "$350", "Mantenimiento profesional para conservar estructura y belleza."],
      ["Relleno Rubber Base", "$280", "Nivelación y refuerzo para uña natural."],
      ["Relleno Polygel Líquido", "$320", "Mantenimiento ligero y resistente."],
      ["Relleno Polygel", "$350", "Relleno para extensiones con acabado impecable."],
      ["Relleno Gel de Construcción", "$300", "Mantenimiento de estructura con brillo y resistencia."],
      ["Relleno Softgel", "$330", "Mantenimiento para conservar forma, largo y acabado."],
      ["Reparación de Uña", "Desde $50", "Reconstrucción de pieza rota o desprendida."],
      ["Reconstrucción Estética de Uña para Pie", "Desde $40", "Solución estética para recuperar forma y simetría."],
    ],
  },
  {
    title: "Experiencias de Manicure",
    subtitle: "Manicure Experiences",
    items: [
      ["Manicure en Seco", "$180", "Limpieza profunda de cutícula con técnica especializada en seco."],
      ["Manicure en Seco con Gel", "$225", "Limpieza detallada y aplicación de gel color liso."],
      ["Manicure Clásico", "$220", "Remojo, limpieza de cutículas y limado perfecto."],
      ["Manicure Clásico con Gel", "$260", "Cuidado tradicional con acabado de gel."],
      ["Manicure Spa", "$290", "Sales minerales, exfoliación, mascarilla hidratante y masaje."],
      ["Manicure Spa con Gel", "$330", "Experiencia spa completa con esmaltado en gel."],
    ],
  },
  {
    title: "Cuidado y Belleza para Pies",
    subtitle: "Pedicure",
    items: [
      ["Pedicure en Seco Express", "$180", "Servicio rápido y pulcro enfocado en estética de uñas."],
      ["Pedicure en Seco con Gel", "$225", "Limpieza en seco con esmaltado en gel semi permanente."],
      ["Pedicure Clásico", "$300", "Remojo, limado, recorte, cuadratura y atención de uñeros."],
      ["Pedicure Clásico con Gel", "$380", "Cuidado completo con esmaltado en gel."],
      ["Pedicure Spa", "$399", "Renovación profunda, exfoliación, hidratación y masaje."],
      ["Pedicure Spa con Gel", "$445", "Experiencia relajante completa con esmaltado en gel."],
      ["Pedicure Medicado y Reconstrucción Estética", "$500 + $70 por uña", "Cuidado especializado para uñas que requieren atención profunda."],
    ],
  },
  {
    title: "Decoraciones Extra para Uñas",
    subtitle: "Nail Art Extras",
    items: [
      ["French / Micro French", "$7 por uña / $60 set", "Acabado clásico, delicado y minimalista."],
      ["Baby Boomer / Ombré", "$10 por uña / $80 set", "Transición suave y elegante entre tonos."],
      ["Cromo, Holográfico o Perla", "$10 por uña / $90 set", "Acabados metálicos e iridiscentes."],
      ["Ojo de Gato", "$40", "Gel magnético con efecto de luz."],
      ["Acabado Mate", "Sin costo", "Look aterciopelado y sofisticado."],
      ["Líneas y Puntos Minimalistas", "$5 por uña / $40 set", "Diseños limpios y geométricos."],
      ["Mármol, Humo, Foil o Pan de Oro", "Desde $10 por uña", "Detalles artísticos con brillo y textura."],
      ["Stickers / Stamping", "$5 c/u", "Diseños rápidos y decorativos."],
      ["Nail Art Complejo", "Desde $20 por uña", "Diseños detallados a mano alzada."],
      ["Arte 3D", "Desde $15", "Flores, moños o texturas en relieve."],
      ["Cristales y Charms", "Desde $2 c/u", "Detalles brillantes y joyería para uñas."],
    ],
  },
  {
    title: "Cejas, Pestañas y Depilación Facial",
    subtitle: "Brows, Lashes & Facial Waxing",
    items: [
      ["Planchado de Cejas", "$250", "Define, direcciona y fija el vello para una ceja más simétrica."],
      ["Planchado de Cejas con Depilación", "$370", "Laminado con diseño y limpieza precisa del arco."],
      ["Lifting de Pestañas con Tinte", "$370", "Curva, eleva y oscurece tus pestañas naturales."],
      ["Extensiones de Pestañas Clásicas", "$650", "Look natural y elegante pelo a pelo."],
      ["Extensiones Efecto Hawaiano", "$750", "Mayor volumen con apariencia ligera y coqueta."],
      ["Extensiones Volumen 4D", "$850", "Mirada dramática, tupida y sofisticada."],
      ["Depilación de Cejas", "$160", "Diseño y limpieza con acabado definido."],
      ["Depilación de Bozo", "$90", "Eliminación suave del vello del labio superior."],
      ["Depilación de Patillas", "$90", "Limpieza lateral para un acabado pulcro."],
      ["Depilación Cara Completa", "$380", "Piel suave, iluminada y lista para maquillaje."],
    ],
  },
  {
    title: "Tratamientos Capilares y Alaciados",
    subtitle: "Hair Treatments",
    items: [
      ["Botox Capilar", "Desde $660", "Hidratación profunda, control de frizz y brillo intenso."],
      ["Keratina Efecto Espejo", "Desde $890", "Liso impecable, brillo extremo y control de encrespamiento."],
      ["Cirugía Capilar", "Desde $500", "Fórmula suave que relaja la onda y deja el cabello sedoso."],
      ["Nanoplastia", "Desde $950", "Alaciado natural con caída, movimiento y reconstrucción."],
      ["Sistema 100", "Desde $1000", "Alaciado premium de larga duración con brillo máximo."],
    ],
  },
  {
    title: "Cortes, Colorimetría y Estilizado",
    subtitle: "Hair Styling & Color",
    items: [
      ["Corte de Dama", "$330", "Corte diseñado a tu medida con lavado y estilizado básico."],
      ["Aplicación de Tinte", "$350", "Aplicación profesional; la clienta trae su color."],
      ["Color Completo sin Decoloración", "Desde $650", "Color uniforme con lavado y estilizado."],
      ["Efectos de Color", "Cotización", "Balayage, babylights, mechas y técnicas con valoración previa."],
      ["Planchado Express con Shot de Keratina", "$380", "Liso temporal, brillo y control de frizz para ocasiones especiales."],
      ["Ondas Express", "$380", "Ondas glamurosas con volumen y movimiento."],
    ],
  },
];

const gallery = [
  "unas-1.jpg",
  "unas-2.jpg",
  "unas-3.jpg",
  "unas-4.jpg",
  "pedi-1.jpg",
  "unas-1.jpg",
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#fdf8f6] text-[#332727]">
      <header className="sticky top-0 z-50 border-b border-[#ead2cf] bg-[#fdf8f6]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <a href="#inicio" className="flex items-center">
  <img
    src="/logo-alexandra-ruiz.png"
    alt="Alexandra Ruiz Salón Spa"
    className="h-14 w-auto md:h-16"
  />
</a>
          <nav className="hidden items-center gap-7 text-[12px] uppercase tracking-[0.22em] text-[#6d5a58] md:flex">
            <a href="#servicios" className="hover:text-[#bd7b83]">Servicios</a>
            <a href="#promos" className="hover:text-[#bd7b83]">Promos</a>
            <a href="#vip" className="hover:text-[#bd7b83]">VIP</a>
            <a href="#galeria" className="hover:text-[#bd7b83]">Galería</a>
            <a href="#contacto" className="hover:text-[#bd7b83]">Contacto</a>
          </nav>
          <a href={whatsapp} target="_blank" className="rounded-full bg-[#bd7b83] px-5 py-3 text-sm text-white shadow-lg transition hover:bg-[#a7646d]">
            Agendar
          </a>
        </div>
      </header>

      <section id="inicio" className="relative overflow-hidden px-5 py-20 md:py-28">
        <div className="absolute -right-32 top-12 h-96 w-96 rounded-full bg-[#efd2cf] blur-3xl" />
        <div className="absolute -left-32 bottom-0 h-96 w-96 rounded-full bg-[#f7e4df] blur-3xl" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 md:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="mb-5 text-xs uppercase tracking-[0.42em] text-[#bd7b83]">Luxury Beauty Studio · Mérida</p>
            <h1 className="max-w-4xl text-5xl font-light leading-tight md:text-7xl">
              Tu momento de <span className="font-serif italic text-[#bd7b83]">brillar</span> comienza aquí
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-[#6d5a58]">
              El lujo de consentirte en un espacio muy tuyo. Uñas, gelish, pedicure, cejas, pestañas y tratamientos capilares con una experiencia elegante y personalizada.
            </p>
            <div className="mt-9 flex flex-col gap-4 sm:flex-row">
              <a href={whatsapp} target="_blank" className="rounded-full bg-[#bd7b83] px-8 py-4 text-center text-white shadow-xl transition hover:bg-[#a7646d]">Agendar por WhatsApp</a>
              <a href="#servicios" className="rounded-full border border-[#bd7b83] px-8 py-4 text-center text-[#bd7b83] transition hover:bg-white">Ver menú completo</a>
            </div>
            <div className="mt-10 grid gap-4 text-sm text-[#6d5a58] sm:grid-cols-3">
              <div className="rounded-3xl border border-[#ead2cf] bg-white/60 p-5">Productos premium</div>
              <div className="rounded-3xl border border-[#ead2cf] bg-white/60 p-5">Atención personalizada</div>
              <div className="rounded-3xl border border-[#ead2cf] bg-white/60 p-5">Acabados elegantes</div>
            </div>
          </div>
          <div className="relative">
            <img src="https://images.unsplash.com/photo-1604654894610-df63bc536371?q=80&w=1200&auto=format&fit=crop" alt="Uñas elegantes" className="h-[560px] w-full rounded-[2.5rem] object-cover shadow-2xl" />
            <div className="absolute -bottom-6 left-6 right-6 rounded-[2rem] border border-white/70 bg-white/75 p-6 text-center shadow-xl backdrop-blur">
              <p className="text-xs uppercase tracking-[0.3em] text-[#bd7b83]">Español · English</p>
              <p className="mt-2 text-[#6d5a58]">Premium care for your beauty ritual.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="promos" className="px-5 py-20 bg-[#f8ebe8]">
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.4em] text-[#bd7b83]">Promociones</p>
            <h2 className="mt-4 text-4xl font-light md:text-5xl">Especiales del mes</h2>
          </div>
          <div className="mt-12 grid gap-7 md:grid-cols-2">
            <div className="rounded-[2rem] bg-white p-8 shadow-xl">
              <p className="text-xs uppercase tracking-[0.3em] text-[#bd7b83]">Manos + pies</p>
              <h3 className="mt-4 text-3xl font-light">Mani en seco con gel + Pedi en seco con gel</h3>
              <p className="mt-5 text-5xl font-light text-[#bd7b83]">$420</p>
              <a href={whatsapp} target="_blank" className="mt-8 inline-block rounded-full bg-[#bd7b83] px-7 py-3 text-white">Reservar promoción</a>
            </div>
            <div className="rounded-[2rem] bg-white p-8 shadow-xl">
              <p className="text-xs uppercase tracking-[0.3em] text-[#bd7b83]">Capilar</p>
              <h3 className="mt-4 text-3xl font-light">Cirugía Capilar cualquier largo</h3>
              <p className="mt-5 text-5xl font-light text-[#bd7b83]">$500</p>
              <a href={whatsapp} target="_blank" className="mt-8 inline-block rounded-full bg-[#bd7b83] px-7 py-3 text-white">Agendar ahora</a>
            </div>
          </div>
        </div>
      </section>

      <section id="vip" className="px-5 py-20">
        <div className="mx-auto max-w-7xl rounded-[2.5rem] border border-[#ead2cf] bg-white p-8 shadow-xl md:p-12">
          <div className="grid gap-10 md:grid-cols-[0.9fr_1.1fr] md:items-center">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-[#bd7b83]">Membresía VIP</p>
              <h2 className="mt-4 text-4xl font-light md:text-5xl">Belleza recurrente, precio especial</h2>
              <p className="mt-5 text-6xl font-light text-[#bd7b83]">$850 <span className="text-lg text-[#6d5a58]">al mes</span></p>
              <p className="mt-4 text-[#6d5a58]">Precio de introducción. Bloquea este precio para todo el año. Solo 10 membresías disponibles.</p>
            </div>
            <div className="grid gap-4 text-[#6d5a58] sm:grid-cols-2">
              <div className="rounded-3xl bg-[#fdf8f6] p-5">1 relleno: acrílico, polygel, softgel o gel de construcción</div>
              <div className="rounded-3xl bg-[#fdf8f6] p-5">1 pedicure spa con gel</div>
              <div className="rounded-3xl bg-[#fdf8f6] p-5">10% de descuento en servicios adicionales</div>
              <div className="rounded-3xl bg-[#fdf8f6] p-5">Beneficio VIP en el mes de cumpleaños</div>
              <a href={whatsapp} target="_blank" className="sm:col-span-2 rounded-full bg-[#bd7b83] px-7 py-4 text-center text-white">Quiero mi membresía VIP</a>
            </div>
          </div>
        </div>
      </section>

      <section id="servicios" className="px-5 py-20 bg-white/55">
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.4em] text-[#bd7b83]">Menú completo</p>
            <h2 className="mt-4 text-4xl font-light md:text-5xl">Servicios / Services</h2>
            <p className="mx-auto mt-5 max-w-2xl text-[#6d5a58]">Precios sujetos a valoración cuando el servicio lo requiera. Para cotizaciones de color y largo capilar, escríbenos por WhatsApp.</p>
          </div>
          <div className="mt-14 space-y-12">
            {sections.map((section) => (
              <div key={section.title} className="rounded-[2rem] border border-[#ead2cf] bg-[#fdf8f6] p-6 shadow-sm md:p-8">
                <div className="mb-7 flex flex-col justify-between gap-2 md:flex-row md:items-end">
                  <div>
                    <p className="text-xs uppercase tracking-[0.35em] text-[#bd7b83]">{section.subtitle}</p>
                    <h3 className="mt-2 text-3xl font-light">{section.title}</h3>
                  </div>
                  <a href={whatsapp} target="_blank" className="text-sm uppercase tracking-[0.25em] text-[#bd7b83]">Cotizar</a>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {section.items.map(([name, price, desc]) => (
                    <div key={name} className="rounded-3xl bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
                      <div className="flex items-start justify-between gap-4">
                        <h4 className="text-lg font-medium text-[#332727]">{name}</h4>
                        <span className="shrink-0 text-[#bd7b83]">{price}</span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-[#6d5a58]">{desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="galeria" className="px-5 py-20">
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.4em] text-[#bd7b83]">Galería</p>
            <h2 className="mt-4 text-4xl font-light md:text-5xl">Inspiración premium</h2>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {gallery.map((src) => <img key={src} src={src} alt="Trabajo de belleza" className="h-80 w-full rounded-[2rem] object-cover shadow-lg" />)}
          </div>
        </div>
      </section>

      <section className="px-5 py-20 bg-[#f8ebe8]">
        <div className="mx-auto max-w-7xl">
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.4em] text-[#bd7b83]">Testimonios</p>
            <h2 className="mt-4 text-4xl font-light md:text-5xl">Lo que dicen nuestras clientas</h2>
          </div>
          <div className="mt-12 grid gap-7 md:grid-cols-3">
            {["La atención es increíble y mis uñas siempre quedan hermosas.", "Un espacio elegante, relajante y perfecto para consentirme.", "Me encanta la calidad del servicio y el acabado tan profesional."].map((text, i) => (
              <div key={text} className="rounded-[2rem] bg-white p-8 shadow-lg">
                <p className="text-4xl text-[#bd7b83]">“</p>
                <p className="mt-3 leading-7 text-[#6d5a58]">{text}</p>
                <p className="mt-7 text-sm uppercase tracking-[0.25em] text-[#bd7b83]">Clienta {i + 1}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="contacto" className="px-5 py-20">
        <div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-2 md:items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-[#bd7b83]">Contacto</p>
            <h2 className="mt-4 text-4xl font-light md:text-5xl">Agenda tu cita</h2>
            <div className="mt-8 space-y-6 text-[#6d5a58]">
              <p><strong className="text-[#332727]">WhatsApp:</strong> 999 364 2676</p>
              <p><strong className="text-[#332727]">Dirección:</strong> Calle 44 No. 491 x 25 y 27, Residencial Los Pinos, Mérida, Yucatán 97138</p>
              <div>
                <strong className="text-[#332727]">Horarios:</strong>
                <p>Martes a Viernes: 9:00 am a 9:00 pm</p>
                <p>Sábado: 9:00 am a 6:00 pm</p>
                <p>Domingo: 9:00 am a 2:00 pm</p>
              </div>
              <p><strong className="text-[#332727]">Instagram:</strong> @alexandraruizsalon</p>
              <p><strong className="text-[#332727]">Facebook:</strong> facebook.com/alexandraruizsalon</p>
            </div>
            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <a href={whatsapp} target="_blank" className="rounded-full bg-[#bd7b83] px-8 py-4 text-center text-white">Agendar por WhatsApp</a>
              <a href="https://www.google.com/maps/search/?api=1&query=Alexandra%20Ruiz%20Salon%20Merida%20Yucatan" target="_blank" className="rounded-full border border-[#bd7b83] px-8 py-4 text-center text-[#bd7b83]">Cómo llegar</a>
            </div>
          </div>
          <div className="h-[480px] overflow-hidden rounded-[2.5rem] shadow-2xl">
            <iframe title="Mapa Alexandra Ruiz Salón" src="https://maps.google.com/maps?q=Alexandra%20Ruiz%20Salon%20Merida%20Yucatan&t=&z=15&ie=UTF8&iwloc=&output=embed" width="100%" height="100%" style={{ border: 0 }} loading="lazy"></iframe>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#ead2cf] bg-[#f8ebe8] px-5 py-10 text-center text-[#6d5a58]">
        <div className="text-3xl font-light tracking-[0.12em] text-[#bd7b83]">Alexandra Ruiz</div>
        <p className="mt-2 text-sm uppercase tracking-[0.35em]">Salón Spa</p>
        <p className="mt-5">El lujo de consentirte en un espacio muy tuyo</p>
        <p className="mt-6 text-sm">© 2026 Alexandra Ruiz Salón. Todos los derechos reservados.</p>
      </footer>

      <a href={whatsapp} target="_blank" className="fixed bottom-5 right-5 z-50 rounded-full bg-[#bd7b83] px-6 py-4 text-white shadow-2xl transition hover:bg-[#a7646d]">
        WhatsApp
      </a>
    </main>
  );
}
