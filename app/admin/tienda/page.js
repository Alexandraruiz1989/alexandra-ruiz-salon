"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import AdminShell from "../components/AdminShell";
import { supabase } from "../../lib/supabaseClient";

const adminMenuItems = [
  { key: "productos", label: "Productos / Inventario" },
  { key: "venta", label: "Nueva venta" },
  { key: "movimientos", label: "Movimientos" },
  { key: "reportes", label: "Reportes" },
  { key: "configuracion", label: "Configuración" },
];

const ownerMenuItems = [
  { key: "productos", label: "Stock actual" },
  { key: "movimientos", label: "Movimientos" },
  { key: "reportes", label: "Reportes" },
];

const emptyProductForm = {
  name: "",
  sku: "",
  brand: "",
  category: "",
  description: "",
  cost_price: "",
  sale_price: "",
  current_stock: "",
  min_stock: "",
  external_owner_name: "",
  active: true,
};

const paymentMethods = [
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "transferencia", label: "Transferencia" },
  { value: "mixto", label: "Mixto" },
];

const templateHeaders = [
  "Nombre",
  "SKU",
  "Marca",
  "Categoría",
  "Descripción",
  "Costo",
  "Precio venta",
  "Stock",
  "Stock mínimo",
  "Dueña/Proveedor",
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const clean = String(value || "")
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .trim();
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toInteger(value) {
  return Math.trunc(toNumber(value));
}

function paymentMethodLabel(value) {
  return paymentMethods.find((item) => item.value === value)?.label || value;
}

function cashPaymentMethodLabel(value) {
  if (value === "efectivo") return "Efectivo";
  if (value === "tarjeta") return "Tarjeta";
  if (value === "transferencia") return "Transferencia";
  return "Mixto";
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

function getToastStyle(message) {
  const text = normalizeText(message);
  if (
    text.includes("no se pudo") ||
    text.includes("error") ||
    text.includes("obligatorio") ||
    text.includes("revisa") ||
    text.includes("stock insuficiente") ||
    text.includes("permiso") ||
    text.includes("sesion") ||
    text.includes("expir") ||
    text.includes("no encontre") ||
    text.includes("solo admin") ||
    text.includes("rol actual") ||
    text.includes("desactivado")
  ) {
    return "bg-red-600 text-white";
  }
  return "bg-green-600 text-white";
}

function InputField({ label, value, onChange, type = "text", placeholder = "", disabled = false }) {
  return (
    <div>
      <label className="mb-2 block text-sm text-[#68777c]">{label}</label>
      <input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none disabled:opacity-60"
        placeholder={placeholder}
      />
    </div>
  );
}

function TextAreaField({ label, value, onChange, placeholder = "", disabled = false }) {
  return (
    <div>
      <label className="mb-2 block text-sm text-[#68777c]">{label}</label>
      <textarea
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-28 w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none disabled:opacity-60"
        placeholder={placeholder}
      />
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="rounded-2xl bg-[#f7f9fa] p-5 text-sm text-[#68777c]">
      {text}
    </div>
  );
}

function parseCsvText(text) {
  const rows = [];
  let current = "";
  let row = [];
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && insideQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if ((char === "," || char === "\t") && !insideQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(current);
      if (row.some((cell) => String(cell || "").trim())) rows.push(row);
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  row.push(current);
  if (row.some((cell) => String(cell || "").trim())) rows.push(row);
  return rows;
}

function normalizeImportRows(rows) {
  if (!rows || rows.length < 2) return [];

  const headers = rows[0].map((header) => normalizeText(header));
  const findValue = (row, names) => {
    const index = headers.findIndex((header) =>
      names.some((name) => header === normalizeText(name))
    );
    return index >= 0 ? row[index] : "";
  };

  return rows.slice(1).map((row, index) => {
    const product = {
      rowNumber: index + 2,
      name: String(findValue(row, ["Nombre", "name", "producto"]) || "").trim(),
      sku: String(findValue(row, ["SKU", "sku", "codigo", "código"]) || "").trim(),
      brand: String(findValue(row, ["Marca", "brand"]) || "").trim(),
      category: String(findValue(row, ["Categoría", "Categoria", "category"]) || "").trim(),
      description: String(findValue(row, ["Descripción", "Descripcion", "description"]) || "").trim(),
      cost_price: toNumber(findValue(row, ["Costo", "cost_price", "costo unitario"])),
      sale_price: toNumber(findValue(row, ["Precio venta", "Precio", "sale_price", "precio venta"])),
      current_stock: toInteger(findValue(row, ["Stock", "current_stock", "inventario"])),
      min_stock: toInteger(findValue(row, ["Stock mínimo", "Stock minimo", "min_stock", "mínimo"])),
      external_owner_name: String(
        findValue(row, ["Dueña/Proveedor", "Duena/Proveedor", "Proveedor", "Dueña", "Duena", "external_owner_name"]) || ""
      ).trim(),
      errors: [],
    };

    if (!product.name) product.errors.push("Falta nombre");
    if (product.sale_price <= 0) product.errors.push("Precio venta inválido");
    return product;
  });
}

function downloadTemplate() {
  const csv = `${templateHeaders.join(",")}\nGel ejemplo,SKU-001,Marca,Categoría,Descripción,100,160,10,2,Proveedor externo\n`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "plantilla_tienda_productos.csv";
  link.click();
  URL.revokeObjectURL(url);
}

async function parseXlsxFile(file) {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {
    type: "array",
    raw: false,
  });
  const firstSheetName = workbook.SheetNames?.[0];

  if (!firstSheetName) {
    throw new Error("El archivo Excel no tiene hojas para importar.");
  }

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
    header: 1,
    defval: "",
    raw: false,
  });

  return rows.map((row) => row.map((cell) => String(cell ?? "").trim()));
}

export default function StorePage() {
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [currentRole, setCurrentRole] = useState("tecnica");
  const [currentEmail, setCurrentEmail] = useState("");
  const [accessDebug, setAccessDebug] = useState({
    auth_email: "",
    auth_user_id: "",
    role: "",
    active: null,
    role_source: "sin validar",
    can_manage_products: null,
    error: "",
  });
  const [activeSection, setActiveSection] = useState("productos");

  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [sales, setSales] = useState([]);
  const [staff, setStaff] = useState([]);
  const [settings, setSettings] = useState(null);
  const [settingsForm, setSettingsForm] = useState({
    salon_product_commission_percent: 0,
    terminal_card_fee_percent: 0,
    default_seller_commission_percent: 0,
  });

  const [productForm, setProductForm] = useState(emptyProductForm);
  const [editingProductId, setEditingProductId] = useState(null);
  const [productSearch, setProductSearch] = useState("");
  const [stockForm, setStockForm] = useState({
    product_id: "",
    movement_type: "entrada",
    quantity: 1,
    note: "",
  });

  const [importPreview, setImportPreview] = useState([]);
  const fileInputRef = useRef(null);

  const [cart, setCart] = useState([]);
  const [saleForm, setSaleForm] = useState({
    seller_staff_id: "",
    payment_method: "efectivo",
    discount_amount: 0,
    seller_commission_percent: "",
    notes: "",
  });
  const [saleSearch, setSaleSearch] = useState("");

  const [reportDateFrom, setReportDateFrom] = useState(todayISO().slice(0, 8) + "01");
  const [reportDateTo, setReportDateTo] = useState(todayISO());

  const normalizedRole = normalizeText(currentRole);
  const isAdmin = normalizedRole === "admin";
  const isProductOwner = normalizedRole === "product_owner" || normalizedRole === "duena_productos" || normalizedRole === "dueña_productos";
  const canManageStore = ["admin", "encargada", "caja"].includes(normalizedRole);
  const canEditProducts = isAdmin || normalizedRole === "encargada";
  const menuItems = isProductOwner ? ownerMenuItems : adminMenuItems;
  const shouldShowAccessDebug =
    normalizeText(currentEmail) === "alexandraruizsalon@gmail.com" ||
    normalizeText(accessDebug.role) === "admin" ||
    isAdmin;

  useEffect(() => {
    const start = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        window.location.href = "/admin";
        return;
      }

      const email = data.session.user?.email || "";
      setCurrentEmail(email);
      setAccessDebug((current) => ({
        ...current,
        auth_email: email,
        auth_user_id: data.session.user?.id || "",
        role_source: "sesión detectada",
      }));
      await loadRole(data.session.user);
      setLoadingSession(false);
      await loadData();
    };

    start();
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(""), 15000);
    return () => clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (isProductOwner && (activeSection === "venta" || activeSection === "configuracion")) {
      setActiveSection("productos");
    }
  }, [activeSection, isProductOwner]);

  const loadRole = async (user) => {
    try {
      const token = await getStoreAccessToken();
      const response = await fetch("/api/admin/store/products", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const result = await response
        .json()
        .catch(() => ({ success: false, error: "Respuesta inválida del servidor." }));

      const apiDebug = result.debug || {};

      setAccessDebug({
        auth_email: apiDebug.auth_email || user.email || "",
        auth_user_id: apiDebug.auth_user_id || user.id || "",
        role: result.profile?.role || apiDebug.role || "",
        active: result.profile?.active ?? apiDebug.active ?? null,
        role_source: apiDebug.profile_source
          ? `API (${apiDebug.profile_source})`
          : "API",
        can_manage_products:
          result.can_manage_products ?? apiDebug.can_manage_products ?? null,
        error: result.success ? "" : result.error || "",
      });

      if (response.ok && result.success && result.profile?.role) {
        setCurrentRole(result.profile.role);
        return;
      }

      if (result.error) {
        setMessage(result.error);
      }
    } catch (error) {
      console.warn("No se pudo validar rol de Tienda por API.", error);
    }

    const { data: profilesById } = await supabase
      .from("user_profiles")
      .select("role, active")
      .eq("auth_user_id", user.id)
      .limit(1);

    const profileById = profilesById?.[0] || null;
    if (profileById?.role && profileById.active !== false) {
      setCurrentRole(profileById.role);
      setAccessDebug((current) => ({
        ...current,
        role: profileById.role,
        active: profileById.active !== false,
        role_source: "cliente (auth_user_id)",
        can_manage_products: ["admin", "encargada"].includes(normalizeText(profileById.role)),
      }));
      return;
    }

    const { data: profilesByEmail } = await supabase
      .from("user_profiles")
      .select("role, active")
      .ilike("email", user.email)
      .limit(1);

    const profileByEmail = profilesByEmail?.[0] || null;
    setCurrentRole(profileByEmail?.role || "tecnica");
    setAccessDebug((current) => ({
      ...current,
      role: profileByEmail?.role || "tecnica",
      active: profileByEmail?.active ?? null,
      role_source: profileByEmail ? "cliente (email)" : "cliente (sin perfil)",
      can_manage_products: ["admin", "encargada"].includes(
        normalizeText(profileByEmail?.role)
      ),
      error: profileByEmail ? "" : "No se encontró perfil desde cliente.",
    }));
  };

  const loadData = async () => {
    setLoadingData(true);

    const [productsResult, movementsResult, salesResult, staffResult, settingsResult] =
      await Promise.all([
        supabase
          .from("store_products")
          .select("*")
          .order("name", { ascending: true }),
        supabase
          .from("store_inventory_movements")
          .select("*, store_products(name, sku)")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("store_sales")
          .select("*, store_sale_items(*)")
          .order("sale_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(200),
        supabase.from("staff").select("*").eq("active", true).order("full_name"),
        supabase.from("store_settings").select("*").limit(1).maybeSingle(),
      ]);

    if (productsResult.error) {
      setMessage(
        `No se pudieron cargar productos. Ejecuta supabase_store_module.sql si aún no existe la estructura. Detalle: ${productsResult.error.message}`
      );
      setProducts([]);
    } else {
      setProducts(productsResult.data || []);
    }

    if (movementsResult.error) {
      setMovements([]);
    } else {
      setMovements(movementsResult.data || []);
    }

    if (salesResult.error) {
      setSales([]);
    } else {
      setSales(salesResult.data || []);
    }

    if (!staffResult.error) setStaff(staffResult.data || []);

    if (settingsResult.error) {
      setSettings(null);
    } else {
      setSettings(settingsResult.data || null);
      const nextSettings = {
        salon_product_commission_percent:
          settingsResult.data?.salon_product_commission_percent || 0,
        terminal_card_fee_percent:
          settingsResult.data?.terminal_card_fee_percent || 0,
        default_seller_commission_percent:
          settingsResult.data?.default_seller_commission_percent || 0,
      };
      setSettingsForm(nextSettings);
      setSaleForm((current) => ({
        ...current,
        seller_commission_percent:
          current.seller_commission_percent === ""
            ? String(nextSettings.default_seller_commission_percent || 0)
            : current.seller_commission_percent,
      }));
    }

    setLoadingData(false);
  };

  const filteredProducts = useMemo(() => {
    const term = normalizeText(productSearch);
    if (!term) return products;

    return products.filter((product) => {
      const text = normalizeText(
        `${product.name || ""} ${product.sku || ""} ${product.brand || ""} ${product.category || ""}`
      );
      return text.includes(term);
    });
  }, [products, productSearch]);

  const saleProductOptions = useMemo(() => {
    const term = normalizeText(saleSearch);
    return products
      .filter((product) => product.active !== false)
      .filter((product) => {
        if (!term) return true;
        return normalizeText(`${product.name} ${product.sku} ${product.brand}`).includes(term);
      })
      .slice(0, 12);
  }, [products, saleSearch]);

  const saleTotals = useMemo(() => {
    const subtotal = cart.reduce((sum, item) => sum + Number(item.subtotal || 0), 0);
    const discount = Math.min(Number(saleForm.discount_amount || 0), subtotal);
    const total = Math.max(subtotal - discount, 0);
    const salonPercent = Number(settingsForm.salon_product_commission_percent || 0);
    const terminalPercent =
      saleForm.payment_method === "tarjeta" || saleForm.payment_method === "mixto"
        ? Number(settingsForm.terminal_card_fee_percent || 0)
        : 0;
    const sellerPercent = Number(
      saleForm.seller_commission_percent === ""
        ? settingsForm.default_seller_commission_percent
        : saleForm.seller_commission_percent
    );

    const salonCommission = total * (salonPercent / 100);
    const terminalFee = total * (terminalPercent / 100);
    const sellerCommission = total * (sellerPercent / 100);
    const externalNet = total - salonCommission - terminalFee - sellerCommission;

    return {
      subtotal,
      discount,
      total,
      salonPercent,
      terminalPercent,
      sellerPercent,
      salonCommission,
      terminalFee,
      sellerCommission,
      externalNet,
    };
  }, [cart, saleForm, settingsForm]);

  const reportSales = useMemo(() => {
    return sales.filter((sale) => {
      const date = sale.sale_date || "";
      return date >= reportDateFrom && date <= reportDateTo;
    });
  }, [sales, reportDateFrom, reportDateTo]);

  const reportSummary = useMemo(() => {
    const total = reportSales.reduce((sum, sale) => sum + Number(sale.total_amount || 0), 0);
    const salon = reportSales.reduce((sum, sale) => sum + Number(sale.salon_commission_amount || 0), 0);
    const terminal = reportSales.reduce((sum, sale) => sum + Number(sale.terminal_fee_amount || 0), 0);
    const seller = reportSales.reduce((sum, sale) => sum + Number(sale.seller_commission_amount || 0), 0);
    const net = reportSales.reduce((sum, sale) => sum + Number(sale.external_owner_net_amount || 0), 0);

    const bySeller = {};
    const byProduct = {};

    reportSales.forEach((sale) => {
      const sellerName = sale.seller_name || "Sin vendedora";
      if (!bySeller[sellerName]) {
        bySeller[sellerName] = { sellerName, total: 0, commission: 0, sales: 0 };
      }
      bySeller[sellerName].total += Number(sale.total_amount || 0);
      bySeller[sellerName].commission += Number(sale.seller_commission_amount || 0);
      bySeller[sellerName].sales += 1;

      (sale.store_sale_items || []).forEach((item) => {
        const key = item.product_name || "Producto";
        if (!byProduct[key]) byProduct[key] = { productName: key, quantity: 0, total: 0 };
        byProduct[key].quantity += Number(item.quantity || 0);
        byProduct[key].total += Number(item.subtotal || 0);
      });
    });

    return {
      total,
      salon,
      terminal,
      seller,
      net,
      bySeller: Object.values(bySeller).sort((a, b) => b.total - a.total),
      byProduct: Object.values(byProduct).sort((a, b) => b.quantity - a.quantity),
    };
  }, [reportSales]);

  const lowStockProducts = useMemo(() => {
    return products.filter(
      (product) =>
        product.active !== false &&
        Number(product.current_stock || 0) <= Number(product.min_stock || 0)
    );
  }, [products]);

  const resetProductForm = () => {
    setProductForm(emptyProductForm);
    setEditingProductId(null);
  };

  const editProduct = (product) => {
    setEditingProductId(product.id);
    setProductForm({
      name: product.name || "",
      sku: product.sku || "",
      brand: product.brand || "",
      category: product.category || "",
      description: product.description || "",
      cost_price: product.cost_price || 0,
      sale_price: product.sale_price || 0,
      current_stock: product.current_stock || 0,
      min_stock: product.min_stock || 0,
      external_owner_name: product.external_owner_name || "",
      active: product.active !== false,
    });
  };

  const getStoreAccessToken = async () => {
    const { data, error } = await supabase.auth.getSession();

    if (error || !data.session?.access_token) {
      throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
    }

    return data.session.access_token;
  };

  const saveProductWithApi = async ({ id = "", product, matchBySku = false }) => {
    const token = await getStoreAccessToken();
    const response = await fetch("/api/admin/store/products", {
      method: id ? "PATCH" : "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(
        id
          ? { id, product }
          : {
              product,
              match_by_sku: matchBySku,
            }
      ),
    });

    const result = await response
      .json()
      .catch(() => ({ success: false, error: "Respuesta inválida del servidor." }));

    if (!response.ok || !result.success) {
      throw new Error(result.error || `Error técnico al guardar producto (${response.status}).`);
    }

    return result;
  };

  const getProductErrorMessage = (error, fallback) => {
    const text = String(error?.message || error || "").trim();
    const normalized = normalizeText(text);

    if (normalized.includes("sesion expiro") || normalized.includes("session")) {
      return "Tu sesión expiró. Vuelve a iniciar sesión.";
    }

    if (normalized.includes("permiso") || normalized.includes("permission denied")) {
      return "No tienes permiso para administrar productos.";
    }

    if (
      normalized.includes("no encontre") ||
      normalized.includes("rol actual") ||
      normalized.includes("solo admin") ||
      normalized.includes("desactivado")
    ) {
      return text;
    }

    return `${fallback}: ${text || "Error técnico desconocido."}`;
  };

  const saveProduct = async () => {
    if (!productForm.name.trim()) {
      setMessage("El nombre del producto es obligatorio.");
      return;
    }

    if (Number(productForm.sale_price || 0) <= 0) {
      setMessage("El precio de venta debe ser mayor a cero.");
      return;
    }

    setSaving(true);

    const payload = {
      name: productForm.name.trim(),
      sku: productForm.sku.trim() || null,
      brand: productForm.brand.trim() || null,
      category: productForm.category.trim() || null,
      description: productForm.description.trim() || null,
      cost_price: Number(productForm.cost_price || 0),
      sale_price: Number(productForm.sale_price || 0),
      current_stock: toInteger(productForm.current_stock || 0),
      min_stock: toInteger(productForm.min_stock || 0),
      external_owner_name: productForm.external_owner_name.trim() || null,
      active: productForm.active,
      updated_at: new Date().toISOString(),
    };

    try {
      await saveProductWithApi({ id: editingProductId, product: payload });
      setMessage("Producto guardado correctamente ✨");
      resetProductForm();
      await loadData();
    } catch (error) {
      setMessage(getProductErrorMessage(error, "No se pudo guardar producto"));
    } finally {
      setSaving(false);
    }
  };

  const toggleProduct = async (product) => {
    try {
      await saveProductWithApi({
        id: product.id,
        product: {
          active: product.active === false,
          updated_at: new Date().toISOString(),
        },
      });
      await loadData();
    } catch (error) {
      setMessage(getProductErrorMessage(error, "No se pudo actualizar producto"));
    }
  };

  const saveStockMovement = async () => {
    const product = products.find((item) => item.id === stockForm.product_id);
    const quantity = toInteger(stockForm.quantity);

    if (!product || quantity <= 0) {
      setMessage("Selecciona producto y cantidad mayor a cero.");
      return;
    }

    const previousStock = Number(product.current_stock || 0);
    const newStock =
      stockForm.movement_type === "ajuste"
        ? quantity
        : previousStock + quantity;

    try {
      await saveProductWithApi({
        id: product.id,
        product: {
          current_stock: newStock,
          updated_at: new Date().toISOString(),
        },
      });
    } catch (error) {
      setMessage(getProductErrorMessage(error, "No se pudo actualizar stock"));
      return;
    }

    const { error: movementError } = await supabase
      .from("store_inventory_movements")
      .insert([
        {
          product_id: product.id,
          movement_type: stockForm.movement_type,
          quantity,
          previous_stock: previousStock,
          new_stock: newStock,
          note: stockForm.note.trim() || null,
          created_by: currentEmail || null,
        },
      ]);

    if (movementError) {
      setMessage(`Stock actualizado, pero no se pudo registrar movimiento: ${movementError.message}`);
    } else {
      setMessage("Movimiento de inventario guardado correctamente ✨");
    }

    setStockForm({ product_id: "", movement_type: "entrada", quantity: 1, note: "" });
    await loadData();
  };

  const handleImportFile = async (file) => {
    if (!file) return;

    try {
      const extension = file.name.split(".").pop()?.toLowerCase();
      let rows = [];

      if (extension === "csv" || extension === "tsv") {
        const text = await file.text();
        rows = parseCsvText(text);
      } else if (extension === "xlsx" || extension === "xls") {
        rows = await parseXlsxFile(file);
      } else {
        throw new Error("Formato no soportado. Usa CSV, TSV, XLSX o XLS.");
      }

      const preview = normalizeImportRows(rows);
      setImportPreview(preview);
      setMessage(`Vista previa cargada: ${preview.length} productos.`);
    } catch (error) {
      setImportPreview([]);
      setMessage(error.message || "No se pudo leer el archivo.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const importProducts = async () => {
    const validRows = importPreview.filter((row) => row.errors.length === 0);
    if (validRows.length === 0) {
      setMessage("No hay productos válidos para importar.");
      return;
    }

    setSaving(true);
    let created = 0;
    let updated = 0;
    const errors = [];

    for (const row of validRows) {
      const payload = {
        name: row.name,
        sku: row.sku || null,
        brand: row.brand || null,
        category: row.category || null,
        description: row.description || null,
        cost_price: row.cost_price,
        sale_price: row.sale_price,
        current_stock: row.current_stock,
        min_stock: row.min_stock,
        external_owner_name: row.external_owner_name || null,
        active: true,
        updated_at: new Date().toISOString(),
      };

      try {
        const result = await saveProductWithApi({
          product: payload,
          matchBySku: true,
        });

        if (result.action === "updated") {
          updated += 1;
        } else {
          created += 1;
        }
      } catch (error) {
        errors.push(`Fila ${row.rowNumber}: ${error.message}`);
      }
    }

    setSaving(false);
    setMessage(
      `Importación terminada. Creados: ${created}. Actualizados: ${updated}. Errores: ${errors.length}${errors.length ? ` · ${errors.slice(0, 2).join(" | ")}` : ""}`
    );
    setImportPreview([]);
    await loadData();
  };

  const addToCart = (product) => {
    if (Number(product.current_stock || 0) <= 0) {
      setMessage("Este producto no tiene stock disponible.");
      return;
    }

    setCart((current) => {
      const existing = current.find((item) => item.product_id === product.id);
      if (existing) {
        return current.map((item) =>
          item.product_id === product.id
            ? buildCartItem(product, item.quantity + 1)
            : item
        );
      }
      return [...current, buildCartItem(product, 1)];
    });
  };

  const buildCartItem = (product, quantity) => {
    const safeQuantity = Math.max(1, Math.min(toInteger(quantity), Number(product.current_stock || 0)));
    const unitPrice = Number(product.sale_price || 0);
    return {
      product_id: product.id,
      product_name: product.name,
      sku: product.sku,
      stock: Number(product.current_stock || 0),
      quantity: safeQuantity,
      unit_price: unitPrice,
      subtotal: safeQuantity * unitPrice,
    };
  };

  const updateCartQuantity = (productId, quantity) => {
    const product = products.find((item) => item.id === productId);
    if (!product) return;
    setCart((current) =>
      current.map((item) =>
        item.product_id === productId ? buildCartItem(product, quantity) : item
      )
    );
  };

  const removeCartItem = (productId) => {
    setCart((current) => current.filter((item) => item.product_id !== productId));
  };

  const saveSale = async () => {
    if (!canManageStore) {
      setMessage("No tienes permiso para registrar ventas.");
      return;
    }

    if (cart.length === 0) {
      setMessage("Agrega productos al carrito.");
      return;
    }

    const invalidStock = cart.find((item) => item.quantity > item.stock);
    if (invalidStock) {
      setMessage(`Stock insuficiente para ${invalidStock.product_name}.`);
      return;
    }

    setSaving(true);
    const seller = staff.find((person) => person.id === saleForm.seller_staff_id);
    const now = new Date().toISOString();

    const salePayload = {
      sale_date: todayISO(),
      seller_staff_id: seller?.id || null,
      seller_name: seller?.full_name || null,
      subtotal: saleTotals.subtotal,
      discount_amount: saleTotals.discount,
      total_amount: saleTotals.total,
      payment_method: saleForm.payment_method,
      salon_commission_percent: saleTotals.salonPercent,
      salon_commission_amount: Number(saleTotals.salonCommission.toFixed(2)),
      terminal_fee_percent: saleTotals.terminalPercent,
      terminal_fee_amount: Number(saleTotals.terminalFee.toFixed(2)),
      seller_commission_percent: saleTotals.sellerPercent,
      seller_commission_amount: Number(saleTotals.sellerCommission.toFixed(2)),
      external_owner_net_amount: Number(saleTotals.externalNet.toFixed(2)),
      cash_registered: true,
      notes: saleForm.notes.trim() || null,
      created_by: currentEmail || null,
      updated_at: now,
    };

    const { data: sale, error: saleError } = await supabase
      .from("store_sales")
      .insert([salePayload])
      .select()
      .single();

    if (saleError) {
      setSaving(false);
      setMessage(`No se pudo registrar venta: ${saleError.message}`);
      return;
    }

    const itemRows = cart.map((item) => ({
      sale_id: sale.id,
      product_id: item.product_id,
      product_name: item.product_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      subtotal: item.subtotal,
    }));

    const { error: itemsError } = await supabase.from("store_sale_items").insert(itemRows);
    if (itemsError) {
      setSaving(false);
      setMessage(`Venta creada, pero no se guardó detalle: ${itemsError.message}`);
      return;
    }

    for (const item of cart) {
      const product = products.find((productItem) => productItem.id === item.product_id);
      const previousStock = Number(product?.current_stock || 0);
      const newStock = previousStock - Number(item.quantity || 0);

      await supabase
        .from("store_products")
        .update({ current_stock: newStock, updated_at: now })
        .eq("id", item.product_id);

      await supabase.from("store_inventory_movements").insert([
        {
          product_id: item.product_id,
          movement_type: "venta",
          quantity: item.quantity,
          previous_stock: previousStock,
          new_stock: newStock,
          note: `Venta de producto ${sale.id}`,
          created_by: currentEmail || null,
        },
      ]);
    }

    const { error: cashError } = await supabase.from("cash_movements").insert([
      {
        movement_date: todayISO(),
        movement_type: "ingreso",
        amount: Number(saleTotals.total.toFixed(2)),
        payment_method: cashPaymentMethodLabel(saleForm.payment_method),
        concept: `Venta de productos ${sale.id}`,
        category: "venta_producto",
        notes: `Tienda · Vendedora: ${seller?.full_name || "Sin vendedora"}`,
        updated_at: now,
      },
    ]);

    setSaving(false);
    setCart([]);
    setSaleForm({
      seller_staff_id: "",
      payment_method: "efectivo",
      discount_amount: 0,
      seller_commission_percent: String(settingsForm.default_seller_commission_percent || 0),
      notes: "",
    });
    setSaleSearch("");

    if (cashError) {
      setMessage(`Venta registrada, pero no se pudo registrar caja: ${cashError.message}`);
    } else {
      setMessage("Venta de productos registrada correctamente ✨");
    }

    await loadData();
  };

  const saveSettings = async () => {
    if (!isAdmin) {
      setMessage("Solo admin puede cambiar configuración de tienda.");
      return;
    }

    const payload = {
      salon_product_commission_percent: Number(settingsForm.salon_product_commission_percent || 0),
      terminal_card_fee_percent: Number(settingsForm.terminal_card_fee_percent || 0),
      default_seller_commission_percent: Number(settingsForm.default_seller_commission_percent || 0),
      updated_at: new Date().toISOString(),
    };

    const query = settings?.id
      ? supabase.from("store_settings").update(payload).eq("id", settings.id)
      : supabase.from("store_settings").insert([payload]);

    const { error } = await query;
    if (error) {
      setMessage(`No se pudo guardar configuración: ${error.message}`);
      return;
    }

    setMessage("Configuración de tienda guardada correctamente ✨");
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
      title="Tienda"
      subtitle="Inventario, venta de productos y reportes separados del salón."
      activeModule="tienda"
      menuItems={menuItems}
      activeSection={activeSection}
      setActiveSection={setActiveSection}
    >
      {message && (
        <div className={`mb-6 rounded-2xl px-5 py-4 text-sm font-medium ${getToastStyle(message)}`}>
          {message}
        </div>
      )}

      {shouldShowAccessDebug && (
        <div className="mb-6 rounded-[1.5rem] border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <p className="text-xs uppercase tracking-[0.24em] text-amber-700">
            Diagnóstico de acceso Tienda
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <p>
              <span className="font-medium">Email detectado:</span>{" "}
              {accessDebug.auth_email || currentEmail || "-"}
            </p>
            <p>
              <span className="font-medium">Auth user ID:</span>{" "}
              {accessDebug.auth_user_id || "-"}
            </p>
            <p>
              <span className="font-medium">Role detectado:</span>{" "}
              {accessDebug.role || currentRole || "-"}
            </p>
            <p>
              <span className="font-medium">Active detectado:</span>{" "}
              {accessDebug.active === null || accessDebug.active === undefined
                ? "-"
                : accessDebug.active
                ? "true"
                : "false"}
            </p>
            <p>
              <span className="font-medium">Rol usado desde:</span>{" "}
              {accessDebug.role_source || "sin validar"}
            </p>
            <p>
              <span className="font-medium">API permite productos:</span>{" "}
              {accessDebug.can_manage_products === null ||
              accessDebug.can_manage_products === undefined
                ? "-"
                : accessDebug.can_manage_products
                ? "sí"
                : "no"}
            </p>
          </div>
          {accessDebug.error && (
            <p className="mt-3 rounded-2xl bg-white/70 px-4 py-3 text-amber-950">
              <span className="font-medium">Último diagnóstico:</span>{" "}
              {accessDebug.error}
            </p>
          )}
        </div>
      )}

      {activeSection === "productos" && (
        <div className="grid gap-6 xl:grid-cols-[0.9fr_1.4fr]">
          {!isProductOwner && (
            <Card>
              <SectionHeader
                eyebrow="Inventario"
                title={editingProductId ? "Editar producto" : "Nuevo producto"}
                description="Crea productos manualmente, ajusta stock o importa desde archivo."
              />

              <div className="space-y-4">
                <InputField label="Nombre" value={productForm.name} onChange={(value) => setProductForm((current) => ({ ...current, name: value }))} />
                <div className="grid gap-4 md:grid-cols-2">
                  <InputField label="SKU" value={productForm.sku} onChange={(value) => setProductForm((current) => ({ ...current, sku: value }))} />
                  <InputField label="Marca" value={productForm.brand} onChange={(value) => setProductForm((current) => ({ ...current, brand: value }))} />
                  <InputField label="Categoría" value={productForm.category} onChange={(value) => setProductForm((current) => ({ ...current, category: value }))} />
                  <InputField label="Dueña / Proveedor" value={productForm.external_owner_name} onChange={(value) => setProductForm((current) => ({ ...current, external_owner_name: value }))} />
                  <InputField label="Costo" type="number" value={productForm.cost_price} onChange={(value) => setProductForm((current) => ({ ...current, cost_price: value }))} />
                  <InputField label="Precio venta" type="number" value={productForm.sale_price} onChange={(value) => setProductForm((current) => ({ ...current, sale_price: value }))} />
                  <InputField label="Stock actual" type="number" value={productForm.current_stock} onChange={(value) => setProductForm((current) => ({ ...current, current_stock: value }))} />
                  <InputField label="Stock mínimo" type="number" value={productForm.min_stock} onChange={(value) => setProductForm((current) => ({ ...current, min_stock: value }))} />
                </div>
                <TextAreaField label="Descripción" value={productForm.description} onChange={(value) => setProductForm((current) => ({ ...current, description: value }))} />
                <label className="flex items-center gap-3 rounded-2xl bg-[#f7f9fa] px-4 py-3 text-sm text-[#68777c]">
                  <input
                    type="checkbox"
                    checked={productForm.active}
                    onChange={(event) => setProductForm((current) => ({ ...current, active: event.target.checked }))}
                  />
                  Producto activo
                </label>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={saveProduct}
                    disabled={saving}
                    className="rounded-full bg-[#bd7b83] px-6 py-3 text-sm text-white transition hover:opacity-90 disabled:opacity-60"
                  >
                    {saving ? "Guardando..." : "Guardar producto"}
                  </button>
                  <button
                    type="button"
                    onClick={resetProductForm}
                    className="rounded-full border border-[#bd7b83] px-6 py-3 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
                  >
                    Limpiar
                  </button>
                </div>
              </div>

              <div className="mt-8 border-t border-[#edf0f2] pt-6">
                <SectionHeader
                  eyebrow="Excel / CSV"
                  title="Importar productos"
                  description="Carga CSV, TSV, XLSX o XLS con vista previa antes de importar."
                  action={
                    <button
                      type="button"
                      onClick={downloadTemplate}
                      className="rounded-full border border-[#bd7b83] px-5 py-3 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
                    >
                      Descargar plantilla CSV
                    </button>
                  }
                />
                <div className="flex flex-col gap-2">
                  <label className="inline-flex cursor-pointer items-center justify-center rounded-full bg-[#bd7b83] px-6 py-3 text-sm text-white transition hover:opacity-90">
                    Importar desde Excel
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.tsv,.xlsx,.xls"
                      onChange={(event) => handleImportFile(event.target.files?.[0])}
                      className="sr-only"
                    />
                  </label>
                  <p className="text-xs text-[#8a969a]">
                    También acepta CSV o TSV. Primero verás una vista previa antes de guardar.
                  </p>
                </div>

                {importPreview.length > 0 && (
                  <div className="mt-4 rounded-2xl bg-[#f7f9fa] p-4">
                    <div className="mb-3 flex flex-col justify-between gap-3 md:flex-row md:items-center">
                      <p className="text-sm text-[#68777c]">
                        Vista previa: {importPreview.length} filas · válidas{" "}
                        {importPreview.filter((row) => row.errors.length === 0).length}
                      </p>
                      <button
                        type="button"
                        onClick={importProducts}
                        disabled={saving}
                        className="rounded-full bg-[#bd7b83] px-5 py-2 text-sm text-white transition hover:opacity-90 disabled:opacity-60"
                      >
                        Importar válidos
                      </button>
                    </div>
                    <div className="max-h-72 overflow-auto">
                      <table className="w-full min-w-[760px] text-left text-sm">
                        <thead className="text-xs uppercase tracking-[0.18em] text-[#bd7b83]">
                          <tr>
                            <th className="p-2">Fila</th>
                            <th className="p-2">Nombre</th>
                            <th className="p-2">SKU</th>
                            <th className="p-2">Precio</th>
                            <th className="p-2">Stock</th>
                            <th className="p-2">Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importPreview.slice(0, 50).map((row) => (
                            <tr key={row.rowNumber} className="border-t border-[#dde3e6]">
                              <td className="p-2">{row.rowNumber}</td>
                              <td className="p-2">{row.name}</td>
                              <td className="p-2">{row.sku || "-"}</td>
                              <td className="p-2">{formatMoney(row.sale_price)}</td>
                              <td className="p-2">{row.current_stock}</td>
                              <td className={`p-2 ${row.errors.length ? "text-red-600" : "text-green-700"}`}>
                                {row.errors.length ? row.errors.join(", ") : "Válido"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-8 border-t border-[#edf0f2] pt-6">
                <SectionHeader
                  eyebrow="Stock"
                  title="Entrada / ajuste"
                  description="Registra entradas o establece stock exacto con nota."
                />
                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm text-[#68777c]">Producto</label>
                    <select
                      value={stockForm.product_id}
                      onChange={(event) => setStockForm((current) => ({ ...current, product_id: event.target.value }))}
                      className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                    >
                      <option value="">Seleccionar producto</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} · Stock {product.current_stock || 0}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm text-[#68777c]">Tipo</label>
                      <select
                        value={stockForm.movement_type}
                        onChange={(event) => setStockForm((current) => ({ ...current, movement_type: event.target.value }))}
                        className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                      >
                        <option value="entrada">Entrada</option>
                        <option value="ajuste">Ajuste a stock exacto</option>
                      </select>
                    </div>
                    <InputField
                      label={stockForm.movement_type === "ajuste" ? "Nuevo stock" : "Cantidad"}
                      type="number"
                      value={stockForm.quantity}
                      onChange={(value) => setStockForm((current) => ({ ...current, quantity: value }))}
                    />
                  </div>
                  <TextAreaField label="Nota" value={stockForm.note} onChange={(value) => setStockForm((current) => ({ ...current, note: value }))} />
                  <button
                    type="button"
                    onClick={saveStockMovement}
                    className="rounded-full bg-[#bd7b83] px-6 py-3 text-sm text-white transition hover:opacity-90"
                  >
                    Guardar movimiento
                  </button>
                </div>
              </div>
            </Card>
          )}

          <Card className={isProductOwner ? "xl:col-span-2" : ""}>
            <SectionHeader
              eyebrow="Stock"
              title="Productos / Inventario"
              description={`Productos registrados: ${products.length}. Bajo stock: ${lowStockProducts.length}.`}
              action={
                <button
                  type="button"
                  onClick={loadData}
                  className="rounded-full border border-[#bd7b83] px-5 py-3 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
                >
                  Actualizar
                </button>
              }
            />
            <InputField
              label="Buscar por nombre, SKU, categoría o marca"
              value={productSearch}
              onChange={setProductSearch}
              placeholder="Buscar producto..."
            />
            <div className="mt-5 space-y-3">
              {loadingData ? (
                <EmptyState text="Cargando productos..." />
              ) : filteredProducts.length === 0 ? (
                <EmptyState text="No hay productos para mostrar." />
              ) : (
                filteredProducts.map((product) => {
                  const lowStock = Number(product.current_stock || 0) <= Number(product.min_stock || 0);
                  return (
                    <div key={product.id} className="rounded-2xl border border-[#dde3e6] bg-[#fdfefe] p-4">
                      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
                        <div>
                          <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
                            {product.category || "Sin categoría"} · {product.brand || "Sin marca"}
                          </p>
                          <h4 className="mt-2 text-xl font-light">{product.name}</h4>
                          <p className="mt-1 text-sm text-[#68777c]">
                            SKU: {product.sku || "-"} · Proveedor: {product.external_owner_name || "-"}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs">
                            <span className="rounded-full bg-[#f7f9fa] px-3 py-1">
                              Precio: {formatMoney(product.sale_price)}
                            </span>
                            <span className={`rounded-full px-3 py-1 ${lowStock ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
                              Stock: {product.current_stock || 0}
                            </span>
                            <span className="rounded-full bg-[#f7f9fa] px-3 py-1">
                              Mínimo: {product.min_stock || 0}
                            </span>
                            <span className={`rounded-full px-3 py-1 ${product.active === false ? "bg-amber-50 text-amber-700" : "bg-[#f7f9fa]"}`}>
                              {product.active === false ? "Inactivo" : "Activo"}
                            </span>
                          </div>
                        </div>
                        {!isProductOwner && (
                          <div className="flex shrink-0 flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => editProduct(product)}
                              className="rounded-full border border-[#bd7b83] px-4 py-2 text-sm text-[#bd7b83] transition hover:bg-[#bd7b83] hover:text-white"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleProduct(product)}
                              className="rounded-full border border-[#68777c] px-4 py-2 text-sm text-[#68777c] transition hover:bg-[#68777c] hover:text-white"
                            >
                              {product.active === false ? "Activar" : "Desactivar"}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </div>
      )}

      {activeSection === "venta" && !isProductOwner && (
        <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
          <Card>
            <SectionHeader
              eyebrow="Venta"
              title="Nueva venta de productos"
              description="Busca productos, agrégalos al carrito y registra el ingreso separado como venta_producto."
            />
            <InputField label="Buscar producto" value={saleSearch} onChange={setSaleSearch} placeholder="Nombre, SKU o marca..." />
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {saleProductOptions.map((product) => (
                <button
                  type="button"
                  key={product.id}
                  onClick={() => addToCart(product)}
                  className="rounded-2xl border border-[#dde3e6] bg-[#fdfefe] p-4 text-left transition hover:border-[#bd7b83]"
                >
                  <p className="font-medium">{product.name}</p>
                  <p className="mt-1 text-sm text-[#68777c]">
                    {formatMoney(product.sale_price)} · Stock {product.current_stock || 0}
                  </p>
                  <p className="mt-1 text-xs text-[#8a969a]">{product.sku || "Sin SKU"}</p>
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <SectionHeader eyebrow="Carrito" title="Resumen de venta" />

            {cart.length === 0 ? (
              <EmptyState text="Agrega productos para iniciar la venta." />
            ) : (
              <div className="space-y-3">
                {cart.map((item) => (
                  <div key={item.product_id} className="rounded-2xl bg-[#f7f9fa] p-4">
                    <div className="flex justify-between gap-3">
                      <div>
                        <p className="font-medium">{item.product_name}</p>
                        <p className="text-sm text-[#68777c]">
                          {formatMoney(item.unit_price)} · Stock {item.stock}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeCartItem(item.product_id)}
                        className="text-sm text-red-600"
                      >
                        Quitar
                      </button>
                    </div>
                    <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-3">
                      <InputField
                        label="Cantidad"
                        type="number"
                        value={item.quantity}
                        onChange={(value) => updateCartQuantity(item.product_id, value)}
                      />
                      <p className="pb-3 text-right font-medium">
                        {formatMoney(item.subtotal)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm text-[#68777c]">Vendedora</label>
                <select
                  value={saleForm.seller_staff_id}
                  onChange={(event) => {
                    const person = staff.find((item) => item.id === event.target.value);
                    setSaleForm((current) => ({
                      ...current,
                      seller_staff_id: event.target.value,
                      seller_commission_percent:
                        person?.product_commission_percentage ??
                        settingsForm.default_seller_commission_percent ??
                        0,
                    }));
                  }}
                  className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                >
                  <option value="">Sin vendedora</option>
                  {staff.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm text-[#68777c]">Método de pago</label>
                <select
                  value={saleForm.payment_method}
                  onChange={(event) => setSaleForm((current) => ({ ...current, payment_method: event.target.value }))}
                  className="w-full rounded-2xl border border-[#dde3e6] bg-[#f7f9fa] px-4 py-3 outline-none"
                >
                  {paymentMethods.map((method) => (
                    <option key={method.value} value={method.value}>
                      {method.label}
                    </option>
                  ))}
                </select>
              </div>
              <InputField
                label="Descuento"
                type="number"
                value={saleForm.discount_amount}
                onChange={(value) => setSaleForm((current) => ({ ...current, discount_amount: value }))}
              />
              <InputField
                label="% comisión vendedora"
                type="number"
                value={saleForm.seller_commission_percent}
                onChange={(value) => setSaleForm((current) => ({ ...current, seller_commission_percent: value }))}
              />
            </div>
            <div className="mt-4">
              <TextAreaField label="Notas" value={saleForm.notes} onChange={(value) => setSaleForm((current) => ({ ...current, notes: value }))} />
            </div>

            <div className="mt-5 rounded-2xl bg-[#fff6fb] p-4 text-sm text-[#68777c]">
              <div className="grid gap-2">
                <p>Subtotal: <span className="font-medium text-[#263238]">{formatMoney(saleTotals.subtotal)}</span></p>
                <p>Descuento: -{formatMoney(saleTotals.discount)}</p>
                <p>Total: <span className="font-medium text-[#263238]">{formatMoney(saleTotals.total)}</span></p>
                <p>Comisión salón ({saleTotals.salonPercent}%): {formatMoney(saleTotals.salonCommission)}</p>
                <p>Comisión terminal ({saleTotals.terminalPercent}%): {formatMoney(saleTotals.terminalFee)}</p>
                <p>Comisión vendedora ({saleTotals.sellerPercent}%): {formatMoney(saleTotals.sellerCommission)}</p>
                <p className="text-base font-medium text-[#263238]">
                  Neto proveedor externo: {formatMoney(saleTotals.externalNet)}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={saveSale}
              disabled={saving || cart.length === 0}
              className="mt-5 w-full rounded-full bg-[#bd7b83] px-6 py-4 text-white transition hover:opacity-90 disabled:opacity-60"
            >
              {saving ? "Registrando..." : "Registrar venta"}
            </button>
          </Card>
        </div>
      )}

      {activeSection === "movimientos" && (
        <Card>
          <SectionHeader
            eyebrow="Inventario"
            title="Movimientos"
            description="Entradas, ventas, ajustes y devoluciones de productos."
          />
          {movements.length === 0 ? (
            <EmptyState text="Aún no hay movimientos de inventario." />
          ) : (
            <div className="space-y-3">
              {movements.map((movement) => (
                <div key={movement.id} className="rounded-2xl border border-[#dde3e6] bg-[#fdfefe] p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
                    {movement.movement_type} · {new Date(movement.created_at).toLocaleString("es-MX")}
                  </p>
                  <h4 className="mt-2 text-lg font-light">
                    {movement.store_products?.name || "Producto"}
                  </h4>
                  <p className="mt-1 text-sm text-[#68777c]">
                    Cantidad: {movement.quantity} · Stock {movement.previous_stock} → {movement.new_stock}
                  </p>
                  {movement.note && (
                    <p className="mt-2 rounded-xl bg-[#f7f9fa] p-3 text-sm text-[#68777c]">
                      {movement.note}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {activeSection === "reportes" && (
        <div className="space-y-6">
          <Card>
            <SectionHeader
              eyebrow="Reportes"
              title="Ventas de productos"
              description="Totales separados para proveedor externo, salón, terminal y vendedoras."
            />
            <div className="grid gap-4 md:grid-cols-2">
              <InputField label="Desde" type="date" value={reportDateFrom} onChange={setReportDateFrom} />
              <InputField label="Hasta" type="date" value={reportDateTo} onChange={setReportDateTo} />
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <Metric label="Total productos" value={formatMoney(reportSummary.total)} />
              <Metric label="Comisión salón" value={formatMoney(reportSummary.salon)} />
              <Metric label="Comisión terminal" value={formatMoney(reportSummary.terminal)} />
              <Metric label="Comisión vendedoras" value={formatMoney(reportSummary.seller)} />
              <Metric label="Neto proveedor" value={formatMoney(reportSummary.net)} />
            </div>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <SectionHeader eyebrow="Top productos" title="Productos más vendidos" />
              {reportSummary.byProduct.length === 0 ? (
                <EmptyState text="No hay ventas en este rango." />
              ) : (
                <div className="space-y-3">
                  {reportSummary.byProduct.slice(0, 10).map((item) => (
                    <div key={item.productName} className="rounded-2xl bg-[#f7f9fa] p-4">
                      <p className="font-medium">{item.productName}</p>
                      <p className="text-sm text-[#68777c]">
                        Vendidos: {item.quantity} · Total: {formatMoney(item.total)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <SectionHeader eyebrow="Vendedoras" title="Ventas por vendedora" />
              {reportSummary.bySeller.length === 0 ? (
                <EmptyState text="No hay ventas en este rango." />
              ) : (
                <div className="space-y-3">
                  {reportSummary.bySeller.map((item) => (
                    <div key={item.sellerName} className="rounded-2xl bg-[#f7f9fa] p-4">
                      <p className="font-medium">{item.sellerName}</p>
                      <p className="text-sm text-[#68777c]">
                        Ventas: {item.sales} · Total: {formatMoney(item.total)} · Comisión: {formatMoney(item.commission)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card>
            <SectionHeader eyebrow="Stock" title="Bajo stock" />
            {lowStockProducts.length === 0 ? (
              <EmptyState text="No hay productos en bajo stock." />
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {lowStockProducts.map((product) => (
                  <div key={product.id} className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
                    <p className="font-medium">{product.name}</p>
                    <p>Stock {product.current_stock || 0} · Mínimo {product.min_stock || 0}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <SectionHeader eyebrow="Detalle" title="Ventas registradas" />
            {reportSales.length === 0 ? (
              <EmptyState text="No hay ventas en este rango." />
            ) : (
              <div className="space-y-3">
                {reportSales.map((sale) => (
                  <div key={sale.id} className="rounded-2xl border border-[#dde3e6] bg-[#fdfefe] p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">
                      {sale.sale_date} · {paymentMethodLabel(sale.payment_method)}
                    </p>
                    <h4 className="mt-2 text-lg font-light">
                      {formatMoney(sale.total_amount)} · {sale.seller_name || "Sin vendedora"}
                    </h4>
                    <p className="mt-1 text-sm text-[#68777c]">
                      Neto proveedor: {formatMoney(sale.external_owner_net_amount)} · Comisión salón: {formatMoney(sale.salon_commission_amount)} · Terminal: {formatMoney(sale.terminal_fee_amount)}
                    </p>
                    <p className="mt-2 text-sm text-[#68777c]">
                      {(sale.store_sale_items || []).map((item) => `${item.quantity}× ${item.product_name}`).join(" · ")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {activeSection === "configuracion" && !isProductOwner && (
        <Card>
          <SectionHeader
            eyebrow="Configuración"
            title="Parámetros de tienda"
            description="Configura comisiones para productos, terminal y vendedoras."
          />
          <div className="grid gap-4 md:grid-cols-3">
            <InputField
              label="% comisión salón"
              type="number"
              value={settingsForm.salon_product_commission_percent}
              onChange={(value) => setSettingsForm((current) => ({ ...current, salon_product_commission_percent: value }))}
              disabled={!isAdmin}
            />
            <InputField
              label="% comisión terminal tarjeta"
              type="number"
              value={settingsForm.terminal_card_fee_percent}
              onChange={(value) => setSettingsForm((current) => ({ ...current, terminal_card_fee_percent: value }))}
              disabled={!isAdmin}
            />
            <InputField
              label="% comisión vendedora por defecto"
              type="number"
              value={settingsForm.default_seller_commission_percent}
              onChange={(value) => setSettingsForm((current) => ({ ...current, default_seller_commission_percent: value }))}
              disabled={!isAdmin}
            />
          </div>

          <div className="mt-5 rounded-2xl bg-[#fff6fb] p-5 text-sm leading-6 text-[#68777c]">
            <p className="font-medium text-[#263238]">Ejemplo con venta de $1,000 tarjeta:</p>
            <p>Comisión salón {settingsForm.salon_product_commission_percent || 0}% = {formatMoney(1000 * Number(settingsForm.salon_product_commission_percent || 0) / 100)}</p>
            <p>Comisión terminal {settingsForm.terminal_card_fee_percent || 0}% = {formatMoney(1000 * Number(settingsForm.terminal_card_fee_percent || 0) / 100)}</p>
            <p>Neto proveedor antes de comisión vendedora: {formatMoney(1000 - 1000 * Number(settingsForm.salon_product_commission_percent || 0) / 100 - 1000 * Number(settingsForm.terminal_card_fee_percent || 0) / 100)}</p>
          </div>

          <button
            type="button"
            onClick={saveSettings}
            disabled={!isAdmin}
            className="mt-5 rounded-full bg-[#bd7b83] px-6 py-3 text-white transition hover:opacity-90 disabled:opacity-60"
          >
            Guardar configuración
          </button>
        </Card>
      )}
    </AdminShell>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-2xl bg-[#f7f9fa] p-5">
      <p className="text-xs uppercase tracking-[0.2em] text-[#bd7b83]">{label}</p>
      <p className="mt-2 text-2xl font-light">{value}</p>
    </div>
  );
}
