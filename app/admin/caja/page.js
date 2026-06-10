"use client";

import { useEffect, useMemo, useState } from "react";
import AdminShell from "../components/AdminShell";
import { supabase } from "../../lib/supabaseClient";

const menuItems = [
  { key: "corte", label: "Corte de caja" },
  { key: "movimientos", label: "Movimientos" },
  { key: "nuevo", label: "Nuevo movimiento" },
];

const movementTypes = [
  { value: "fondo_inicial", label: "Fondo inicial", sign: "positive" },
  { value: "ingreso", label: "Ingreso", sign: "positive" },
  { value: "salida", label: "Salida / gasto", sign: "negative" },
  { value: "retiro", label: "Retiro de efectivo", sign: "negative" },
  { value: "ajuste", label: "Ajuste", sign: "positive" },
];

const paymentMethods = ["Efectivo", "Transferencia", "Tarjeta", "Mixto"];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function Card({ children, className = "" }) {
  return (
    <div className={`rounded-[1.5rem] bg-white p-6 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function SectionHeader({ eyebrow, title, description, action }) {
  return (
    <div className="mb-6 flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-[#bd7b83]">
          {eyebrow}
        </p>
        <h3 className="mt-2 text-2xl font-light">{title}</h3>
        {description && (
          <p className="mt-1 text-sm text-[#68777c]">{description}</p>
        )}
      </div>

      {action}
    </div>
  );
}

function getMovementLabel(type) {
  return movementTypes.find((item) => item.value === type)?.label || type;
}

function isCashMovement(movement) {
  return (
    movement.payment_method === "Efectivo" ||
    movement.movement_type === "fondo_inicial" ||
    movement.movement_type === "salida" ||
    movement.movement_type === "retiro" ||
    movement.movement_type === "ajuste"
  );
}

function getToastStyle(message) {
  const text = String(message || "").toLowerCase();

  if (
    text.includes("no se pudo") ||
    text.includes("selecciona") ||
    text.includes("concepto") ||
    text.includes("monto") ||
    text.includes("error")
  ) {
    return "bg-red-600 text-white";
  }

  return "bg-green-600 text-white";
}

export default function CajaPage() {
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [activeSection, setActiveSection] = useState("corte");
  const [message, setMessage] = useState("");

  const [cashMessage, setCashMessage] = useState("");
  const [activeCashMessage, setActiveCashMessage] = useState("");

  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [movements, setMovements] = useState([]);
  const [closing, setClosing] = useState(null);
  const [countedCash, setCountedCash] = useState(0);
  const [closingNotes, setClosingNotes] = useState("");

  const [movementForm, setMovementForm] = useState({
    movement_date: todayISO(),
    movement_type: "salida",
    amount: 0,
    payment_method: "Efectivo",
    concept: "",
    category: "",
    notes: "",
  });

  useEffect(() => {
    const start = async () => {
      const { data } = await supabase.auth.getSession();

      if (!data.session) {
        window.location.href = "/admin";
        return;
      }

      setLoadingSession(false);
      await loadData();
    };

    start();
  }, []);

  useEffect(() => {
    if (!loadingSession) {
      loadData();
    }
  }, [selectedDate]);

  useEffect(() => {
    if (!message) return;

    const timer = setTimeout(() => {
      setMessage("");
    }, 15000);

    return () => clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!cashMessage) return;

    const timer = setTimeout(() => {
      setCashMessage("");
      setActiveCashMessage("");
    }, 15000);

    return () => clearTimeout(timer);
  }, [cashMessage]);

  const loadData = async () => {
    setLoadingData(true);
    setMessage("");

    const [movementsResult, closingResult] = await Promise.all([
      supabase
        .from("cash_movements")
        .select(
          `
          *,
          payments (
            id,
            total_amount,
            clients (
              full_name
            )
          )
        `
        )
        .eq("movement_date", selectedDate)
        .order("created_at", { ascending: false }),

      supabase
        .from("cash_closings")
        .select("*")
        .eq("closing_date", selectedDate)
        .maybeSingle(),
    ]);

    if (movementsResult.error) {
      setMessage(
        `No se pudieron cargar movimientos: ${movementsResult.error.message}`
      );
    } else {
      setMovements(movementsResult.data || []);
    }

    if (closingResult.error) {
      setMessage(`No se pudo cargar corte: ${closingResult.error.message}`);
      setClosing(null);
    } else {
      setClosing(closingResult.data || null);
      setCountedCash(Number(closingResult.data?.counted_cash || 0));
      setClosingNotes(closingResult.data?.notes || "");
    }

    setLoadingData(false);
  };

  const summary = useMemo(() => {
    const cashMovements = movements.filter(isCashMovement);

    const openingCash = cashMovements
      .filter((item) => item.movement_type === "fondo_inicial")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const cashIncome = cashMovements
      .filter(
        (item) =>
          item.movement_type === "ingreso" &&
          item.payment_method === "Efectivo"
      )
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const cardIncome = movements
      .filter(
        (item) =>
          item.movement_type === "ingreso" && item.payment_method === "Tarjeta"
      )
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const transferIncome = movements
      .filter(
        (item) =>
          item.movement_type === "ingreso" &&
          item.payment_method === "Transferencia"
      )
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const mixedIncome = movements
      .filter(
        (item) =>
          item.movement_type === "ingreso" && item.payment_method === "Mixto"
      )
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const cashOut = cashMovements
      .filter(
        (item) =>
          item.movement_type === "salida" || item.movement_type === "retiro"
      )
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const positiveAdjustments = cashMovements
      .filter((item) => item.movement_type === "ajuste")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const expectedCash =
      openingCash + cashIncome + positiveAdjustments - cashOut;
    const counted = Number(countedCash || 0);
    const difference = counted - expectedCash;

    return {
      openingCash,
      cashIncome,
      cardIncome,
      transferIncome,
      mixedIncome,
      cashOut,
      positiveAdjustments,
      expectedCash,
      countedCash: counted,
      difference,
      totalIncome: cashIncome + cardIncome + transferIncome + mixedIncome,
    };
  }, [movements, countedCash]);

  const handleMovementChange = (field, value) => {
    setMovementForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const saveMovement = async () => {
    setMessage("");
    setCashMessage("");
    setActiveCashMessage("movimiento");

    if (!movementForm.movement_date) {
      setCashMessage("Selecciona una fecha.");
      return;
    }

    if (!movementForm.concept.trim()) {
      setCashMessage("Escribe un concepto.");
      return;
    }

    if (Number(movementForm.amount || 0) <= 0) {
      setCashMessage("El monto debe ser mayor a cero.");
      return;
    }

    const { error } = await supabase.from("cash_movements").insert([
      {
        movement_date: movementForm.movement_date,
        movement_type: movementForm.movement_type,
        amount: Number(movementForm.amount || 0),
        payment_method: movementForm.payment_method,
        concept: movementForm.concept.trim(),
        category: movementForm.category.trim() || null,
        notes: movementForm.notes.trim() || null,
        updated_at: new Date().toISOString(),
      },
    ]);

    if (error) {
      setCashMessage(`No se pudo guardar movimiento: ${error.message}`);
      return;
    }

    setCashMessage("Movimiento guardado correctamente ✨");
    setMovementForm({
      movement_date: selectedDate,
      movement_type: "salida",
      amount: 0,
      payment_method: "Efectivo",
      concept: "",
      category: "",
      notes: "",
    });
    await loadData();
  };

  const deleteMovement = async (movement) => {
    setMessage("");
    setCashMessage("");
    setActiveCashMessage("movimientos");

    if (movement.payment_id) {
      setMessage(
        "Este movimiento viene de un cobro. No se puede eliminar desde Caja."
      );
      return;
    }

    const confirmed = window.confirm("¿Eliminar este movimiento de caja?");
    if (!confirmed) return;

    const { error } = await supabase
      .from("cash_movements")
      .delete()
      .eq("id", movement.id);

    if (error) {
      setMessage(`No se pudo eliminar movimiento: ${error.message}`);
      return;
    }

    setMessage("Movimiento eliminado correctamente.");
    await loadData();
  };

  const saveClosing = async () => {
    setMessage("");
    setCashMessage("");
    setActiveCashMessage("corte");

    const payload = {
      closing_date: selectedDate,
      opening_cash: summary.openingCash,
      cash_income: summary.cashIncome,
      cash_out: summary.cashOut,
      expected_cash: summary.expectedCash,
      counted_cash: summary.countedCash,
      difference: summary.difference,
      notes: closingNotes.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("cash_closings")
      .upsert(payload, { onConflict: "closing_date" });

    if (error) {
      setCashMessage(`No se pudo guardar corte: ${error.message}`);
      return;
    }

    setCashMessage("Corte de caja guardado correctamente ✨");
    await loadData();
  };

  if (loadingSession) {
    return (
      <main className="min-h-screen bg-[#eef1f3] px-6 py-10 text-[#263238]">
        <p>Cargando...</p>
      </main>
    );
  }

  return (
    <AdminShell
      title="Caja chica"
      subtitle="Controla efectivo, gastos, retiros y cortes diarios."
      activeModule="caja"
      menuItems={menuItems}
      activeSection={activeSection}
      setActiveSection={setActiveSection}
    >
      {message && (
        <div
          className={`mb-6 rounded-2xl px-5 py-4 text-sm font-medium ${getToastStyle(
            message
          )}`}
        >
          {message}
        </div>
      )}

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <Card>
          <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
            Fecha
          </p>
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => {
              setSelectedDate(event.target.value);
              setMovementForm((current) => ({
                ...current,
                movement_date: event.target.value,
              }));
            }}
            className="mt-3 w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
          />
        </Card>

        <Card>
          <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
            Efectivo esperado
          </p>
          <p className="mt-3 text-4xl font-light">
            {formatMoney(summary.expectedCash)}
          </p>
        </Card>

        <Card>
          <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
            Efectivo contado
          </p>
          <p className="mt-3 text-4xl font-light">
            {formatMoney(summary.countedCash)}
          </p>
        </Card>

        <Card>
          <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
            Diferencia
          </p>
          <p
            className={`mt-3 text-4xl font-light ${
              summary.difference < 0
                ? "text-red-600"
                : summary.difference > 0
                ? "text-green-700"
                : "text-[#263238]"
            }`}
          >
            {formatMoney(summary.difference)}
          </p>
        </Card>
      </div>

      {activeSection === "corte" && (
        <Card>
          <SectionHeader
            eyebrow="Corte"
            title="Corte de caja diario"
            description="El efectivo esperado se calcula con fondo inicial + cobros en efectivo - salidas/retiros."
            action={
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-full border border-[#bd7b83] px-5 py-3 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
              >
                Imprimir / Guardar PDF
              </button>
            }
          />

          <div className="grid gap-5 lg:grid-cols-[1fr_0.75fr]">
            <div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <SummaryBox label="Fondo inicial" value={summary.openingCash} />
                <SummaryBox
                  label="Cobros en efectivo"
                  value={summary.cashIncome}
                />
                <SummaryBox
                  label="Transferencias"
                  value={summary.transferIncome}
                />
                <SummaryBox label="Tarjeta" value={summary.cardIncome} />
                <SummaryBox label="Mixto" value={summary.mixedIncome} />
                <SummaryBox
                  label="Salidas / retiros"
                  value={summary.cashOut}
                  negative
                />
                <SummaryBox
                  label="Ajustes"
                  value={summary.positiveAdjustments}
                />
                <SummaryBox label="Total cobrado" value={summary.totalIncome} />
                <SummaryBox
                  label="Efectivo esperado"
                  value={summary.expectedCash}
                />
              </div>

              <div className="mt-6 rounded-2xl bg-[#fff6fb] p-5">
                <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
                  Estado del corte
                </p>

                <p className="mt-3 text-sm leading-6 text-[#68777c]">
                  {closing
                    ? "Este día ya tiene corte guardado. Puedes actualizar el efectivo contado y volver a guardar."
                    : "Este día todavía no tiene corte guardado."}
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-[#f7f9fa] p-5">
              <h4 className="text-lg font-light text-[#263238]">
                Guardar corte
              </h4>

              <label className="mb-2 mt-4 block text-sm text-[#68777c]">
                Efectivo contado en caja
              </label>
              <input
                type="number"
                value={countedCash}
                onChange={(event) => setCountedCash(event.target.value)}
                className="w-full rounded-2xl border border-[#dde3e6] bg-white px-4 py-3 outline-none"
              />

              <div className="mt-4 rounded-2xl bg-white p-4">
                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-[#68777c]">Esperado</span>
                  <span>{formatMoney(summary.expectedCash)}</span>
                </div>

                <div className="mt-2 flex justify-between gap-3 text-sm">
                  <span className="text-[#68777c]">Contado</span>
                  <span>{formatMoney(summary.countedCash)}</span>
                </div>

                <div className="mt-3 border-t border-[#dde3e6] pt-3">
                  <div className="flex justify-between gap-3">
                    <span className="font-medium text-[#263238]">
                      Diferencia
                    </span>
                    <span
                      className={`font-medium ${
                        summary.difference < 0
                          ? "text-red-600"
                          : summary.difference > 0
                          ? "text-green-700"
                          : "text-[#263238]"
                      }`}
                    >
                      {formatMoney(summary.difference)}
                    </span>
                  </div>
                </div>
              </div>

              <textarea
                value={closingNotes}
                onChange={(event) => setClosingNotes(event.target.value)}
                className="mt-4 min-h-24 w-full rounded-2xl border border-[#dde3e6] bg-white px-4 py-3 outline-none"
                placeholder="Notas del corte..."
              />

              {cashMessage && activeCashMessage === "corte" && (
                <div
                  className={`mt-4 rounded-2xl px-5 py-4 text-sm font-medium ${getToastStyle(
                    cashMessage
                  )}`}
                >
                  {cashMessage}
                </div>
              )}

              <button
                type="button"
                onClick={saveClosing}
                className="mt-4 w-full rounded-full bg-[#bd7b83] px-6 py-4 text-white transition hover:opacity-90"
              >
                Guardar corte
              </button>
            </div>
          </div>
        </Card>
      )}

      {activeSection === "movimientos" && (
        <Card>
          <SectionHeader
            eyebrow="Movimientos"
            title="Historial del día"
            description="Los cobros en efectivo llegan automáticamente desde Cobros."
            action={
              <button
                type="button"
                onClick={() => setActiveSection("nuevo")}
                className="rounded-full bg-[#bd7b83] px-5 py-3 text-sm text-white transition hover:opacity-90"
              >
                Nuevo movimiento
              </button>
            }
          />

          {loadingData ? (
            <p className="text-sm text-[#68777c]">Cargando movimientos...</p>
          ) : movements.length === 0 ? (
            <div className="rounded-2xl bg-[#f7f9fa] p-5 text-sm text-[#68777c]">
              No hay movimientos en esta fecha.
            </div>
          ) : (
            <div className="space-y-4">
              {movements.map((movement) => (
                <div
                  key={movement.id}
                  className="rounded-2xl border border-[#dde3e6] bg-[#fdfefe] p-5"
                >
                  <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                    <div>
                      <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
                        {getMovementLabel(movement.movement_type)}
                      </p>

                      <h3 className="mt-2 text-lg font-light text-[#263238]">
                        {movement.concept || "Movimiento de caja"}
                      </h3>

                      <p className="mt-1 text-sm text-[#68777c]">
                        Método: {movement.payment_method || "Efectivo"}
                      </p>

                      {movement.category && (
                        <p className="text-sm text-[#68777c]">
                          Categoría: {movement.category}
                        </p>
                      )}

                      {movement.payments?.clients?.full_name && (
                        <p className="mt-2 rounded-full bg-[#fff6fb] px-3 py-1 text-xs text-[#8a5f63]">
                          Cobro de: {movement.payments.clients.full_name}
                        </p>
                      )}

                      {movement.notes && (
                        <p className="mt-3 rounded-xl bg-[#f7f9fa] p-3 text-sm text-[#68777c]">
                          {movement.notes}
                        </p>
                      )}
                    </div>

                    <div className="text-right">
                      <p
                        className={`text-3xl font-light ${
                          movement.movement_type === "salida" ||
                          movement.movement_type === "retiro"
                            ? "text-red-600"
                            : "text-[#263238]"
                        }`}
                      >
                        {movement.movement_type === "salida" ||
                        movement.movement_type === "retiro"
                          ? "- "
                          : ""}
                        {formatMoney(movement.amount)}
                      </p>

                      {movement.payment_id ? (
                        <p className="mt-2 text-xs text-[#8a969a]">
                          Automático desde Cobros
                        </p>
                      ) : (
                        <button
                          type="button"
                          onClick={() => deleteMovement(movement)}
                          className="mt-3 text-xs text-red-600"
                        >
                          Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {activeSection === "nuevo" && (
        <Card>
          <SectionHeader
            eyebrow="Movimiento"
            title="Registrar entrada o salida"
            description="Usa esta sección para fondo inicial, gastos, compras, retiros o ajustes."
          />

          <div className="grid gap-5 lg:grid-cols-[1fr_0.75fr]">
            <div className="rounded-2xl bg-[#f7f9fa] p-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm text-[#68777c]">
                    Fecha
                  </label>
                  <input
                    type="date"
                    value={movementForm.movement_date}
                    onChange={(event) =>
                      handleMovementChange("movement_date", event.target.value)
                    }
                    className="w-full rounded-2xl border border-[#dde3e6] bg-white px-4 py-3 outline-none"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#68777c]">
                    Tipo
                  </label>
                  <select
                    value={movementForm.movement_type}
                    onChange={(event) =>
                      handleMovementChange("movement_type", event.target.value)
                    }
                    className="w-full rounded-2xl border border-[#dde3e6] bg-white px-4 py-3 outline-none"
                  >
                    {movementTypes.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#68777c]">
                    Monto
                  </label>
                  <input
                    type="number"
                    value={movementForm.amount}
                    onChange={(event) =>
                      handleMovementChange("amount", event.target.value)
                    }
                    className="w-full rounded-2xl border border-[#dde3e6] bg-white px-4 py-3 outline-none"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#68777c]">
                    Método
                  </label>
                  <select
                    value={movementForm.payment_method}
                    onChange={(event) =>
                      handleMovementChange("payment_method", event.target.value)
                    }
                    className="w-full rounded-2xl border border-[#dde3e6] bg-white px-4 py-3 outline-none"
                  >
                    {paymentMethods.map((method) => (
                      <option key={method} value={method}>
                        {method}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#68777c]">
                    Concepto
                  </label>
                  <input
                    type="text"
                    value={movementForm.concept}
                    onChange={(event) =>
                      handleMovementChange("concept", event.target.value)
                    }
                    className="w-full rounded-2xl border border-[#dde3e6] bg-white px-4 py-3 outline-none"
                    placeholder="Ej. Compra de algodón"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm text-[#68777c]">
                    Categoría
                  </label>
                  <input
                    type="text"
                    value={movementForm.category}
                    onChange={(event) =>
                      handleMovementChange("category", event.target.value)
                    }
                    className="w-full rounded-2xl border border-[#dde3e6] bg-white px-4 py-3 outline-none"
                    placeholder="Ej. Insumos, retiro, limpieza"
                  />
                </div>
              </div>

              <textarea
                value={movementForm.notes}
                onChange={(event) =>
                  handleMovementChange("notes", event.target.value)
                }
                className="mt-4 min-h-24 w-full rounded-2xl border border-[#dde3e6] bg-white px-4 py-3 outline-none"
                placeholder="Notas..."
              />

              {cashMessage && activeCashMessage === "movimiento" && (
                <div
                  className={`mt-4 rounded-2xl px-5 py-4 text-sm font-medium ${getToastStyle(
                    cashMessage
                  )}`}
                >
                  {cashMessage}
                </div>
              )}

              <button
                type="button"
                onClick={saveMovement}
                className="mt-4 w-full rounded-full bg-[#bd7b83] px-6 py-4 text-white transition hover:opacity-90"
              >
                Guardar movimiento
              </button>
            </div>

            <div className="rounded-2xl bg-[#fff6fb] p-5">
              <p className="text-xs uppercase tracking-[0.25em] text-[#bd7b83]">
                Cómo usar caja chica
              </p>

              <div className="mt-3 space-y-3 text-sm leading-6 text-[#68777c]">
                <p>
                  <b>Fondo inicial:</b> registra el efectivo con el que empieza
                  el día.
                </p>
                <p>
                  <b>Ingreso:</b> úsalo para entradas manuales de efectivo. Los
                  cobros se agregan automáticamente desde Cobros.
                </p>
                <p>
                  <b>Salida / gasto:</b> compras de insumos, limpieza, comida,
                  pagos pequeños, etc.
                </p>
                <p>
                  <b>Retiro:</b> cuando se saca efectivo de la caja.
                </p>
                <p>
                  <b>Corte:</b> al final del día escribe el efectivo contado y
                  guarda el corte para ver diferencia.
                </p>
              </div>
            </div>
          </div>
        </Card>
      )}
    </AdminShell>
  );
}

function SummaryBox({ label, value, negative = false }) {
  return (
    <div className="rounded-2xl bg-[#f7f9fa] p-5">
      <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
        {label}
      </p>
      <p
        className={`mt-3 text-2xl font-light ${
          negative ? "text-red-600" : "text-[#263238]"
        }`}
      >
        {negative ? "- " : ""}
        {formatMoney(value)}
      </p>
    </div>
  );
}