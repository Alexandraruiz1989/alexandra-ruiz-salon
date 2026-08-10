import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPaymentExtraItems,
  buildPaymentServiceItems,
  calculatePaymentStaffTotals,
  calculatePaymentSummary,
  getAppointmentStaff,
  getReportCommissionAmount,
  getTipTotal,
  normalizeTipAllocations,
} from "../app/lib/paymentEconomics.js";

const laura = {
  id: "11111111-1111-4111-8111-111111111111",
  full_name: "Laura",
  service_commission_percentage: 10,
};
const tania = {
  id: "22222222-2222-4222-8222-222222222222",
  full_name: "Tania",
  service_commission_percentage: 20,
};

function service({ id, staff, amount, name }) {
  return {
    id,
    service_id: `${id}-catalog`,
    staff_id: staff.id,
    staff,
    services: { name },
    quantity: 1,
    unit_price: amount,
    total_price: amount,
  };
}

function appointment(services) {
  return { id: "appointment", appointment_services: services };
}

function staffTotalsFor({ services, extras = [], tips = [] }) {
  return calculatePaymentStaffTotals({
    serviceItems: buildPaymentServiceItems(appointment(services)),
    extraItems: extras,
    tipAllocations: tips,
    staff: [laura, tania],
  });
}

test("A: una cita, un servicio y una colaboradora conserva su importe", () => {
  const services = [
    service({ id: "service-a", staff: laura, amount: 160, name: "Gel" }),
  ];
  const items = buildPaymentServiceItems(appointment(services));
  const totals = staffTotalsFor({ services });

  assert.equal(items.length, 1);
  assert.equal(items[0].total_price, 160);
  assert.equal(totals[0].service_total, 160);
  assert.equal(totals[0].commission_base, 160);
});

test("servicio histórico con total_price cero conserva el precio individual", () => {
  const historical = service({
    id: "service-historical",
    staff: laura,
    amount: 160,
    name: "Gel histórico",
  });
  historical.price = 160;
  historical.total_price = 0;
  historical.unit_price = 0;

  const [item] = buildPaymentServiceItems(appointment([historical]));

  assert.equal(item.unit_price, 160);
  assert.equal(item.total_price, 160);
});

test("B: dos servicios de la misma colaboradora conservan líneas y agregan 540", () => {
  const services = [
    service({ id: "service-a", staff: laura, amount: 160, name: "Gel" }),
    service({ id: "service-b", staff: laura, amount: 380, name: "Pedicure" }),
  ];
  const items = buildPaymentServiceItems(appointment(services));
  const totals = staffTotalsFor({ services });

  assert.deepEqual(items.map((item) => item.total_price), [160, 380]);
  assert.equal(totals.length, 1);
  assert.equal(totals[0].service_total, 540);
});

test("C y D: pago único multi-colaboradora atribuye 160 a Laura y 380 a Tania", () => {
  const services = [
    service({ id: "service-a", staff: laura, amount: 160, name: "Gel" }),
    service({ id: "service-b", staff: tania, amount: 380, name: "Pedicure" }),
  ];
  const items = buildPaymentServiceItems(appointment(services));
  const totals = staffTotalsFor({ services });

  assert.deepEqual(items.map((item) => item.total_price), [160, 380]);
  assert.equal(totals.find((item) => item.staff_id === laura.id).service_total, 160);
  assert.equal(totals.find((item) => item.staff_id === tania.id).service_total, 380);
  assert.equal(
    totals.reduce((sum, item) => sum + item.service_total, 0),
    540
  );
});

test("E y F: cada extra deriva colaboradora exclusivamente de su servicio", () => {
  const services = [
    service({ id: "service-hands", staff: laura, amount: 350, name: "Manos" }),
    service({ id: "service-feet", staff: tania, amount: 380, name: "Pedicure" }),
  ];
  const serviceItems = buildPaymentServiceItems(appointment(services));
  const extras = buildPaymentExtraItems(
    [
      {
        extra_id: "extra-french",
        appointment_service_id: "service-hands",
        name: "Francés",
        quantity: 1,
        unit_price: 60,
        total_price: 60,
        staff_id: tania.id,
      },
      {
        extra_id: "extra-spa",
        appointment_service_id: "service-feet",
        name: "Spa",
        quantity: 2,
        unit_price: 25,
        total_price: 50,
        staff_id: laura.id,
      },
    ],
    serviceItems
  );
  const totals = calculatePaymentStaffTotals({
    serviceItems,
    extraItems: extras,
    staff: [laura, tania],
  });

  assert.equal(extras[0].staff_id, laura.id);
  assert.equal(extras[1].staff_id, tania.id);
  assert.equal(totals.find((item) => item.staff_id === laura.id).extras_total, 60);
  assert.equal(totals.find((item) => item.staff_id === tania.id).extras_total, 50);
});

test("G: no permite un extra nuevo sin appointment_service_id", () => {
  const services = [
    service({ id: "service-a", staff: laura, amount: 160, name: "Gel" }),
  ];

  assert.throws(
    () =>
      buildPaymentExtraItems(
        [
          {
            extra_id: "extra",
            appointment_service_id: "",
            name: "Extra",
            quantity: 1,
            unit_price: 20,
            total_price: 20,
          },
        ],
        buildPaymentServiceItems(appointment(services))
      ),
    /Selecciona el servicio/
  );
});

test("H: propinas manuales 30 y 50 suman exactamente 80 y no generan comisión", () => {
  const services = [
    service({ id: "service-hands", staff: laura, amount: 350, name: "Manos" }),
    service({ id: "service-feet", staff: tania, amount: 380, name: "Pedicure" }),
  ];
  const serviceItems = buildPaymentServiceItems(appointment(services));
  const extras = buildPaymentExtraItems(
    [
      {
        extra_id: "extra-french",
        appointment_service_id: "service-hands",
        name: "Francés",
        quantity: 1,
        unit_price: 60,
        total_price: 60,
      },
    ],
    serviceItems
  );
  const participants = getAppointmentStaff(appointment(services));
  const tips = normalizeTipAllocations(
    { [laura.id]: 30, [tania.id]: 50 },
    participants
  );
  const summary = calculatePaymentSummary({ serviceItems, extraItems: extras, tipAllocations: tips });
  const totals = calculatePaymentStaffTotals({
    serviceItems,
    extraItems: extras,
    tipAllocations: tips,
    staff: [laura, tania],
  });
  const lauraTotal = totals.find((item) => item.staff_id === laura.id);
  const taniaTotal = totals.find((item) => item.staff_id === tania.id);

  assert.equal(getTipTotal(tips), 80);
  assert.equal(summary.tipAmount, 80);
  assert.equal(summary.totalAmount, 870);
  assert.equal(lauraTotal.tip_amount, 30);
  assert.equal(taniaTotal.tip_amount, 50);
  assert.equal(lauraTotal.commission_base, 410);
  assert.equal(taniaTotal.commission_base, 380);
});

test("I y J: soporta propina para una colaboradora y propina cero", () => {
  const participants = [laura, tania];
  const oneTip = normalizeTipAllocations({ [laura.id]: 50 }, participants);
  const zeroTips = normalizeTipAllocations({}, participants);

  assert.equal(getTipTotal(oneTip), 50);
  assert.equal(oneTip.find((item) => item.staff_id === tania.id).tip_amount, 0);
  assert.equal(getTipTotal(zeroTips), 0);
  assert.ok(zeroTips.every((item) => item.tip_amount === 0));
});

test("centavos se concilian sin deriva de punto flotante", () => {
  const tips = normalizeTipAllocations(
    { [laura.id]: 0.1, [tania.id]: 0.2 },
    [laura, tania]
  );
  assert.equal(getTipTotal(tips), 0.3);
});

test("N: una comisión almacenada no cambia al modificar el porcentaje actual", () => {
  const snapshot = {
    commission_base: 410,
    commission_amount: 41,
    commission_snapshot_complete: true,
  };
  const historicalIncomplete = {
    commission_base: 410,
    commission_amount: 0,
    commission_snapshot_complete: false,
  };

  assert.equal(getReportCommissionAmount(snapshot, 10), 41);
  assert.equal(getReportCommissionAmount(snapshot, 80), 41);
  assert.equal(getReportCommissionAmount(historicalIncomplete, 10), 41);
});
