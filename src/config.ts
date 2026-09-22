import { z } from "zod";

// Scheme that defines the ENV file variables
const configSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().default(3000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  DATABASE_URL: z.url(),
  AWS_REGION: z.string().default("us-east-1"),
  AWS_ENDPOINT_URL: z.url().optional(),
});

export type Config = z.infer<typeof configSchema>;
export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config =>
  configSchema.parse(env);
