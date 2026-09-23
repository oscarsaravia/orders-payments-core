import { randomUUID } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import type { Pool } from 'pg';
import Stripe from 'stripe';
import { z } from 'zod';
import { withIdempotency } from '../middleware/idempotency.js';
import { findOrderForPayment, insertPayment, markOrderAsPaid } from '../repositories/paymentRepository.js';
import { assertValidTransition } from '../domain/orderStateMachine.js';

const payOrderSchema = z.object({
  paymentMethod: z.enum(['pm_card_visa', 'pm_card_visa_chargeDeclined']).default('pm_card_visa'),
});

export const paymentRoutes: FastifyPluginAsync<{ pool: Pool; stripe: Stripe }> = async (app, { pool, stripe }) => {
  app.post<{ Params: { id: string } }>('/orders/:id/pay', async (req, reply) => {
    const parseResult = payOrderSchema.safeParse(req.body ?? {});
    if (!parseResult.success) {
      return reply.code(400).send({ error: 'invalid_request', details: parseResult.error.flatten() });
    }

    return withIdempotency(pool, req, reply, async () => {
      const order = await findOrderForPayment(pool, req.params.id);
      if (!order) {
        return { statusCode: 404, body: { error: 'order_not_found' } };
      }

      try {
        assertValidTransition(order.status as 'pending', 'paid');
      } catch {
        return { statusCode: 409, body: { error: 'invalid_order_status', currentStatus: order.status } };
      }

      // Idempotency key hacia Stripe: distinta de la nuestra, ligada al intento de cobro
      // específico de esta orden, para que un reintento de red no duplique el cargo en Stripe.
      const stripeIdempotencyKey = `order-${order.id}-payment-attempt`;

      let intent: Stripe.PaymentIntent | null = null;
      let cardDeclineReason: string | null = null;

      try {
        intent = await stripe.paymentIntents.create(
          {
            amount: order.total_cents,
            currency: 'usd',
            payment_method: parseResult.data.paymentMethod,
            confirm: true,
            automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
          },
          { idempotencyKey: stripeIdempotencyKey },
        );
      } catch (err) {
        if (err instanceof Stripe.errors.StripeCardError) {
          // Un rechazo de tarjeta es un resultado de negocio, no una falla de Stripe.
          cardDeclineReason = err.message;
          intent = err.payment_intent ?? null;
        } else {
          app.log.error({ err }, 'stripe payment intent creation failed');
          return { statusCode: 502, body: { error: 'payment_provider_error' } };
        }
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        if (intent?.status === 'succeeded') {
          await insertPayment(client, {
            orderId: order.id,
            stripePaymentIntentId: intent.id,
            status: 'succeeded',
            amountCents: order.total_cents,
          });
          await markOrderAsPaid(client, order.id);
          await client.query('COMMIT');
          return { statusCode: 200, body: { orderId: order.id, status: 'paid', paymentIntentId: intent.id } };
        }

        const failureReason = cardDeclineReason ?? intent?.last_payment_error?.message ?? 'declined';
        await insertPayment(client, {
          orderId: order.id,
          stripePaymentIntentId: intent?.id ?? `failed-${randomUUID()}`,
          status: 'failed',
          amountCents: order.total_cents,
          failureReason,
        });
        await client.query('COMMIT');
        return { statusCode: 402, body: { error: 'payment_failed', reason: failureReason } };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    });
  });
};