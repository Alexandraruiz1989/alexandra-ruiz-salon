"use client";

import { useMemo, useState } from "react";

const baseServices = [
  { name: "Aplicación de Gel Semi Permanente", price: 160 },
  { name: "Recubrimiento con Rubber Base", price: 280 },
  { name: "Tratamiento Vitacare", price: 300 },
  { name: "Baño de Polygel Líquido", price: 320 },
  { name: "Baño en Gel de Construcción", price: 300 },

  { name: "Extensiones en Acrílico con Punta", price: 350 },
  { name: "Extensiones Acrílicas Esculturales", price: 410 },
  { name: "Extensiones Softgel", price: 380 },
  { name: "Extensiones en Polygel", price: 350 },
  { name: "Extensiones en Gel de Construcción", price: 410 },

  { name: "Relleno de Uñas Acrílicas", price: 350 },
  { name: "Relleno Rubber Base", price: 280 },
  { name: "Relleno Polygel Líquido", price: 320 },
  { name: "Relleno Polygel", price: 350 },
  { name: "Relleno Gel de Construcción", price: 300 },
  { name: "Relleno Softgel", price: 330 },

  { name: "Manicure en Seco", price: 180 },
  { name: "Manicure en Seco con Gel", price: 225 },
  { name: "Manicure Clásico", price: 220 },
  { name: "Manicure Clásico con Gel", price: 260 },
  { name: "Manicure Spa", price: 290 },
  { name: "Manicure Spa con Gel", price: 330 },

  { name: "Pedicure en Seco Express", price: 180 },
  { name: "Pedicure en Seco con Gel", price: 225 },
  { name: "Pedicure Clásico", price: 300 },
  { name: "Pedicure Clásico con Gel", price: 380 },
  { name: "Pedicure Spa", price: 399 },
  { name: "Pedicure Spa con Gel", price: 445 },

  { name: "Planchado de Cejas", price: 250 },
  { name: "Planchado de Cejas con Depilación", price: 370 },
  { name: "Lifting de Pestañas con Tinte", price: 370 },
  { name: "Extensiones de Pestañas Clásicas", price: 650 },
  { name: "Extensiones de Pestañas Efecto Hawaiano", price: 750 },
  { name: "Extensiones de Pestañas Volumen 4D", price: 850 },
];

const perNailExtras = [
  { name: "Francés / Micro Francés", price: 7 },
  { name: "Ojo de Gato", price: 5 },
  { name: "Baby Boomer / Ombré", price: 10 },
  { name: "Cromo / Holográfico / Perla", price: 10 },
  { name: "Efecto Azúcar", price: 6 },
  { name: "Líneas o Puntos Minimalistas", price: 5 },
  { name: "Mármol Simple / Efecto Humo", price: 10 },
  { name: "Foil / Pan de Oro", price: 10 },
  { name: "Glitter Encapsulado", price: 10 },
  { name: "Flores Secas Encapsuladas", price: 10 },
  { name: "Nail Art Complejo", price: 20 },
  { name: "Arte 3D", price: 15 },
];

const perPieceExtras = [
  { name: "Sticker / Calcomanía", price: 5 },
  { name: "Stamping", price: 5 },
  { name: "Cristal Redondo", price: 2 },
  { name: "Cristal de Forma", price: 10 },
  { name: "Charms / Dijes / Bisutería", price: 10 },
  { name: "Piercing de Uña", price: 20 },
];

const setExtras = [
  { name: "Ojo de Gato Set Completo", price: 40 },
  { name: "Francés Set Completo", price: 60 },
  { name: "Micro Francés Set Completo", price: 60 },
  { name: "Baby Boomer / Ombré Set Completo", price: 80 },
  { name: "Cromo / Holográfico / Perla Set Completo", price: 90 },
  { name: "Efecto Azúcar Set Completo", price: 60 },
  { name: "Líneas / Puntos Set Completo", price: 40 },
  { name: "Mármol / Humo Set Completo", price: 90 },
  { name: "Foil / Pan de Oro Set Completo", price: 80 },
  { name: "Glitter Encapsulado Set Completo", price: 90 },
  { name: "Cristalería Full 1 Uña", price: 90 },
  { name: "Largo Extra", price: 50 },
];

const removalExtras = [
  { name: "Retiro gel externo", price: 70, hasQuantity: false },
  { name: "Retiro Acrílico", price: 150, hasQuantity: false },
  { name: "Retiro Acrílico por uña", price: 25, hasQuantity: true },
  { name: "Retiro Sistema de Gel", price: 100, hasQuantity: false },
  { name: "Retiro Sistema de Gel por uña", price: 20, hasQuantity: true },
];

export default function CalculadoraPage() {
  const [selectedService, setSelectedService] = useState(baseServices[0]);
  const [perNailSelected, setPerNailSelected] = useState([]);
  const [perPieceSelected, setPerPieceSelected] = useState([]);
  const [setSelected, setSetSelected] = useState([]);
  const [removalSelected, setRemovalSelected] = useState([]);
  const [notes, setNotes] = useState("");

  const toggleExtra = (extra, list, setList) => {
    const exists = list.find((item) => item.name === extra.name);

    if (exists) {
      setList(list.filter((item) => item.name !== extra.name));
    } else {
      setList([...list, { ...extra, quantity: 1 }]);
    }
  };

  const updateQuantity = (name, quantity, list, setList) => {
    setList(
      list.map((item) =>
        item.name === name
          ? { ...item, quantity: Math.max(1, Number(quantity) || 1) }
          : item
      )
    );
  };

  const serviceSubtotal = selectedService.price;

  const perNailTotal = useMemo(
    () =>
      perNailSelected.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      ),
    [perNailSelected]
  );

  const perPieceTotal = useMemo(
    () =>
      perPieceSelected.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      ),
    [perPieceSelected]
  );

  const setExtraTotal = useMemo(
    () => setSelected.reduce((sum, item) => sum + item.price, 0),
    [setSelected]
  );

  const removalTotal = useMemo(
    () =>
      removalSelected.reduce((sum, item) => {
        if (item.hasQuantity) {
          return sum + item.price * item.quantity;
        }
        return sum + item.price;
      }, 0),
    [removalSelected]
  );

  const extrasTotal =
    perNailTotal + perPieceTotal + setExtraTotal + removalTotal;

  const total = serviceSubtotal + extrasTotal;

  const summary = `Cotización Alexandra Ruiz Salón

Servicio base:
${selectedService.name} - $${serviceSubtotal}

Extras por uña:
${
  perNailSelected.length
    ? perNailSelected
        .map(
          (item) =>
            `${item.name} x ${item.quantity} = $${item.price * item.quantity}`
        )
        .join("\n")
    : "Sin extras por uña"
}

Extras por pieza:
${
  perPieceSelected.length
    ? perPieceSelected
        .map(
          (item) =>
            `${item.name} x ${item.quantity} = $${item.price * item.quantity}`
        )
        .join("\n")
    : "Sin extras por pieza"
}

Extras por set:
${
  setSelected.length
    ? setSelected.map((item) => `${item.name} = $${item.price}`).join("\n")
    : "Sin extras por set"
}

Retiros:
${
  removalSelected.length
    ? removalSelected
        .map((item) =>
          item.hasQuantity
            ? `${item.name} x ${item.quantity} = $${item.price * item.quantity}`
            : `${item.name} = $${item.price}`
        )
        .join("\n")
    : "Sin retiros"
}

Notas:
${notes || "Sin notas"}

Total estimado: $${total}`;

  const copySummary = async () => {
    await navigator.clipboard.writeText(summary);
    alert("Cotización copiada ✨");
  };

  const resetCalculator = () => {
    setSelectedService(baseServices[0]);
    setPerNailSelected([]);
    setPerPieceSelected([]);
    setSetSelected([]);
    setRemovalSelected([]);
    setNotes("");
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#fcf7f6] via-[#f9f1ef] to-[#fdf8f6] px-4 py-8 text-[#352829] md:px-8">
      <section className="mx-auto max-w-7xl">
        <div className="mb-8 rounded-[2rem] border border-[#ecd8d4] bg-white/80 p-6 shadow-[0_20px_60px_rgba(189,123,131,0.08)] backdrop-blur">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-[#bd7b83]">
                Alexandra Ruiz Salón
              </p>
              <h1 className="mt-3 text-4xl font-light md:text-6xl">
                Calculadora premium
              </h1>
              <p className="mt-4 max-w-2xl text-[#6d5a58]">
                Cotiza servicios, diseños, retiros y extras de forma elegante,
                rápida y clara para compartir con tus clientas.
              </p>
            </div>

            <a
              href="/"
              className="rounded-full border border-[#bd7b83] px-6 py-3 text-center text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
            >
              Volver a la web
            </a>
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-6">
            <div className="rounded-[2rem] border border-[#ecd8d4] bg-white p-6 shadow-[0_20px_50px_rgba(189,123,131,0.08)]">
              <h2 className="mb-4 text-2xl font-light">Servicio base</h2>

              <select
                className="w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] p-4 text-[#352829] outline-none"
                value={selectedService.name}
                onChange={(event) => {
                  const service = baseServices.find(
                    (item) => item.name === event.target.value
                  );
                  setSelectedService(service);
                }}
              >
                {baseServices.map((service) => (
                  <option key={service.name} value={service.name}>
                    {service.name} - ${service.price}
                  </option>
                ))}
              </select>
            </div>

            <ExtraGroup
              title="Extras por uña"
              description="Selecciona el diseño y especifica en cuántas uñas aplica."
              extras={perNailExtras}
              selected={perNailSelected}
              toggle={(extra) =>
                toggleExtra(extra, perNailSelected, setPerNailSelected)
              }
              updateQuantity={(name, quantity) =>
                updateQuantity(
                  name,
                  quantity,
                  perNailSelected,
                  setPerNailSelected
                )
              }
              quantityMode="all"
            />

            <ExtraGroup
              title="Extras por pieza"
              description="Cristales, charms, stickers, stamping y decoraciones por pieza."
              extras={perPieceExtras}
              selected={perPieceSelected}
              toggle={(extra) =>
                toggleExtra(extra, perPieceSelected, setPerPieceSelected)
              }
              updateQuantity={(name, quantity) =>
                updateQuantity(
                  name,
                  quantity,
                  perPieceSelected,
                  setPerPieceSelected
                )
              }
              quantityMode="all"
            />

            <ExtraGroup
              title="Extras por set"
              description="Opciones que se cobran como paquete completo."
              extras={setExtras}
              selected={setSelected}
              toggle={(extra) => toggleExtra(extra, setSelected, setSetSelected)}
              quantityMode="none"
            />

            <ExtraGroup
              title="Retiros"
              description="Agrega retiro de gel, acrílico o sistema de gel. Los retiros por uña permiten indicar cantidad."
              extras={removalExtras}
              selected={removalSelected}
              toggle={(extra) =>
                toggleExtra(extra, removalSelected, setRemovalSelected)
              }
              updateQuantity={(name, quantity) =>
                updateQuantity(
                  name,
                  quantity,
                  removalSelected,
                  setRemovalSelected
                )
              }
              quantityMode="conditional"
            />

            <div className="rounded-[2rem] border border-[#ecd8d4] bg-white p-6 shadow-[0_20px_50px_rgba(189,123,131,0.08)]">
              <h2 className="mb-4 text-2xl font-light">Notas</h2>
              <textarea
                className="min-h-32 w-full rounded-2xl border border-[#ead2cf] bg-[#fcf7f6] p-4 outline-none"
                placeholder="Ejemplo: tono nude, largo #3, corazones, retiro por uña..."
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
          </div>

          <aside className="h-fit rounded-[2rem] border border-[#ecd8d4] bg-white p-6 shadow-[0_25px_60px_rgba(189,123,131,0.10)] lg:sticky lg:top-8">
            <p className="text-xs uppercase tracking-[0.35em] text-[#bd7b83]">
              Resumen de cotización
            </p>

            <div className="mt-5 rounded-[1.75rem] bg-gradient-to-br from-[#f8eded] to-[#fff8f7] p-6">
              <p className="text-sm uppercase tracking-[0.25em] text-[#bd7b83]">
                Total final
              </p>

              <p className="mt-2 text-5xl font-light text-[#b26d77]">
                ${total}
              </p>

              <div className="mt-5 space-y-3 text-sm text-[#6d5a58]">
                <div className="flex items-center justify-between border-b border-[#ead9d5] pb-2">
                  <span>Servicio base</span>
                  <span>${serviceSubtotal}</span>
                </div>

                <div className="flex items-center justify-between border-b border-[#ead9d5] pb-2">
                  <span>Extras por uña</span>
                  <span>${perNailTotal}</span>
                </div>

                <div className="flex items-center justify-between border-b border-[#ead9d5] pb-2">
                  <span>Extras por pieza</span>
                  <span>${perPieceTotal}</span>
                </div>

                <div className="flex items-center justify-between border-b border-[#ead9d5] pb-2">
                  <span>Extras por set</span>
                  <span>${setExtraTotal}</span>
                </div>

                <div className="flex items-center justify-between border-b border-[#ead9d5] pb-2">
                  <span>Retiros</span>
                  <span>${removalTotal}</span>
                </div>

                <div className="flex items-center justify-between pt-1 font-medium text-[#352829]">
                  <span>Total extras</span>
                  <span>${extrasTotal}</span>
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-[1.75rem] bg-[#fcf7f6] p-5 text-sm leading-7 text-[#6d5a58]">
              <h3 className="mb-3 text-lg font-medium text-[#352829]">
                Resumen detallado
              </h3>

              <pre className="whitespace-pre-wrap font-sans">{summary}</pre>
            </div>

            <div className="mt-6 grid gap-3">
              <button
                onClick={copySummary}
                className="rounded-full bg-[#bd7b83] px-6 py-4 text-white transition hover:opacity-90"
              >
                Copiar cotización
              </button>

              <a
                href={`https://wa.me/529993642676?text=${encodeURIComponent(
                  summary
                )}`}
                target="_blank"
                className="rounded-full border border-[#bd7b83] px-6 py-4 text-center text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
              >
                Enviar por WhatsApp
              </a>

              <button
                onClick={resetCalculator}
                className="rounded-full bg-[#f2e4e1] px-6 py-4 text-[#8a5f63] transition hover:bg-[#edd8d4]"
              >
                Limpiar cotización
              </button>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}

function ExtraGroup({
  title,
  description,
  extras,
  selected,
  toggle,
  updateQuantity,
  quantityMode = "none",
}) {
  const isSelected = (name) => selected.some((item) => item.name === name);

  const shouldShowQuantity = (extra, selectedItem) => {
    if (!selectedItem) return false;
    if (quantityMode === "all") return true;
    if (quantityMode === "conditional") return extra.hasQuantity;
    return false;
  };

  return (
    <div className="rounded-[2rem] border border-[#ecd8d4] bg-white p-6 shadow-[0_20px_50px_rgba(189,123,131,0.08)]">
      <div className="mb-5">
        <h2 className="text-2xl font-light">{title}</h2>
        <p className="mt-2 text-sm text-[#6d5a58]">{description}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {extras.map((extra) => {
          const selectedItem = selected.find((item) => item.name === extra.name);

          return (
            <div
              key={extra.name}
              className={`rounded-2xl border p-4 transition ${
                isSelected(extra.name)
                  ? "border-[#bd7b83] bg-[#fcf0ef]"
                  : "border-[#ead2cf] bg-[#fdf8f6]"
              }`}
            >
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={isSelected(extra.name)}
                  onChange={() => toggle(extra)}
                  className="mt-1"
                />

                <div className="flex-1">
                  <div className="flex justify-between gap-3">
                    <span>{extra.name}</span>
                    <span className="font-medium text-[#bd7b83]">
                      ${extra.price}
                    </span>
                  </div>

                  {shouldShowQuantity(extra, selectedItem) && (
                    <div className="mt-3 flex items-center gap-3">
                      <span className="text-sm text-[#6d5a58]">Cantidad:</span>
                      <input
                        type="number"
                        min="1"
                        value={selectedItem.quantity}
                        onChange={(event) =>
                          updateQuantity(extra.name, event.target.value)
                        }
                        className="w-24 rounded-xl border border-[#ead2cf] bg-white px-3 py-2 outline-none"
                      />
                    </div>
                  )}
                </div>
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}