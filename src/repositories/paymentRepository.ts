import type { Pool, PoolClient } from 'pg';

export async function insertPayment(
  client: Pool | PoolClient,
  params: { orderId: string; stripePaymentIntentId: string; status: 'pending' | 'succeeded' | 'failed'; amountCents: number; failureReason?: string },
) {
  const result = await client.query(
    `insert into payments (order_id, stripe_payment_intent_id, status, amount_cents, failure_reason)
     values ($1, $2, $3, $4, $5)
     returning id, status`,
    [params.orderId, params.stripePaymentIntentId, params.status, params.amountCents, params.failureReason ?? null],
  );
  return result.rows[0]!;
}

export async function findOrderForPayment(client: Pool | PoolClient, orderId: string) {
  const result = await client.query<{ id: string; status: string; total_cents: number }>(
    `select id, status, total_cents from orders where id = $1`,
    [orderId],
  );
  return result.rows[0] ?? null;
}

export async function markOrderAsPaid(client: PoolClient, orderId: string) {
  await client.query(
    `update orders set status = 'paid', updated_at = now() where id = $1`,
    [orderId],
  );
}