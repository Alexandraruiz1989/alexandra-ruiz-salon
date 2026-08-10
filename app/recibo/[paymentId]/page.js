"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

export default function ReceiptPage() {
  const params = useParams();
  const paymentId = params?.paymentId;

  const [loading, setLoading] = useState(true);
  const [payment, setPayment] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadReceipt = async () => {
      if (!paymentId) return;

      setLoading(true);
      setError("");

      const { data, error } = await supabase
        .from("payments")
        .select(
          `
          *,
          clients (
            id,
            full_name,
            phone,
            email
          ),
          appointments (
            id,
            appointment_date,
            start_time,
            end_time
          ),
          payment_service_items (
            id,
            appointment_service_id,
            name,
            staff_name,
            quantity,
            unit_price,
            total_price
          ),
          payment_extra_items (
            id,
            appointment_service_id,
            appointment_extra_item_id,
            name,
            quantity,
            unit_price,
            total_price,
            staff_id
          ),
          payment_staff_totals (
            staff_id,
            tip_amount,
            staff (
              id,
              full_name
            )
          )
        `
        )
        .eq("id", paymentId)
        .single();

      if (error) {
        setError(`No se pudo cargar el recibo: ${error.message}`);
        setPayment(null);
      } else {
        setPayment(data);
      }

      setLoading(false);
    };

    loadReceipt();
  }, [paymentId]);

  const receiptNumber = useMemo(() => {
    if (!payment?.id) return "";
    return String(payment.id).slice(0, 8).toUpperCase();
  }, [payment]);

  const extrasByService = useMemo(() => {
    const groups = new Map();
    (payment?.payment_extra_items || []).forEach((extra) => {
      if (!extra.appointment_service_id) return;
      const current = groups.get(extra.appointment_service_id) || [];
      current.push(extra);
      groups.set(extra.appointment_service_id, current);
    });
    return groups;
  }, [payment]);

  const unassignedExtras = useMemo(
    () =>
      (payment?.payment_extra_items || []).filter(
        (extra) => !extra.appointment_service_id
      ),
    [payment]
  );

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f8f4f3] px-4 py-10">
        <div className="mx-auto max-w-4xl rounded-[2rem] bg-white p-8 shadow-sm">
          <p className="text-sm text-[#68777c]">Cargando recibo...</p>
        </div>
      </main>
    );
  }

  if (error || !payment) {
    return (
      <main className="min-h-screen bg-[#f8f4f3] px-4 py-10">
        <div className="mx-auto max-w-4xl rounded-[2rem] bg-white p-8 shadow-sm">
          <p className="text-sm text-red-600">
            {error || "No se encontró el recibo."}
          </p>

          <Link
            href="/admin/cobros"
            className="mt-6 inline-flex rounded-full bg-[#bd7b83] px-6 py-3 text-sm text-white transition hover:opacity-90"
          >
            Volver a cobros
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8f4f3] px-4 py-8 md:px-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap gap-3 print:hidden">
          <Link
            href="/admin/cobros"
            className="inline-flex rounded-full border border-[#bd7b83] px-5 py-3 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
          >
            Volver a cobros
          </Link>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex rounded-full bg-[#bd7b83] px-5 py-3 text-sm text-white transition hover:opacity-90"
          >
            Imprimir / Guardar PDF
          </button>
        </div>

        <section className="overflow-hidden rounded-[2rem] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.08)] print:shadow-none">
          <div className="bg-gradient-to-r from-[#fff8fb] via-[#fdf7f8] to-[#fffdfd] px-8 py-10 md:px-12">
            <div className="flex flex-col justify-between gap-8 md:flex-row md:items-start">
              <div className="flex items-center gap-5">
                <div className="relative h-20 w-20 overflow-hidden rounded-2xl bg-white shadow-sm">
                  <Image
                    src="/logo-alexandra-ruiz.png"
                    alt="Alexandra Ruiz Salón Spa"
                    fill
                    className="object-contain p-2"
                  />
                </div>

                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[#bd7b83]">
                    Recibo de pago
                  </p>
                  <h1 className="mt-2 text-3xl font-light text-[#263238] md:text-4xl">
                    Alexandra Ruiz Salón Spa
                  </h1>
                  <p className="mt-2 text-sm text-[#68777c]">
                    El lujo de consentirte en un espacio muy tuyo
                  </p>
                </div>
              </div>

              <div className="rounded-[1.5rem] bg-white/80 p-5 shadow-sm md:min-w-[250px]">
                <p className="text-xs uppercase tracking-[0.25em] text-[#bd7b83]">
                  Folio
                </p>
                <p className="mt-2 text-2xl font-light text-[#263238]">
                  #{receiptNumber}
                </p>

                <div className="mt-4 space-y-1 text-sm text-[#68777c]">
                  <p>
                    <span className="font-medium text-[#263238]">Fecha:</span>{" "}
                    {payment.payment_date || "-"}
                  </p>
                  <p>
                    <span className="font-medium text-[#263238]">Método:</span>{" "}
                    {payment.payment_method || "Efectivo"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="px-8 py-8 md:px-12">
            <div className="grid gap-5 md:grid-cols-2">
              <InfoBox title="Clienta">
                <p className="text-xl font-light text-[#263238]">
                  {payment.clients?.full_name || "Clienta"}
                </p>
                {payment.clients?.phone && (
                  <p className="mt-2 text-sm text-[#68777c]">
                    Tel: {payment.clients.phone}
                  </p>
                )}
              </InfoBox>

              <InfoBox title="Información de la cita">
                <p className="text-sm text-[#68777c]">
                  <span className="font-medium text-[#263238]">Fecha:</span>{" "}
                  {payment.appointments?.appointment_date ||
                    payment.payment_date ||
                    "-"}
                </p>
                <p className="mt-1 text-sm text-[#68777c]">
                  <span className="font-medium text-[#263238]">Hora:</span>{" "}
                  {formatTime(payment.appointments?.start_time)}
                </p>
              </InfoBox>
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <DetailCard title="Servicios cobrados" subtitle="Detalle">
                {(payment.payment_service_items || []).length === 0 ? (
                  <EmptyText>No hay servicios registrados.</EmptyText>
                ) : (
                  payment.payment_service_items.map((item) => {
                    const relatedExtras =
                      extrasByService.get(item.appointment_service_id) || [];

                    return (
                      <div key={item.id} className="rounded-2xl bg-[#f7f9fa] p-4">
                        <ReceiptLine
                          title={item.name}
                          subtitle={
                            item.staff_name
                              ? `Atendió: ${item.staff_name}`
                              : "Sin técnica asignada"
                          }
                          quantity={item.quantity}
                          unitPrice={item.unit_price}
                          total={item.total_price}
                        />
                        {relatedExtras.length > 0 && (
                          <div className="ml-4 mt-3 border-l-2 border-[#bd7b83]/30 pl-4">
                            {relatedExtras.map((extra) => (
                              <ReceiptLine
                                key={extra.id}
                                title={`Extra: ${extra.name}`}
                                subtitle={`Aplicado a ${item.name}`}
                                quantity={extra.quantity}
                                unitPrice={extra.unit_price}
                                total={extra.total_price}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </DetailCard>

              <DetailCard
                title="Extras sin servicio identificado"
                subtitle="Compatibilidad histórica"
              >
                {unassignedExtras.length === 0 ? (
                  <EmptyText>
                    Todos los extras están ligados a su servicio o no hubo extras.
                  </EmptyText>
                ) : (
                  unassignedExtras.map((item) => (
                    <ReceiptLine
                      key={item.id}
                      title={item.name}
                      subtitle="Registro histórico sin servicio identificado"
                      quantity={item.quantity}
                      unitPrice={item.unit_price}
                      total={item.total_price}
                    />
                  ))
                )}
              </DetailCard>
            </div>

            <div className="mt-8 rounded-[1.75rem] bg-[#fff6fb] p-6">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <AmountBox
                  label="Subtotal servicios"
                  value={payment.subtotal_services}
                />
                <AmountBox label="Subtotal extras" value={payment.subtotal_extras} />
                <AmountBox label="Descuento" value={payment.discount_amount} negative />
                <AmountBox label="Anticipo" value={payment.deposit_amount} negative />
                <AmountBox label="Propina" value={payment.tip_amount} />

                <div className="rounded-[1.35rem] bg-white p-5 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
                    Total pagado
                  </p>
                  <p className="mt-3 text-3xl font-light text-[#263238]">
                    {formatMoney(payment.total_amount)}
                  </p>
                </div>
              </div>

              {(payment.payment_staff_totals || []).some(
                (total) => Number(total.tip_amount || 0) > 0
              ) && (
                <div className="mt-5 rounded-[1.35rem] bg-white p-5 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
                    Distribución de propina
                  </p>
                  <div className="mt-3 space-y-2">
                    {payment.payment_staff_totals
                      .filter((total) => Number(total.tip_amount || 0) > 0)
                      .map((total) => (
                        <div
                          key={total.staff_id}
                          className="flex justify-between gap-4 text-sm text-[#68777c]"
                        >
                          <span>{total.staff?.full_name || "Colaboradora"}</span>
                          <span>{formatMoney(total.tip_amount)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {payment.notes && (
              <div className="mt-8 rounded-[1.5rem] bg-[#f7f9fa] p-5">
                <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
                  Notas
                </p>
                <p className="mt-3 text-sm leading-7 text-[#68777c]">
                  {payment.notes}
                </p>
              </div>
            )}

            <div className="mt-10 rounded-[1.75rem] border border-dashed border-[#e5cdd2] bg-[#fffdfd] px-6 py-8 text-center">
              <p className="text-sm uppercase tracking-[0.3em] text-[#bd7b83]">
                Gracias por tu visita
              </p>
              <h3 className="mt-3 text-2xl font-light text-[#263238]">
                Fue un gusto atenderte ✨
              </h3>
              <p className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-[#68777c]">
                Gracias por confiar en Alexandra Ruiz Salón Spa. Esperamos que
                hayas disfrutado tu experiencia con nosotras. Te esperamos muy
                pronto para seguir consintiéndote 💕
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function InfoBox({ title, children }) {
  return (
    <div className="rounded-[1.5rem] bg-[#f7f9fa] p-5">
      <p className="text-xs uppercase tracking-[0.25em] text-[#bd7b83]">
        {title}
      </p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function DetailCard({ title, subtitle, children }) {
  return (
    <div className="rounded-[1.5rem] border border-[#ece5e7] p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-light text-[#263238]">{title}</h2>
        <span className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
          {subtitle}
        </span>
      </div>

      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

function ReceiptLine({ title, subtitle, quantity, unitPrice, total }) {
  return (
    <div className="rounded-2xl bg-[#fcfbfb] p-4">
      <div className="flex justify-between gap-3">
        <div>
          <p className="font-medium text-[#263238]">{title}</p>
          <p className="mt-1 text-sm text-[#68777c]">{subtitle}</p>
          <p className="mt-1 text-xs text-[#8a969a]">
            Cantidad: {quantity || 1}
          </p>
        </div>

        <div className="text-right">
          <p className="text-sm text-[#68777c]">{formatMoney(unitPrice)}</p>
          <p className="mt-1 font-medium text-[#263238]">
            {formatMoney(total)}
          </p>
        </div>
      </div>
    </div>
  );
}

function EmptyText({ children }) {
  return (
    <div className="rounded-2xl bg-[#f7f9fa] p-4 text-sm text-[#68777c]">
      {children}
    </div>
  );
}

function AmountBox({ label, value, negative = false }) {
  return (
    <div className="rounded-[1.35rem] bg-white p-5 shadow-sm">
      <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">
        {label}
      </p>
      <p className="mt-3 text-2xl font-light text-[#263238]">
        {negative ? "- " : ""}
        {formatMoney(value)}
      </p>
    </div>
  );
}

function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatTime(time) {
  if (!time) return "-";
  return String(time).slice(0, 5);
}
