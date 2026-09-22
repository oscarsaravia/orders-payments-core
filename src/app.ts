import Fastify, { type FastifyInstance } from "fastify";
import type { Pool } from "pg";
import type { Config } from "./config.js";
import { healthRoutes } from "./routes/health.js";

export function buildApp({
  config,
  pool,
}: {
  config: Config;
  pool: Pool;
}): FastifyInstance {
  const app = Fastify({ logger: { level: config.LOG_LEVEL } });
  app.register(healthRoutes, { pool });
  app.addHook("onClose", async () => {
    await pool.end();
  });
  return app;
}
