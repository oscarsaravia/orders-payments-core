export type OrderStatus = "pending" | "paid" | "cancelled" | "refunded";

const transitions: Record<OrderStatus, OrderStatus[]> = {
  pending: ["paid", "cancelled"],
  paid: ["refunded"],
  cancelled: [],
  refunded: [],
};

export class InvalidTransitionError extends Error {
  constructor(from: OrderStatus, to: OrderStatus) {
    super(`No se puede pasar de "${from}" a "${to}"`);
    this.name = "InvalidTransitionError";
  }
}

export function assertValidTransition(
  from: OrderStatus,
  to: OrderStatus,
): void {
  if (!transitions[from].includes(to)) {
    throw new InvalidTransitionError(from, to);
  }
}
