"use client";

import { useEffect, useMemo, useState } from "react";

import { supabase } from "../lib/supabaseClient";

const emptyRequestForm = {
  product_supplier_id: "",
  request_type: "entrada",
  quantity: 1,
  reason: "",
  notes: "",
};

const requestTypeLabels = {
  entrada: "Entrada",
  retiro: "Retiro",
  correccion: "Corrección",
  devolucion: "Devolución",
  ajuste: "Ajuste",
  otro: "Otro",
};

const statusLabels = {
  pending: "Pendiente",
  approved: "Aprobada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
  completed: "Completada",
};

function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("es-MX");
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("es-MX");
}

function Card({ children, className = "" }) {
  return (
    <section className={`rounded-[1.5rem] bg-white p-6 shadow-sm ${className}`}>
      {children}
    </section>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-2xl bg-[#f7f9fa] p-5">
      <p className="text-xs uppercase tracking-[0.22em] text-[#bd7b83]">{label}</p>
      <p className="mt-2 text-2xl font-light text-[#263238]">{value}</p>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm text-[#68777c]">{label}</span>
      {children}
    </label>
  );
}

function TextInput({ value, onChange, type = "text", placeholder = "" }) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
    />
  );
}

export default function SupplierPortalPage() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [portalData, setPortalData] = useState(null);
  const [requestForm, setRequestForm] = useState(emptyRequestForm);
  const [savingRequest, setSavingRequest] = useState(false);

  const activeProducts = useMemo(() => {
    return (portalData?.products || []).filter((product) => product.status === "activo");
  }, [portalData]);

  useEffect(() => {
    const start = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session || null);

      if (data.session) {
        await loadPortalData(data.session);
      }

      setLoading(false);
    };

    start();
  }, []);

  async function getToken() {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) {
      throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
    }
    return data.session.access_token;
  }

  async function loadPortalData() {
    try {
      const token = await getToken();
      const response = await fetch("/api/supplier/store", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const result = await response
        .json()
        .catch(() => ({ success: false, error: "Respuesta inválida del servidor." }));

      if (!response.ok || !result.success) {
        throw new Error(result.error || "No se pudo cargar el portal.");
      }

      setPortalData(result);
      setMessage("");
    } catch (error) {
      setPortalData(null);
      setMessage(error.message || "No se pudo cargar el portal proveedor.");
    }
  }

  const handleLogin = async (event) => {
    event.preventDefault();
    setMessage("");
    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      setLoading(false);
      setMessage(`No se pudo iniciar sesión: ${error.message}`);
      return;
    }

    setSession(data.session || null);
    await loadPortalData(data.session);
    setLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setPortalData(null);
    setPassword("");
  };

  const createMovementRequest = async () => {
    setSavingRequest(true);
    setMessage("");

    try {
      const token = await getToken();
      const response = await fetch("/api/supplier/store", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestForm),
      });
      const result = await response
        .json()
        .catch(() => ({ success: false, error: "Respuesta inválida del servidor." }));

      if (!response.ok || !result.success) {
        throw new Error(result.error || "No se pudo crear la solicitud.");
      }

      setRequestForm(emptyRequestForm);
      setMessage("Solicitud enviada para revisión del salón.");
      await loadPortalData();
    } catch (error) {
      setMessage(error.message || "No se pudo crear la solicitud.");
    } finally {
      setSavingRequest(false);
    }
  };

  const cancelRequest = async (request) => {
    try {
      const token = await getToken();
      const response = await fetch("/api/supplier/store", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: request.id }),
      });
      const result = await response
        .json()
        .catch(() => ({ success: false, error: "Respuesta inválida del servidor." }));

      if (!response.ok || !result.success) {
        throw new Error(result.error || "No se pudo cancelar la solicitud.");
      }

      setMessage("Solicitud cancelada.");
      await loadPortalData();
    } catch (error) {
      setMessage(error.message || "No se pudo cancelar la solicitud.");
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#eef1f3] px-6 text-[#263238]">
        <Card className="w-full max-w-md">
          <p className="text-sm text-[#68777c]">Cargando portal proveedor...</p>
        </Card>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#eef1f3] px-6 text-[#263238]">
        <Card className="w-full max-w-md">
          <p className="text-xs uppercase tracking-[0.3em] text-[#bd7b83]">
            Alexandra Ruiz
          </p>
          <h1 className="mt-2 text-3xl font-light">Portal proveedor</h1>
          <p className="mt-3 text-sm leading-6 text-[#68777c]">
            Ingresa con la cuenta vinculada por el salón para consultar tus productos,
            ventas y solicitudes de inventario.
          </p>

          {message && (
            <div className="mt-5 rounded-2xl bg-red-600 px-4 py-3 text-sm font-medium text-white">
              {message}
            </div>
          )}

          <form onSubmit={handleLogin} className="mt-6 space-y-4">
            <Field label="Correo">
              <TextInput
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="correo@proveedor.com"
              />
            </Field>
            <Field label="Contraseña">
              <TextInput
                type="password"
                value={password}
                onChange={setPassword}
                placeholder="Tu contraseña"
              />
            </Field>
            <button
              type="submit"
              className="w-full rounded-full bg-[#bd7b83] px-6 py-4 text-white transition hover:opacity-90"
            >
              Entrar al portal
            </button>
          </form>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#eef1f3] text-[#263238]">
      <header className="sticky top-0 z-20 border-b border-[#dde3e6] bg-white/95 px-4 py-4 backdrop-blur md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#bd7b83]">
              Portal proveedor
            </p>
            <h1 className="mt-1 text-3xl font-light">
              {portalData?.supplier?.commercial_name || "Proveedor"}
            </h1>
            <p className="mt-1 text-sm text-[#68777c]">
              Consulta solo tu stock, tus ventas y tus solicitudes.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={loadPortalData}
              className="rounded-full border border-[#bd7b83] px-5 py-3 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
            >
              Actualizar
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full border border-[#68777c] px-5 py-3 text-sm text-[#68777c] transition hover:bg-[#68777c] hover:text-white"
            >
              Cerrar sesión
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
        {message && (
          <div className="rounded-2xl bg-[#263238] px-5 py-4 text-sm font-medium text-white">
            {message}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="Ventas" value={portalData?.summary?.sales_count || 0} />
          <Metric label="Unidades" value={portalData?.summary?.units_sold || 0} />
          <Metric
            label="Importe"
            value={formatMoney(portalData?.summary?.supplier_net_amount)}
          />
          <Metric label="Stock" value={portalData?.summary?.stock_units || 0} />
          <Metric
            label="Pendientes"
            value={portalData?.summary?.pending_requests || 0}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-6">
            <Card>
              <p className="text-xs uppercase tracking-[0.28em] text-[#bd7b83]">
                Solicitudes
              </p>
              <h2 className="mt-2 text-2xl font-light">Solicitar movimiento</h2>
              <div className="mt-5 space-y-4">
                <Field label="Producto">
                  <select
                    value={requestForm.product_supplier_id}
                    onChange={(event) =>
                      setRequestForm((current) => ({
                        ...current,
                        product_supplier_id: event.target.value,
                      }))
                    }
                    className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                  >
                    <option value="">Seleccionar producto</option>
                    {activeProducts.map((product) => (
                      <option
                        key={product.product_supplier_id}
                        value={product.product_supplier_id}
                      >
                        {product.name} · Stock {product.stock}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Tipo">
                    <select
                      value={requestForm.request_type}
                      onChange={(event) =>
                        setRequestForm((current) => ({
                          ...current,
                          request_type: event.target.value,
                        }))
                      }
                      className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                    >
                      {Object.entries(requestTypeLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Cantidad">
                    <TextInput
                      type="number"
                      value={requestForm.quantity}
                      onChange={(value) =>
                        setRequestForm((current) => ({ ...current, quantity: value }))
                      }
                    />
                  </Field>
                </div>
                <Field label="Motivo">
                  <TextInput
                    value={requestForm.reason}
                    onChange={(value) =>
                      setRequestForm((current) => ({ ...current, reason: value }))
                    }
                    placeholder="Ej. nueva mercancía, ajuste físico..."
                  />
                </Field>
                <Field label="Notas">
                  <textarea
                    value={requestForm.notes}
                    onChange={(event) =>
                      setRequestForm((current) => ({ ...current, notes: event.target.value }))
                    }
                    className="min-h-24 w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                  />
                </Field>
                <button
                  type="button"
                  onClick={createMovementRequest}
                  disabled={savingRequest}
                  className="w-full rounded-full bg-[#bd7b83] px-6 py-4 text-white transition hover:opacity-90 disabled:opacity-60"
                >
                  {savingRequest ? "Enviando..." : "Enviar solicitud"}
                </button>
              </div>
            </Card>

            <Card>
              <p className="text-xs uppercase tracking-[0.28em] text-[#bd7b83]">
                Mis productos
              </p>
              <h2 className="mt-2 text-2xl font-light">Stock actual</h2>
              <div className="mt-5 space-y-3">
                {(portalData?.products || []).map((product) => (
                  <div
                    key={product.product_supplier_id}
                    className="rounded-2xl bg-[#f7f9fa] p-4"
                  >
                    <p className="font-medium">{product.name}</p>
                    <p className="mt-1 text-sm text-[#68777c]">
                      SKU: {product.sku || "-"} · Precio: {formatMoney(product.price)}
                    </p>
                    <p className="mt-2 text-sm text-[#263238]">
                      Stock: {product.stock} · {product.status}
                    </p>
                  </div>
                ))}
                {(portalData?.products || []).length === 0 && (
                  <p className="rounded-2xl bg-[#f7f9fa] p-4 text-sm text-[#68777c]">
                    Aún no tienes productos asignados.
                  </p>
                )}
              </div>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <p className="text-xs uppercase tracking-[0.28em] text-[#bd7b83]">
                Mis ventas
              </p>
              <h2 className="mt-2 text-2xl font-light">Ventas registradas</h2>
              <div className="mt-5 space-y-3">
                {(portalData?.sales || []).map((sale) => (
                  <div key={sale.id} className="rounded-2xl bg-[#f7f9fa] p-4">
                    <div className="flex flex-col justify-between gap-2 md:flex-row">
                      <div>
                        <p className="font-medium">{sale.product_name}</p>
                        <p className="mt-1 text-sm text-[#68777c]">
                          {formatDate(sale.sale_date)} · {sale.sale_reference || "Venta"} ·{" "}
                          {sale.payment_method || "Forma de pago no especificada"}
                        </p>
                        <p className="mt-1 text-sm text-[#68777c]">
                          Cantidad: {sale.quantity} · Precio: {formatMoney(sale.unit_price)} ·
                          Descuento: {formatMoney(sale.discount_amount)}
                        </p>
                      </div>
                      <div className="text-left md:text-right">
                        <p className="text-sm text-[#68777c]">Importe proveedor</p>
                        <p className="text-lg font-medium">
                          {formatMoney(sale.supplier_net_amount)}
                        </p>
                        <p className="text-xs text-[#8a969a]">
                          {statusLabels[sale.status] || sale.status}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                {(portalData?.sales || []).length === 0 && (
                  <p className="rounded-2xl bg-[#f7f9fa] p-4 text-sm text-[#68777c]">
                    Aún no hay ventas visibles para tu proveedor.
                  </p>
                )}
              </div>
            </Card>

            <Card>
              <p className="text-xs uppercase tracking-[0.28em] text-[#bd7b83]">
                Movimientos
              </p>
              <h2 className="mt-2 text-2xl font-light">Inventario</h2>
              <div className="mt-5 space-y-3">
                {(portalData?.movements || []).map((movement) => (
                  <div key={movement.id} className="rounded-2xl bg-[#f7f9fa] p-4">
                    <p className="font-medium">{movement.product_name}</p>
                    <p className="mt-1 text-sm text-[#68777c]">
                      {formatDateTime(movement.created_at)} · {movement.movement_type} ·{" "}
                      Cantidad {movement.quantity}
                    </p>
                    <p className="text-sm text-[#68777c]">
                      Stock {movement.previous_stock} → {movement.new_stock} ·{" "}
                      {movement.status}
                    </p>
                  </div>
                ))}
                {(portalData?.movements || []).length === 0 && (
                  <p className="rounded-2xl bg-[#f7f9fa] p-4 text-sm text-[#68777c]">
                    Aún no hay movimientos.
                  </p>
                )}
              </div>
            </Card>

            <Card>
              <p className="text-xs uppercase tracking-[0.28em] text-[#bd7b83]">
                Solicitudes
              </p>
              <h2 className="mt-2 text-2xl font-light">Estado de solicitudes</h2>
              <div className="mt-5 space-y-3">
                {(portalData?.requests || []).map((request) => (
                  <div key={request.id} className="rounded-2xl bg-[#f7f9fa] p-4">
                    <div className="flex flex-col justify-between gap-2 md:flex-row">
                      <div>
                        <p className="font-medium">{request.product_name}</p>
                        <p className="mt-1 text-sm text-[#68777c]">
                          {formatDateTime(request.requested_at)} ·{" "}
                          {requestTypeLabels[request.request_type] || request.request_type} ·{" "}
                          Cantidad {request.quantity}
                        </p>
                        {request.rejection_reason && (
                          <p className="mt-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                            Rechazo: {request.rejection_reason}
                          </p>
                        )}
                      </div>
                      <div className="flex items-start gap-2">
                        <span className="rounded-full bg-white px-3 py-1 text-xs text-[#68777c]">
                          {statusLabels[request.status] || request.status}
                        </span>
                        {request.status === "pending" && (
                          <button
                            type="button"
                            onClick={() => cancelRequest(request)}
                            className="rounded-full border border-red-500 px-3 py-1 text-xs text-red-600 transition hover:bg-red-600 hover:text-white"
                          >
                            Cancelar
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                {(portalData?.requests || []).length === 0 && (
                  <p className="rounded-2xl bg-[#f7f9fa] p-4 text-sm text-[#68777c]">
                    Aún no hay solicitudes.
                  </p>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
