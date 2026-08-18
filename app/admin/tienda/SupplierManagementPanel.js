"use client";

import { useEffect, useMemo, useState } from "react";

const emptySupplierForm = {
  commercial_name: "",
  legal_name: "",
  contact_name: "",
  phone: "",
  whatsapp_phone: "",
  email: "",
  address: "",
  rfc: "",
  notes: "",
  active: true,
};

const emptyProductSupplierForm = {
  product_id: "",
  supplier_id: "",
  supplier_sku: "",
  reference_cost: "",
  ownership_model: "consignment",
  is_default_for_sales: false,
  priority: 100,
  notes: "",
  active: true,
};

const emptySupplierUserForm = {
  supplier_id: "",
  email_snapshot: "",
  display_name: "",
  auth_user_id: "",
  user_profile_id: "",
  supplier_role: "supplier",
};

const ownershipLabels = {
  salon_owned: "Propiedad del salón",
  consignment: "Consignación",
  supplier_owned: "Propiedad del proveedor",
};

const statusLabels = {
  pending: "Pendiente",
  approved: "Aprobada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
};

function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("es-MX");
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

function SelectInput({ value, onChange, children }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
    >
      {children}
    </select>
  );
}

function Card({ children, className = "" }) {
  return (
    <section className={`rounded-[1.5rem] bg-white p-6 shadow-sm ${className}`}>
      {children}
    </section>
  );
}

function SectionTitle({ eyebrow, title, description }) {
  return (
    <div className="mb-5">
      <p className="text-xs uppercase tracking-[0.28em] text-[#bd7b83]">
        {eyebrow}
      </p>
      <h3 className="mt-2 text-2xl font-light">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-[#68777c]">{description}</p>
      )}
    </div>
  );
}

function Badge({ children, tone = "neutral" }) {
  const classes = {
    neutral: "bg-[#f7f9fa] text-[#68777c]",
    green: "bg-green-50 text-green-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
  };

  return (
    <span className={`rounded-full px-3 py-1 text-xs ${classes[tone] || classes.neutral}`}>
      {children}
    </span>
  );
}

export default function SupplierManagementPanel({
  mode = "suppliers",
  products = [],
  getAccessToken,
  setMessage,
  canManageApprovers = false,
}) {
  const [loading, setLoading] = useState(false);
  const [supplierForm, setSupplierForm] = useState(emptySupplierForm);
  const [editingSupplierId, setEditingSupplierId] = useState("");
  const [productSupplierForm, setProductSupplierForm] = useState(emptyProductSupplierForm);
  const [supplierUserForm, setSupplierUserForm] = useState(emptySupplierUserForm);
  const [approverProfileId, setApproverProfileId] = useState("");
  const [supplierData, setSupplierData] = useState({
    suppliers: [],
    product_suppliers: [],
    supplier_inventory: [],
    movement_requests: [],
    supplier_users: [],
    approvers: [],
    profiles: [],
  });

  const activeSuppliers = useMemo(
    () => supplierData.suppliers.filter((supplier) => supplier.active !== false),
    [supplierData.suppliers]
  );

  const activeProducts = useMemo(
    () => products.filter((product) => product.active !== false),
    [products]
  );

  const loadSupplierData = async () => {
    if (!getAccessToken) return;

    setLoading(true);

    try {
      const token = await getAccessToken();
      const response = await fetch("/api/admin/store/suppliers", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const result = await response
        .json()
        .catch(() => ({ success: false, error: "Respuesta inválida del servidor." }));

      if (!response.ok || !result.success) {
        throw new Error(result.error || "No se pudieron cargar proveedores.");
      }

      setSupplierData({
        suppliers: result.suppliers || [],
        product_suppliers: result.product_suppliers || [],
        supplier_inventory: result.supplier_inventory || [],
        movement_requests: result.movement_requests || [],
        supplier_users: result.supplier_users || [],
        approvers: result.approvers || [],
        profiles: result.profiles || [],
      });
      setApproverProfileId("");
    } catch (error) {
      setMessage?.(error.message || "No se pudieron cargar proveedores.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled) {
        loadSupplierData();
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const apiRequest = async ({ method = "POST", body }) => {
    const token = await getAccessToken();
    const response = await fetch("/api/admin/store/suppliers", {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const result = await response
      .json()
      .catch(() => ({ success: false, error: "Respuesta inválida del servidor." }));

    if (!response.ok || !result.success) {
      throw new Error(result.error || "No se pudo guardar.");
    }

    return result;
  };

  const saveSupplier = async () => {
    try {
      await apiRequest({
        method: editingSupplierId ? "PATCH" : "POST",
        body: {
          type: "supplier",
          id: editingSupplierId || undefined,
          supplier: supplierForm,
        },
      });
      setSupplierForm(emptySupplierForm);
      setEditingSupplierId("");
      setMessage?.("Proveedor guardado correctamente.");
      await loadSupplierData();
    } catch (error) {
      setMessage?.(error.message || "No se pudo guardar proveedor.");
    }
  };

  const editSupplier = (supplier) => {
    setEditingSupplierId(supplier.id);
    setSupplierForm({
      commercial_name: supplier.commercial_name || "",
      legal_name: supplier.legal_name || "",
      contact_name: supplier.contact_name || "",
      phone: supplier.phone || "",
      whatsapp_phone: supplier.whatsapp_phone || "",
      email: supplier.email || "",
      address: supplier.address || "",
      rfc: supplier.rfc || "",
      notes: supplier.notes || "",
      active: supplier.active !== false,
    });
  };

  const saveProductSupplier = async () => {
    try {
      await apiRequest({
        body: {
          type: "product_supplier",
          product_supplier: productSupplierForm,
        },
      });
      setProductSupplierForm(emptyProductSupplierForm);
      setMessage?.("Relación producto/proveedor guardada.");
      await loadSupplierData();
    } catch (error) {
      setMessage?.(error.message || "No se pudo asociar producto.");
    }
  };

  const saveSupplierUser = async () => {
    try {
      await apiRequest({
        body: {
          type: "supplier_user",
          supplier_user: supplierUserForm,
        },
      });
      setSupplierUserForm(emptySupplierUserForm);
      setMessage?.("Usuario proveedor vinculado.");
      await loadSupplierData();
    } catch (error) {
      setMessage?.(error.message || "No se pudo vincular usuario.");
    }
  };

  const toggleRecord = async ({ type, id, active }) => {
    try {
      await apiRequest({
        method: "PATCH",
        body: {
          type,
          id,
          active,
        },
      });
      setMessage?.("Estado actualizado.");
      await loadSupplierData();
    } catch (error) {
      setMessage?.(error.message || "No se pudo actualizar estado.");
    }
  };

  const reviewRequest = async (request, action) => {
    const body = {
      type: action === "approve" ? "approve_request" : "reject_request",
      id: request.id,
      request_id: request.id,
    };

    if (action === "reject") {
      const reason = window.prompt("Motivo del rechazo");
      if (!reason?.trim()) return;
      body.rejection_reason = reason.trim();
    }

    try {
      await apiRequest({ method: "PATCH", body });
      setMessage?.(action === "approve" ? "Solicitud aprobada." : "Solicitud rechazada.");
      await loadSupplierData();
    } catch (error) {
      setMessage?.(error.message || "No se pudo revisar la solicitud.");
    }
  };

  const saveApprover = async () => {
    if (!approverProfileId) {
      setMessage?.("Selecciona un usuario para autorizar.");
      return;
    }

    try {
      await apiRequest({
        body: {
          type: "approver",
          user_profile_id: approverProfileId,
        },
      });
      setMessage?.("Aprobador autorizado.");
      await loadSupplierData();
    } catch (error) {
      setMessage?.(error.message || "No se pudo autorizar aprobador.");
    }
  };

  if (mode === "requests") {
    return (
      <div className="space-y-6">
        <Card>
          <SectionTitle
            eyebrow="Solicitudes"
            title="Solicitudes de stock"
            description="Aprobar crea un movimiento real y actualiza stock por proveedor y stock total en una misma operación."
          />

          {loading ? (
            <p className="text-sm text-[#68777c]">Cargando solicitudes...</p>
          ) : supplierData.movement_requests.length === 0 ? (
            <p className="rounded-2xl bg-[#f7f9fa] p-5 text-sm text-[#68777c]">
              No hay solicitudes de inventario.
            </p>
          ) : (
            <div className="space-y-3">
              {supplierData.movement_requests.map((request) => {
                const inventory = supplierData.supplier_inventory.find(
                  (item) => item.product_supplier_id === request.product_supplier_id
                );
                const currentStock = Number(inventory?.current_stock || 0);
                const expectedStock =
                  request.request_type === "retiro"
                    ? currentStock - Number(request.quantity || 0)
                    : request.request_type === "ajuste" || request.request_type === "correccion"
                    ? Number(request.quantity || 0)
                    : currentStock + Number(request.quantity || 0);

                return (
                  <div
                    key={request.id}
                    className="rounded-2xl border border-[#dde3e6] bg-[#fdfefe] p-4"
                  >
                    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                      <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
                          {request.store_suppliers?.commercial_name || "Proveedor"} ·{" "}
                          {formatDateTime(request.requested_at)}
                        </p>
                        <h4 className="mt-2 text-xl font-light">
                          {request.store_products?.name || "Producto"}
                        </h4>
                        <p className="mt-1 text-sm text-[#68777c]">
                          Tipo: {request.request_type} · Cantidad: {request.quantity} · Stock{" "}
                          {currentStock} → {expectedStock}
                        </p>
                        {(request.reason || request.rejection_reason) && (
                          <p className="mt-2 rounded-xl bg-[#f7f9fa] p-3 text-sm text-[#68777c]">
                            {request.rejection_reason
                              ? `Rechazo: ${request.rejection_reason}`
                              : request.reason}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Badge tone={request.status === "pending" ? "amber" : request.status === "approved" ? "green" : "red"}>
                          {statusLabels[request.status] || request.status}
                        </Badge>
                        {request.status === "pending" && (
                          <>
                            <button
                              type="button"
                              onClick={() => reviewRequest(request, "approve")}
                              className="rounded-full bg-green-600 px-4 py-2 text-sm text-white transition hover:bg-green-700"
                            >
                              Aprobar
                            </button>
                            <button
                              type="button"
                              onClick={() => reviewRequest(request, "reject")}
                              className="rounded-full border border-red-500 px-4 py-2 text-sm text-red-600 transition hover:bg-red-600 hover:text-white"
                            >
                              Rechazar
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle
            eyebrow="Permisos"
            title="Aprobadores de inventario"
            description="Admin siempre puede aprobar. Otros perfiles requieren autorización activa."
          />

          {canManageApprovers && (
            <div className="mb-5 grid gap-3 md:grid-cols-[1fr_auto]">
              <Field label="Usuario">
                <SelectInput value={approverProfileId} onChange={setApproverProfileId}>
                  <option value="">Seleccionar usuario</option>
                  {supplierData.profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.full_name || profile.email} · {profile.role}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <button
                type="button"
                onClick={saveApprover}
                className="self-end rounded-full bg-[#bd7b83] px-5 py-3 text-sm text-white transition hover:opacity-90"
              >
                Autorizar
              </button>
            </div>
          )}

          <div className="space-y-3">
            {supplierData.approvers.map((approver) => (
              <div
                key={approver.id}
                className="flex flex-col justify-between gap-3 rounded-2xl bg-[#f7f9fa] p-4 md:flex-row md:items-center"
              >
                <div>
                  <p className="font-medium">
                    {approver.user_profiles?.full_name || approver.user_profiles?.email}
                  </p>
                  <p className="text-sm text-[#68777c]">
                    {approver.user_profiles?.role || "perfil"} ·{" "}
                    {approver.active ? "activo" : "revocado"}
                  </p>
                </div>
                {canManageApprovers && (
                  <button
                    type="button"
                    onClick={() =>
                      toggleRecord({
                        type: "approver",
                        id: approver.id,
                        active: !approver.active,
                      })
                    }
                    className="rounded-full border border-[#68777c] px-4 py-2 text-sm text-[#68777c] transition hover:bg-[#68777c] hover:text-white"
                  >
                    {approver.active ? "Revocar" : "Reactivar"}
                  </button>
                )}
              </div>
            ))}
            {supplierData.approvers.length === 0 && (
              <p className="rounded-2xl bg-[#f7f9fa] p-4 text-sm text-[#68777c]">
                Aún no hay aprobadores adicionales.
              </p>
            )}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <div className="space-y-6">
        <Card>
          <SectionTitle
            eyebrow="Proveedores"
            title={editingSupplierId ? "Editar proveedor" : "Nuevo proveedor"}
            description="Los datos fiscales son opcionales para esta fase."
          />
          <div className="space-y-4">
            <Field label="Nombre comercial">
              <TextInput
                value={supplierForm.commercial_name}
                onChange={(value) =>
                  setSupplierForm((current) => ({ ...current, commercial_name: value }))
                }
              />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Razón social">
                <TextInput
                  value={supplierForm.legal_name}
                  onChange={(value) =>
                    setSupplierForm((current) => ({ ...current, legal_name: value }))
                  }
                />
              </Field>
              <Field label="Contacto">
                <TextInput
                  value={supplierForm.contact_name}
                  onChange={(value) =>
                    setSupplierForm((current) => ({ ...current, contact_name: value }))
                  }
                />
              </Field>
              <Field label="Teléfono">
                <TextInput
                  value={supplierForm.phone}
                  onChange={(value) =>
                    setSupplierForm((current) => ({ ...current, phone: value }))
                  }
                />
              </Field>
              <Field label="WhatsApp">
                <TextInput
                  value={supplierForm.whatsapp_phone}
                  onChange={(value) =>
                    setSupplierForm((current) => ({ ...current, whatsapp_phone: value }))
                  }
                />
              </Field>
              <Field label="Correo">
                <TextInput
                  type="email"
                  value={supplierForm.email}
                  onChange={(value) =>
                    setSupplierForm((current) => ({ ...current, email: value }))
                  }
                />
              </Field>
              <Field label="RFC">
                <TextInput
                  value={supplierForm.rfc}
                  onChange={(value) =>
                    setSupplierForm((current) => ({ ...current, rfc: value }))
                  }
                />
              </Field>
            </div>
            <Field label="Dirección">
              <TextInput
                value={supplierForm.address}
                onChange={(value) =>
                  setSupplierForm((current) => ({ ...current, address: value }))
                }
              />
            </Field>
            <Field label="Notas">
              <textarea
                value={supplierForm.notes}
                onChange={(event) =>
                  setSupplierForm((current) => ({ ...current, notes: event.target.value }))
                }
                className="min-h-24 w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
              />
            </Field>
            <label className="flex items-center gap-3 rounded-2xl bg-[#f7f9fa] px-4 py-3 text-sm text-[#68777c]">
              <input
                type="checkbox"
                checked={supplierForm.active}
                onChange={(event) =>
                  setSupplierForm((current) => ({ ...current, active: event.target.checked }))
                }
              />
              Proveedor activo
            </label>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={saveSupplier}
                className="rounded-full bg-[#bd7b83] px-6 py-3 text-sm text-white transition hover:opacity-90"
              >
                Guardar proveedor
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingSupplierId("");
                  setSupplierForm(emptySupplierForm);
                }}
                className="rounded-full border border-[#bd7b83] px-6 py-3 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
              >
                Limpiar
              </button>
            </div>
          </div>
        </Card>

        <Card>
          <SectionTitle
            eyebrow="Relaciones"
            title="Asociar producto y proveedor"
            description="Si un producto tiene varios proveedores con stock, la venta exigirá seleccionar uno."
          />
          <div className="space-y-4">
            <Field label="Producto">
              <SelectInput
                value={productSupplierForm.product_id}
                onChange={(value) =>
                  setProductSupplierForm((current) => ({ ...current, product_id: value }))
                }
              >
                <option value="">Seleccionar producto</option>
                {activeProducts.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} · Stock {product.current_stock || 0}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Proveedor">
              <SelectInput
                value={productSupplierForm.supplier_id}
                onChange={(value) =>
                  setProductSupplierForm((current) => ({ ...current, supplier_id: value }))
                }
              >
                <option value="">Seleccionar proveedor</option>
                {activeSuppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.commercial_name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="SKU proveedor">
                <TextInput
                  value={productSupplierForm.supplier_sku}
                  onChange={(value) =>
                    setProductSupplierForm((current) => ({ ...current, supplier_sku: value }))
                  }
                />
              </Field>
              <Field label="Costo de referencia">
                <TextInput
                  type="number"
                  value={productSupplierForm.reference_cost}
                  onChange={(value) =>
                    setProductSupplierForm((current) => ({ ...current, reference_cost: value }))
                  }
                />
              </Field>
              <Field label="Modelo">
                <SelectInput
                  value={productSupplierForm.ownership_model}
                  onChange={(value) =>
                    setProductSupplierForm((current) => ({ ...current, ownership_model: value }))
                  }
                >
                  {Object.entries(ownershipLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
                La relación inicia con stock 0. Para agregar existencias, crea una solicitud
                y apruébala desde Solicitudes de stock.
              </div>
            </div>
            <button
              type="button"
              onClick={saveProductSupplier}
              className="rounded-full bg-[#bd7b83] px-6 py-3 text-sm text-white transition hover:opacity-90"
            >
              Guardar relación
            </button>
          </div>
        </Card>

        <Card>
          <SectionTitle
            eyebrow="Accesos"
            title="Usuarios de proveedor"
            description="Vincula cuentas existentes por correo, perfil o auth user ID sin dar acceso al panel admin."
          />
          <div className="space-y-4">
            <Field label="Proveedor">
              <SelectInput
                value={supplierUserForm.supplier_id}
                onChange={(value) =>
                  setSupplierUserForm((current) => ({ ...current, supplier_id: value }))
                }
              >
                <option value="">Seleccionar proveedor</option>
                {activeSuppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.commercial_name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Correo">
                <TextInput
                  type="email"
                  value={supplierUserForm.email_snapshot}
                  onChange={(value) =>
                    setSupplierUserForm((current) => ({ ...current, email_snapshot: value }))
                  }
                />
              </Field>
              <Field label="Nombre visible">
                <TextInput
                  value={supplierUserForm.display_name}
                  onChange={(value) =>
                    setSupplierUserForm((current) => ({ ...current, display_name: value }))
                  }
                />
              </Field>
            </div>
            <button
              type="button"
              onClick={saveSupplierUser}
              className="rounded-full bg-[#bd7b83] px-6 py-3 text-sm text-white transition hover:opacity-90"
            >
              Vincular usuario
            </button>
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <SectionTitle
            eyebrow="Directorio"
            title="Proveedores registrados"
            description="No se permite borrado físico desde esta interfaz; usa desactivación."
          />
          {loading ? (
            <p className="text-sm text-[#68777c]">Cargando proveedores...</p>
          ) : supplierData.suppliers.length === 0 ? (
            <p className="rounded-2xl bg-[#f7f9fa] p-4 text-sm text-[#68777c]">
              Aún no hay proveedores.
            </p>
          ) : (
            <div className="space-y-3">
              {supplierData.suppliers.map((supplier) => (
                <div
                  key={supplier.id}
                  className="rounded-2xl border border-[#dde3e6] bg-[#fdfefe] p-4"
                >
                  <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                    <div>
                      <h4 className="text-lg font-light">{supplier.commercial_name}</h4>
                      <p className="mt-1 text-sm text-[#68777c]">
                        {supplier.contact_name || "Sin contacto"} ·{" "}
                        {supplier.email || "Sin correo"}
                      </p>
                      <div className="mt-3">
                        <Badge tone={supplier.active ? "green" : "amber"}>
                          {supplier.active ? "Activo" : "Inactivo"}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => editSupplier(supplier)}
                        className="rounded-full border border-[#bd7b83] px-4 py-2 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          toggleRecord({
                            type: "supplier",
                            id: supplier.id,
                            active: !supplier.active,
                          })
                        }
                        className="rounded-full border border-[#68777c] px-4 py-2 text-sm text-[#68777c] transition hover:bg-[#68777c] hover:text-white"
                      >
                        {supplier.active ? "Desactivar" : "Activar"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle
            eyebrow="Stock por proveedor"
            title="Productos asociados"
            description="El proveedor estructurado convive con el campo legacy Dueña / Proveedor."
          />
          {supplierData.product_suppliers.length === 0 ? (
            <p className="rounded-2xl bg-[#f7f9fa] p-4 text-sm text-[#68777c]">
              Aún no hay productos asociados a proveedores.
            </p>
          ) : (
            <div className="space-y-3">
              {supplierData.product_suppliers.map((relation) => {
                const inventory = Array.isArray(relation.store_supplier_inventory)
                  ? relation.store_supplier_inventory[0]
                  : relation.store_supplier_inventory;
                return (
                  <div
                    key={relation.id}
                    className="rounded-2xl bg-[#f7f9fa] p-4 text-sm text-[#68777c]"
                  >
                    <p className="font-medium text-[#263238]">
                      {relation.store_products?.name || "Producto"}
                    </p>
                    <p>
                      {relation.store_suppliers?.commercial_name || "Proveedor"} ·{" "}
                      {ownershipLabels[relation.ownership_model] || relation.ownership_model}
                    </p>
                    <p>
                      Stock proveedor: {inventory?.current_stock ?? 0} · Precio visible:{" "}
                      {formatMoney(relation.store_products?.sale_price)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle
            eyebrow="Usuarios"
            title="Accesos vinculados"
            description="Revocar acceso conserva historial y no borra registros."
          />
          <div className="space-y-3">
            {supplierData.supplier_users.map((user) => (
              <div
                key={user.id}
                className="flex flex-col justify-between gap-3 rounded-2xl bg-[#f7f9fa] p-4 md:flex-row md:items-center"
              >
                <div>
                  <p className="font-medium">
                    {user.display_name || user.email_snapshot || "Usuario proveedor"}
                  </p>
                  <p className="text-sm text-[#68777c]">
                    {user.store_suppliers?.commercial_name || "Proveedor"} ·{" "}
                    {user.active ? "activo" : "revocado"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    toggleRecord({
                      type: "supplier_user",
                      id: user.id,
                      active: !user.active,
                    })
                  }
                  className="rounded-full border border-[#68777c] px-4 py-2 text-sm text-[#68777c] transition hover:bg-[#68777c] hover:text-white"
                >
                  {user.active ? "Revocar" : "Reactivar"}
                </button>
              </div>
            ))}
            {supplierData.supplier_users.length === 0 && (
              <p className="rounded-2xl bg-[#f7f9fa] p-4 text-sm text-[#68777c]">
                Aún no hay usuarios de proveedor vinculados.
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
