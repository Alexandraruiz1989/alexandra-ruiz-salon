const SERVICE_COMMISSION_FIELDS = [
  "service_commission_percent",
  "services_commission_percent",
  "commission_service_percent",
  "commission_services_percent",
  "service_commission_percentage",
  "services_commission_percentage",
  "commission_percentage",
  "commission_percent",
  "commission",
];

export function moneyToCents(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100);
}

export function centsToMoney(value) {
  return Number((Number(value || 0) / 100).toFixed(2));
}

export function normalizeMoney(value) {
  return centsToMoney(moneyToCents(value));
}

export function getServiceCommissionPercent(person) {
  for (const field of SERVICE_COMMISSION_FIELDS) {
    const value = Number(person?.[field] || 0);
    if (value > 0) return value;
  }
  return 0;
}

export function getReportCommissionAmount(item, fallbackPercent = 0) {
  const savedAmountCents = moneyToCents(item?.commission_amount);
  if (
    item?.commission_snapshot_complete === true ||
    savedAmountCents !== 0
  ) {
    return centsToMoney(savedAmountCents);
  }

  return centsToMoney(
    Math.round(
      (moneyToCents(item?.commission_base) * Number(fallbackPercent || 0)) / 100
    )
  );
}

export function getAppointmentServiceAmount(service) {
  const savedTotal = normalizeMoney(service?.total_price);
  return savedTotal > 0 ? savedTotal : normalizeMoney(service?.price ?? 0);
}

export function getAppointmentStaff(appointment) {
  return [
    ...new Map(
      (appointment?.appointment_services || [])
        .filter((service) => service.staff_id)
        .map((service) => [
          service.staff_id,
          {
            id: service.staff_id,
            full_name: service.staff?.full_name || "Técnica",
          },
        ])
    ).values(),
  ];
}

export function normalizeTipAllocations(tipAmounts = {}, participants = []) {
  return participants.map((person) => ({
    staff_id: person.id,
    staff_name: person.full_name || "Técnica",
    tip_amount: centsToMoney(
      Math.max(moneyToCents(tipAmounts?.[person.id] || 0), 0)
    ),
  }));
}

export function getTipTotal(tipAllocations = []) {
  return centsToMoney(
    tipAllocations.reduce(
      (total, allocation) => total + moneyToCents(allocation.tip_amount),
      0
    )
  );
}

export function buildPaymentServiceItems(appointment) {
  return (appointment?.appointment_services || []).map((service) => ({
    appointment_service_id: service.id,
    service_id: service.service_id,
    staff_id: service.staff_id || null,
    name: service.services?.name || service.custom_name || "Servicio",
    staff_name: service.staff?.full_name || null,
    start_time: service.start_time || null,
    end_time: service.end_time || null,
    quantity: normalizeMoney(service.quantity || 1),
    unit_price: normalizeMoney(
      Number(service.unit_price || 0) > 0
        ? service.unit_price
        : service.price ?? service.total_price ?? 0
    ),
    total_price: getAppointmentServiceAmount(service),
  }));
}

export function buildPaymentExtraItems(extraLines = [], serviceItems = []) {
  const servicesById = new Map(
    serviceItems.map((service) => [service.appointment_service_id, service])
  );

  return extraLines
    .filter(
      (line) =>
        (line.extra_id || String(line.name || "").trim()) &&
        moneyToCents(line.total_price) > 0
    )
    .map((line) => {
      const service = servicesById.get(line.appointment_service_id);
      if (!service) {
        throw new Error(
          `Selecciona el servicio correspondiente al extra ${line.name || "sin nombre"}.`
        );
      }

      const quantity = normalizeMoney(line.quantity || 1);
      const unitPrice = normalizeMoney(line.unit_price || 0);
      const totalPrice = centsToMoney(
        Math.round(Number(quantity || 0) * moneyToCents(unitPrice))
      );

      return {
        appointment_extra_item_id: line.appointment_extra_item_id || null,
        appointment_service_id: service.appointment_service_id,
        extra_id: line.extra_id,
        staff_id: service.staff_id || null,
        name: line.name || "Extra",
        quantity,
        unit_price: unitPrice,
        total_price: totalPrice,
      };
    });
}

export function calculatePaymentSummary({
  serviceItems = [],
  extraItems = [],
  tipAllocations = [],
  discountAmount = 0,
  depositAmount = 0,
} = {}) {
  const serviceCents = serviceItems.reduce(
    (sum, item) => sum + moneyToCents(item.total_price),
    0
  );
  const extraCents = extraItems.reduce(
    (sum, item) => sum + moneyToCents(item.total_price),
    0
  );
  const tipCents = tipAllocations.reduce(
    (sum, item) => sum + moneyToCents(item.tip_amount),
    0
  );
  const discountCents = Math.max(moneyToCents(discountAmount), 0);
  const depositCents = Math.max(moneyToCents(depositAmount), 0);
  const servicesPaymentCents = Math.max(
    serviceCents + extraCents - discountCents - depositCents + tipCents,
    0
  );

  return {
    subtotalServices: centsToMoney(serviceCents),
    subtotalExtras: centsToMoney(extraCents),
    discountAmount: centsToMoney(discountCents),
    depositAmount: centsToMoney(depositCents),
    tipAmount: centsToMoney(tipCents),
    servicesPaymentTotal: centsToMoney(servicesPaymentCents),
    totalAmount: centsToMoney(servicesPaymentCents),
  };
}

export function calculatePaymentStaffTotals({
  serviceItems = [],
  extraItems = [],
  tipAllocations = [],
  staff = [],
} = {}) {
  const totals = new Map();
  const staffById = new Map(staff.map((person) => [person.id, person]));

  const ensure = (staffId) => {
    if (!staffId) return null;
    if (!totals.has(staffId)) {
      totals.set(staffId, {
        staff_id: staffId,
        service_total_cents: 0,
        extras_total_cents: 0,
        tip_amount_cents: 0,
      });
    }
    return totals.get(staffId);
  };

  serviceItems.forEach((item) => {
    const total = ensure(item.staff_id);
    if (total) total.service_total_cents += moneyToCents(item.total_price);
  });

  extraItems.forEach((item) => {
    const total = ensure(item.staff_id);
    if (total) total.extras_total_cents += moneyToCents(item.total_price);
  });

  tipAllocations.forEach((item) => {
    const total = ensure(item.staff_id);
    if (total) total.tip_amount_cents += moneyToCents(item.tip_amount);
  });

  return [...totals.values()].map((item) => {
    const commissionBaseCents =
      item.service_total_cents + item.extras_total_cents;
    const commissionPercent = getServiceCommissionPercent(
      staffById.get(item.staff_id)
    );
    const commissionAmountCents = Math.round(
      (commissionBaseCents * commissionPercent) / 100
    );

    return {
      staff_id: item.staff_id,
      service_total: centsToMoney(item.service_total_cents),
      extras_total: centsToMoney(item.extras_total_cents),
      commission_base: centsToMoney(commissionBaseCents),
      commission_amount: centsToMoney(commissionAmountCents),
      tip_amount: centsToMoney(item.tip_amount_cents),
      commission_snapshot_complete: true,
    };
  });
}
