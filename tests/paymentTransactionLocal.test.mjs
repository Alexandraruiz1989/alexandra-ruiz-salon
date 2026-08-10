import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { createClient } from "@supabase/supabase-js";

const localUrl = process.env.LOCAL_SUPABASE_URL || "";
const localServiceRoleKey =
  process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY || "";
const isLoopback = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(
  localUrl
);
const localReady = Boolean(isLoopback && localServiceRoleKey);

function assertNoError(error, context) {
  assert.equal(error, null, `${context}: ${JSON.stringify(error)}`);
}

test(
  "RPC real en Supabase local: granularidad, conciliación, idempotencia y rollback",
  { skip: localReady ? false : "requiere credenciales explícitas de Supabase loopback" },
  async (t) => {
    const supabase = createClient(localUrl, localServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    async function insertOne(table, row) {
      const { data, error } = await supabase
        .from(table)
        .insert(row)
        .select("*")
        .single();
      assertNoError(error, `insert ${table}`);
      return data;
    }

    async function createStaff(name, commission) {
      return insertOne("staff", {
        id: randomUUID(),
        full_name: name,
        phone: `555${Math.floor(Math.random() * 10000000)}`,
        active: true,
        service_commission_percentage: commission,
      });
    }

    async function createClientFixture(label) {
      return insertOne("clients", {
        id: randomUUID(),
        full_name: `Clienta local ${label}`,
        phone: `555${Math.floor(Math.random() * 10000000)}`,
      });
    }

    async function createCatalogService(name, price) {
      return insertOne("services", {
        id: randomUUID(),
        category: "Prueba local cobros",
        name,
        base_price: price,
        duration_minutes: 60,
        active: true,
      });
    }

    async function createAppointmentFixture({
      label,
      depositAmount = 0,
      serviceDefinitions,
    }) {
      const client = await createClientFixture(label);
      const appointment = await insertOne("appointments", {
        id: randomUUID(),
        client_id: client.id,
        staff_id: serviceDefinitions[0].staff.id,
        appointment_date: "2026-08-10",
        start_time: "10:00",
        end_time: "12:00",
        status: "agendada",
        estimated_total: serviceDefinitions.reduce(
          (sum, definition) => sum + definition.amount,
          0
        ),
        deposit_amount: depositAmount,
      });

      const appointmentServices = [];
      for (const [index, definition] of serviceDefinitions.entries()) {
        const catalog = await createCatalogService(
          `${definition.name} ${label}`,
          definition.amount
        );
        appointmentServices.push(
          await insertOne("appointment_services", {
            id: randomUUID(),
            appointment_id: appointment.id,
            service_id: catalog.id,
            staff_id: definition.staff.id,
            service_date: appointment.appointment_date,
            start_time: index === 0 ? "10:00" : "11:00",
            end_time: index === 0 ? "11:00" : "12:00",
            duration_minutes: 60,
            quantity: 1,
            unit_price: definition.unitPrice ?? definition.amount,
            total_price: definition.totalPrice ?? definition.amount,
            price: definition.amount,
            status: "agendado",
          })
        );
      }

      return { appointment, appointmentServices };
    }

    async function callPaymentRpc({
      appointmentId,
      discountAmount = 0,
      tips = [],
      extras = [],
    }) {
      return supabase.rpc("create_payment_transaction", {
        p_appointment_id: appointmentId,
        p_payment_date: "2026-08-10",
        p_payment_method: "Efectivo",
        p_discount_amount: discountAmount,
        p_tip_allocations: tips,
        p_extra_items: extras,
        p_notes: "Prueba de integración exclusivamente local",
      });
    }

    const laura = await createStaff(`Laura local ${randomUUID()}`, 10);
    const tania = await createStaff(`Tania local ${randomUUID()}`, 20);

    let successfulFixture;
    let successfulPaymentId;

    await t.test(
      "servicios y colaboradoras múltiples conservan partidas, extra, propinas y snapshot",
      async () => {
        successfulFixture = await createAppointmentFixture({
          label: randomUUID(),
          depositAmount: 100,
          serviceDefinitions: [
            { name: "Manos", amount: 350, staff: laura },
            { name: "Pedicure", amount: 380, staff: tania },
          ],
        });

        const extraCatalog = await insertOne("service_extras", {
          id: randomUUID(),
          name: "Francés local",
          category: "Prueba local cobros",
          price: 60,
          pricing_type: "fixed",
          active: true,
        });
        const plannedExtra = await insertOne("appointment_extra_items", {
          id: randomUUID(),
          appointment_id: successfulFixture.appointment.id,
          extra_id: extraCatalog.id,
          appointment_service_id: null,
          staff_id: tania.id,
          name: extraCatalog.name,
          quantity: 1,
          unit_price: 60,
          total_price: 60,
        });

        const { data, error } = await callPaymentRpc({
          appointmentId: successfulFixture.appointment.id,
          discountAmount: 20,
          tips: [
            { staffId: laura.id, amount: 30 },
            { staffId: tania.id, amount: 50 },
          ],
          extras: [
            {
              appointmentExtraItemId: plannedExtra.id,
              appointmentServiceId:
                successfulFixture.appointmentServices[0].id,
              extraId: extraCatalog.id,
              name: extraCatalog.name,
              quantity: 1,
              unitPrice: 60,
              totalPrice: 60,
            },
          ],
        });
        assertNoError(error, "create_payment_transaction");
        successfulPaymentId = data.paymentId;

        assert.equal(data.subtotalServices, 730);
        assert.equal(data.subtotalExtras, 60);
        assert.equal(data.discountAmount, 20);
        assert.equal(data.depositAmount, 100);
        assert.equal(data.tipAmount, 80);
        assert.equal(data.totalAmount, 750);

        const paymentResult = await supabase
          .from("payments")
          .select("*")
          .eq("id", successfulPaymentId)
          .single();
        assertNoError(paymentResult.error, "select payment");
        assert.equal(Number(paymentResult.data.tip_amount), 80);
        assert.equal(Number(paymentResult.data.total_amount), 750);

        const servicesResult = await supabase
          .from("payment_service_items")
          .select("appointment_service_id, staff_id, total_price")
          .eq("payment_id", successfulPaymentId)
          .order("total_price", { ascending: true });
        assertNoError(servicesResult.error, "select payment_service_items");
        assert.deepEqual(
          servicesResult.data.map((item) => Number(item.total_price)),
          [350, 380]
        );

        const extrasResult = await supabase
          .from("payment_extra_items")
          .select("appointment_service_id, appointment_extra_item_id, staff_id, total_price")
          .eq("payment_id", successfulPaymentId)
          .single();
        assertNoError(extrasResult.error, "select payment_extra_items");
        assert.equal(
          extrasResult.data.appointment_service_id,
          successfulFixture.appointmentServices[0].id
        );
        assert.equal(extrasResult.data.staff_id, laura.id);
        assert.equal(Number(extrasResult.data.total_price), 60);

        const staffTotalsResult = await supabase
          .from("payment_staff_totals")
          .select("*")
          .eq("payment_id", successfulPaymentId);
        assertNoError(staffTotalsResult.error, "select payment_staff_totals");
        const lauraTotal = staffTotalsResult.data.find(
          (item) => item.staff_id === laura.id
        );
        const taniaTotal = staffTotalsResult.data.find(
          (item) => item.staff_id === tania.id
        );

        assert.deepEqual(
          {
            service: Number(lauraTotal.service_total),
            extras: Number(lauraTotal.extras_total),
            base: Number(lauraTotal.commission_base),
            commission: Number(lauraTotal.commission_amount),
            tip: Number(lauraTotal.tip_amount),
            snapshot: lauraTotal.commission_snapshot_complete,
          },
          {
            service: 350,
            extras: 60,
            base: 410,
            commission: 41,
            tip: 30,
            snapshot: true,
          }
        );
        assert.deepEqual(
          {
            service: Number(taniaTotal.service_total),
            extras: Number(taniaTotal.extras_total),
            base: Number(taniaTotal.commission_base),
            commission: Number(taniaTotal.commission_amount),
            tip: Number(taniaTotal.tip_amount),
            snapshot: taniaTotal.commission_snapshot_complete,
          },
          {
            service: 380,
            extras: 0,
            base: 380,
            commission: 76,
            tip: 50,
            snapshot: true,
          }
        );

        const cashResult = await supabase
          .from("cash_movements")
          .select("amount, category")
          .eq("payment_id", successfulPaymentId)
          .single();
        assertNoError(cashResult.error, "select cash_movements");
        assert.equal(Number(cashResult.data.amount), 750);
        assert.equal(cashResult.data.category, "servicio");

        const originalExtraResult = await supabase
          .from("appointment_extra_items")
          .select("appointment_service_id, staff_id")
          .eq("id", plannedExtra.id)
          .single();
        assertNoError(originalExtraResult.error, "select appointment_extra_items");
        assert.equal(
          originalExtraResult.data.appointment_service_id,
          successfulFixture.appointmentServices[0].id
        );
        assert.equal(originalExtraResult.data.staff_id, laura.id);
      }
    );

    await t.test("repetir el mismo cobro no crea duplicados", async () => {
      const retry = await callPaymentRpc({
        appointmentId: successfulFixture.appointment.id,
      });
      assert.ok(retry.error);
      assert.match(retry.error.message, /appointment_already_paid/i);

      const paymentCount = await supabase
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("appointment_id", successfulFixture.appointment.id);
      assertNoError(paymentCount.error, "count idempotent payments");
      assert.equal(paymentCount.count, 1);
    });

    await t.test(
      "un servicio histórico con total_price cero cobra su price individual",
      async () => {
        const fixture = await createAppointmentFixture({
          label: randomUUID(),
          serviceDefinitions: [
            {
              name: "Gel histórico",
              amount: 160,
              unitPrice: 0,
              totalPrice: 0,
              staff: laura,
            },
          ],
        });
        const result = await callPaymentRpc({
          appointmentId: fixture.appointment.id,
        });
        assertNoError(result.error, "create historical payment");
        assert.equal(result.data.subtotalServices, 160);
        assert.equal(result.data.totalAmount, 160);

        const itemResult = await supabase
          .from("payment_service_items")
          .select("unit_price, total_price")
          .eq("payment_id", result.data.paymentId)
          .single();
        assertNoError(itemResult.error, "select historical payment service");
        assert.equal(Number(itemResult.data.unit_price), 160);
        assert.equal(Number(itemResult.data.total_price), 160);
      }
    );

    await t.test("dos llamadas concurrentes producen un solo pago", async () => {
      const fixture = await createAppointmentFixture({
        label: randomUUID(),
        serviceDefinitions: [
          { name: "Gel", amount: 160, staff: laura },
          { name: "Pedicure", amount: 380, staff: tania },
        ],
      });

      const results = await Promise.all([
        callPaymentRpc({ appointmentId: fixture.appointment.id }),
        callPaymentRpc({ appointmentId: fixture.appointment.id }),
      ]);
      assert.equal(results.filter((result) => !result.error).length, 1);
      assert.equal(results.filter((result) => result.error).length, 1);

      const paymentCount = await supabase
        .from("payments")
        .select("id", { count: "exact", head: true })
        .eq("appointment_id", fixture.appointment.id);
      assertNoError(paymentCount.error, "count concurrent payments");
      assert.equal(paymentCount.count, 1);
    });

    await t.test(
      "un extra sin appointment_service_id se rechaza sin persistir pago",
      async () => {
        const fixture = await createAppointmentFixture({
          label: randomUUID(),
          serviceDefinitions: [{ name: "Gel", amount: 160, staff: laura }],
        });
        const result = await callPaymentRpc({
          appointmentId: fixture.appointment.id,
          extras: [
            {
              extraId: null,
              name: "Extra inválido",
              quantity: 1,
              unitPrice: 20,
              totalPrice: 20,
            },
          ],
        });
        assert.ok(result.error);
        assert.match(result.error.message, /extra_appointment_service_required/i);

        const paymentCount = await supabase
          .from("payments")
          .select("id", { count: "exact", head: true })
          .eq("appointment_id", fixture.appointment.id);
        assertNoError(paymentCount.error, "count rejected payments");
        assert.equal(paymentCount.count, 0);
      }
    );

    await t.test(
      "un fallo de FK durante payment_extra_items revierte payment y partidas previas",
      async () => {
        const fixture = await createAppointmentFixture({
          label: randomUUID(),
          serviceDefinitions: [{ name: "Gel", amount: 160, staff: laura }],
        });
        const invalidCatalogExtraId = randomUUID();
        const result = await callPaymentRpc({
          appointmentId: fixture.appointment.id,
          extras: [
            {
              appointmentServiceId: fixture.appointmentServices[0].id,
              extraId: invalidCatalogExtraId,
              name: "Provoca rollback local",
              quantity: 1,
              unitPrice: 25,
              totalPrice: 25,
            },
          ],
        });
        assert.ok(result.error);
        assert.match(result.error.message, /foreign key|violates/i);

        const paymentCount = await supabase
          .from("payments")
          .select("id", { count: "exact", head: true })
          .eq("appointment_id", fixture.appointment.id);
        assertNoError(paymentCount.error, "count rolled back payments");
        assert.equal(paymentCount.count, 0);

        const serviceItemCount = await supabase
          .from("payment_service_items")
          .select("id, payments!inner(appointment_id)", {
            count: "exact",
            head: true,
          })
          .eq("payments.appointment_id", fixture.appointment.id);
        assertNoError(serviceItemCount.error, "count rolled back service items");
        assert.equal(serviceItemCount.count, 0);
      }
    );

    await t.test("un extra histórico puede permanecer sin servicio identificado", async () => {
      const fixture = await createAppointmentFixture({
        label: randomUUID(),
        serviceDefinitions: [{ name: "Gel", amount: 160, staff: laura }],
      });
      const historical = await insertOne("appointment_extra_items", {
        id: randomUUID(),
        appointment_id: fixture.appointment.id,
        appointment_service_id: null,
        staff_id: laura.id,
        name: "Extra histórico local",
        quantity: 1,
        unit_price: 10,
        total_price: 10,
      });
      assert.equal(historical.appointment_service_id, null);
    });
  }
);
