import type { FastifyPluginAsync } from "fastify";
import type { Pool } from "pg";
import { createOrderSchema } from "../schemas/order.js";
import { insertOrder } from "../repositories/orderRepository.js";
import { withIdempotency } from "../middleware/idempotency.js";

export const orderRoutes: FastifyPluginAsync<{ pool: Pool }> = async (
  app,
  { pool },
) => {
  app.post("/orders", async (req, reply) => {
    const parseResult = createOrderSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply
        .code(400)
        .send({
          error: "invalid_request",
          details: parseResult.error.flatten(),
        });
    }

    return withIdempotency(pool, req, reply, async () => {
      const client = await pool.connect();
      // Create order transaction
      try {
        await client.query("BEGIN");
        const order = await insertOrder(client, parseResult.data);
        await client.query("COMMIT");
        return { statusCode: 201, body: order };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    });
  });
};
