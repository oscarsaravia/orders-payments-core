import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from 'pg';
import { createHash } from 'node:crypto';

type Handler = () => Promise<{ statusCode: number; body: unknown }>;

export async function withIdempotency(
  pool: Pool,
  req: FastifyRequest,
  reply: FastifyReply,
  handler: Handler,
): Promise<unknown> {
  const key = req.headers['idempotency-key'];
  if (typeof key !== 'string' || key.length === 0) {
    return reply.code(400).send({ error: 'missing_idempotency_key' });
  }

  const requestHash = createHash('sha256').update(JSON.stringify(req.body)).digest('hex');

  // Intenta reservar la key. Si ya existe, esta query no inserta nada
  // (ON CONFLICT DO NOTHING) y lo detectamos por rowCount === 0.
  const insertResult = await pool.query(
    `insert into idempotency_keys (key, request_path, request_hash)
     values ($1, $2, $3)
     on conflict (key) do nothing`,
    [key, req.url, requestHash],
  );

  if (insertResult.rowCount === 0) {
    // La key ya existía. Puede ser un reintento legítimo (ya terminó,
    // ya respondida) o una petición concurrente (todavía en proceso).
    const existing = await pool.query(
      `select request_hash, status_code, response_body from idempotency_keys where key = $1`,
      [key],
    );
    const row = existing.rows[0];

    if (row.request_hash !== requestHash) {
      return reply.code(422).send({ error: 'idempotency_key_reused_with_different_body' });
    }

    if (row.status_code === null) {
      // Está en proceso ahora mismo, en otra petición concurrente.
      return reply.code(409).send({ error: 'request_in_progress', message: 'Reintenta en unos segundos' });
    }

    return reply.code(row.status_code).send(row.response_body);
  }

  // Esta petición ganó la carrera: le toca ejecutar el handler real.
  try {
    const { statusCode, body } = await handler();
    await pool.query(
      `update idempotency_keys set status_code = $1, response_body = $2 where key = $3`,
      [statusCode, JSON.stringify(body), key],
    );
    return reply.code(statusCode).send(body);
  } catch (err) {
    // Si falla, liberamos la key para que un reintento pueda volver a intentar.
    await pool.query(`delete from idempotency_keys where key = $1`, [key]);
    throw err;
  }
}