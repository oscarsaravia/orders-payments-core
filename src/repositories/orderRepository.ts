import type { Pool, PoolClient } from "pg";
import type { CreateOrderInput } from "../schemas/order.js";

export interface OrderRecord {
  id: string;
  customerId: string;
  status: string;
  totalCents: number;
  currency: string;
}

export async function insertOrder(
  client: Pool | PoolClient,
  input: CreateOrderInput,
): Promise<OrderRecord> {
  const totalCents = input.items.reduce(
    (sum, item) => sum + item.unitPriceCents * item.quantity,
    0,
  );

  const orderResult = await client.query<{ id: string; status: string }>(
    `insert into orders (customer_id, status, total_cents, currency)
     values ($1, 'pending', $2, $3)
     returning id, status`,
    [input.customerId, totalCents, input.currency],
  );

  const order = orderResult.rows[0]!;

  for (const item of input.items) {
    await client.query(
      `insert into order_items (order_id, product_name, unit_price_cents, quantity)
       values ($1, $2, $3, $4)`,
      [order.id, item.productName, item.unitPriceCents, item.quantity],
    );
  }

  return {
    id: order.id,
    customerId: input.customerId,
    status: order.status,
    totalCents,
    currency: input.currency,
  };
}
