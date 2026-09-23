import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createPool } from "../src/db.js";

const config = loadConfig();
const pool = createPool(config.DATABASE_URL);
const app = buildApp({ config, pool });

afterAll(() => app.close());

async function createCustomer() {
  const email = `${randomUUID()}@example.com`;
  const result = await pool.query<{ id: string }>(
    `insert into customers (email) values ($1) returning id`,
    [email],
  );
  return result.rows[0]!.id;
}

async function createOrder() {
  const customerId = await createCustomer();
  const res = await app.inject({
    method: "POST",
    url: "/orders",
    headers: { "idempotency-key": randomUUID() },
    payload: {
      customerId,
      items: [{ productName: "Camisa", unitPriceCents: 5000, quantity: 1 }],
    },
  });
  return res.json().id as string;
}

describe("POST /orders/:id/pay", () => {
  it("cobra exitosamente y mueve la orden a paid", async () => {
    const orderId = await createOrder();
    const res = await app.inject({
      method: "POST",
      url: `/orders/${orderId}/pay`,
      headers: { "idempotency-key": randomUUID() },
      payload: { paymentMethod: "pm_card_visa" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("paid");
  });

  it("maneja un pago rechazado sin romper la orden", async () => {
    const orderId = await createOrder();
    const res = await app.inject({
      method: "POST",
      url: `/orders/${orderId}/pay`,
      headers: { "idempotency-key": randomUUID() },
      payload: { paymentMethod: "pm_card_visa_chargeDeclined" },
    });

    expect(res.statusCode).toBe(402);

    const orderCheck = await pool.query(
      "select status from orders where id = $1",
      [orderId],
    );
    expect(orderCheck.rows[0].status).toBe("pending");
  });

  it("rechaza pagar una orden que no existe", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/orders/${randomUUID()}/pay`,
      headers: { "idempotency-key": randomUUID() },
      payload: {},
    });
    expect(res.statusCode).toBe(404);
  });

  it("rechaza pagar una orden ya pagada (transición inválida)", async () => {
    const orderId = await createOrder();
    await app.inject({
      method: "POST",
      url: `/orders/${orderId}/pay`,
      headers: { "idempotency-key": randomUUID() },
      payload: { paymentMethod: "pm_card_visa" },
    });

    const secondAttempt = await app.inject({
      method: "POST",
      url: `/orders/${orderId}/pay`,
      headers: { "idempotency-key": randomUUID() }, // key distinta a propósito
      payload: { paymentMethod: "pm_card_visa" },
    });

    expect(secondAttempt.statusCode).toBe(409);
  });
});
