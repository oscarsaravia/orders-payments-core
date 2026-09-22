import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createPool } from '../src/db.js';

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

const validPayload = (customerId: string) => ({
  customerId,
  items: [{ productName: 'Camisa', unitPriceCents: 5000, quantity: 2 }],
});

describe('POST /orders', () => {
  it('crea una orden con status pending y total calculado', async () => {
    const customerId = await createCustomer();
    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { 'idempotency-key': randomUUID() },
      payload: validPayload(customerId),
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe('pending');
    expect(body.totalCents).toBe(10000);
  });

  it('rechaza la petición si falta el idempotency key', async () => {
    const customerId = await createCustomer();
    const res = await app.inject({ method: 'POST', url: '/orders', payload: validPayload(customerId) });
    expect(res.statusCode).toBe(400);
  });

  it('devuelve la misma orden si se reintenta con la misma key', async () => {
    const customerId = await createCustomer();
    const key = randomUUID();
    const payload = validPayload(customerId);

    const first = await app.inject({ method: 'POST', url: '/orders', headers: { 'idempotency-key': key }, payload });
    const second = await app.inject({ method: 'POST', url: '/orders', headers: { 'idempotency-key': key }, payload });

    expect(second.statusCode).toBe(first.statusCode);
    expect(second.json().id).toBe(first.json().id);
  });

  it('rechaza si la misma key se usa con un body distinto', async () => {
    const customerId = await createCustomer();
    const key = randomUUID();

    await app.inject({ method: 'POST', url: '/orders', headers: { 'idempotency-key': key }, payload: validPayload(customerId) });
    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { 'idempotency-key': key },
      payload: validPayload(await createCustomer()),
    });

    expect(res.statusCode).toBe(422);
  });

  it('dos peticiones concurrentes con la misma key no crean dos órdenes', async () => {
    const customerId = await createCustomer();
    const key = randomUUID();
    const payload = validPayload(customerId);

    const [res1, res2] = await Promise.all([
      app.inject({ method: 'POST', url: '/orders', headers: { 'idempotency-key': key }, payload }),
      app.inject({ method: 'POST', url: '/orders', headers: { 'idempotency-key': key }, payload }),
    ]);

    const statuses = [res1.statusCode, res2.statusCode].sort();
    // Una gana (201), la otra debe ver 409 (en curso) o el mismo 201 si ya había terminado.
    expect(statuses[0]).not.toBe(500);
    expect(statuses[1]).not.toBe(500);

    const count = await pool.query('select count(*) from orders where customer_id = $1', [customerId]);
    expect(Number(count.rows[0].count)).toBe(1);
  });

  it('rechaza un customerId con formato inválido', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { 'idempotency-key': randomUUID() },
      payload: { customerId: 'no-es-un-uuid', items: [{ productName: 'X', unitPriceCents: 100, quantity: 1 }] },
    });
    expect(res.statusCode).toBe(400);
  });
});