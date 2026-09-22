import { z } from 'zod';

export const createOrderSchema = z.object({
  customerId: z.uuid(),
  items: z.array(z.object({
    productName: z.string().min(1),
    unitPriceCents: z.number().int().nonnegative(),
    quantity: z.number().int().positive(),
  })).min(1),
  currency: z.string().length(3).default('GTQ'),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;