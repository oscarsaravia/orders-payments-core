import Fastify, { type FastifyInstance } from "fastify";
import type { Pool } from "pg";

import type { Config } from "./config.js";
import { healthRoutes } from "./routes/health.js";
import { orderRoutes } from "./routes/orders.js";
import { paymentRoutes } from "./routes/payments.js";
import { createStripeClient } from "./clients/stripe.js";

export function buildApp({
  config,
  pool,
}: {
  config: Config;
  pool: Pool;
}): FastifyInstance {
  const stripe = createStripeClient(config.STRIPE_SECRET_KEY);
  const app = Fastify({ logger: { level: config.LOG_LEVEL } });
  // Register plugins
  app.register(healthRoutes, { pool });
  app.register(orderRoutes, { pool });
  app.register(paymentRoutes, { pool, stripe });

  // Ends pool on app close
  app.addHook("onClose", async () => {
    await pool.end();
  });

  // Returns the fastify instance
  return app;
}
