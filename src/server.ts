import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPool } from "./db.js";

// Loads the config from the env file, checking for all the variables against the zod schema
const config = loadConfig();

// Builds the Fastify app using the config, creates the DB pool
const app = buildApp({ config, pool: createPool(config.DATABASE_URL) });

// Gracefull shutdown
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    app.log.info({ signal }, "shutting down");
    await app.close();
    process.exit(0);
  });
}

try {
  await app.listen({ port: config.PORT, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
