import { TRPCError } from "@trpc/server";
import type { OrderStatus } from "../db/schema.js";

/**
 * The only path forward is pending -> confirmed -> preparing ->
 * out_for_delivery -> delivered. `canceled` is reachable from any state
 * before delivered, but delivered and canceled are both terminal — no
 * step may be skipped (e.g. pending straight to delivered).
 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["confirmed", "canceled"],
  confirmed: ["preparing", "canceled"],
  preparing: ["out_for_delivery", "canceled"],
  out_for_delivery: ["delivered", "canceled"],
  delivered: [],
  canceled: [],
};

export function canTransitionOrderStatus(from: OrderStatus, to: OrderStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertValidOrderTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransitionOrderStatus(from, to)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Cannot move an order from "${from}" directly to "${to}"`,
    });
  }
}
