import type { FastifyPluginAsync } from "fastify";
import type { Pool } from "pg";

export const healthRoutes: FastifyPluginAsync<{ pool: Pool }> = async (
  app,
  { pool },
) => {
  // Liveness probe
  app.get("/health", async () => ({ status: "ok" }));

  // Readiness probe
  app.get("/health/ready", async (_req, reply) => {
    try {
      await pool.query("select 1");
      return { status: "ready" };
    } catch (err) {
      app.log.error({ err }, "readiness check failed");
      return reply.code(503).send({ status: "unavailable" });
    }
  });
};
