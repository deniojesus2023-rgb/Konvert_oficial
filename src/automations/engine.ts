import { randomUUID } from "node:crypto";
import { and, eq, inArray, lte, ne } from "drizzle-orm";
import type { Database } from "../db/client.js";
import {
  customerTags,
  customers,
  journeyExecutions,
  journeys,
  orders,
  type JourneyStep,
  type JourneyTrigger,
} from "../db/schema.js";
import { sendWhatsApp } from "../adapters/whatsapp.js";

/**
 * Starts one execution per active journey registered for (storeId,
 * trigger). This is the ONLY entry point that may create a
 * journey_execution — call it right where the business event happens
 * (checkout completed, customer created, ...) and always with the
 * storeId of the store the event happened in. A trigger fired for store
 * A can only ever match journeys whose storeId is also A: the WHERE
 * clause makes that structurally true, not just a convention.
 */
export async function fireJourneyTrigger(
  db: Database,
  trigger: JourneyTrigger,
  storeId: string,
  customerId: string,
): Promise<string[]> {
  const matchingJourneys = await db
    .select()
    .from(journeys)
    .where(and(eq(journeys.storeId, storeId), eq(journeys.trigger, trigger), eq(journeys.status, "active")));

  const executionIds: string[] = [];
  for (const journey of matchingJourneys) {
    const id = randomUUID();
    await db.insert(journeyExecutions).values({
      id,
      storeId,
      journeyId: journey.id,
      customerId,
      status: "running",
      currentStep: 0,
      nextStepAt: new Date(),
    });
    executionIds.push(id);
  }
  return executionIds;
}

/**
 * Advances every due execution ("running" and nextStepAt <= now) by as
 * many non-wait steps as it can in one tick, across ALL stores at once —
 * this is what the periodic job calls. Each row carries its own storeId
 * (denormalized on journey_executions), and that row's storeId is what
 * decides which store's WhatsApp config gets used and which store a tag
 * gets applied under — never a global default, never the previous row's
 * store leaking into the next.
 */
export async function processJourneyExecutionsBatch(
  db: Database,
  opts: { now?: Date } = {},
): Promise<{ processed: number; completed: number }> {
  const now = opts.now ?? new Date();

  const due = await db
    .select({
      id: journeyExecutions.id,
      storeId: journeyExecutions.storeId,
      customerId: journeyExecutions.customerId,
      currentStep: journeyExecutions.currentStep,
      steps: journeys.steps,
    })
    .from(journeyExecutions)
    .innerJoin(journeys, eq(journeys.id, journeyExecutions.journeyId))
    .where(and(eq(journeyExecutions.status, "running"), lte(journeyExecutions.nextStepAt, now)));

  let completed = 0;

  for (const execution of due) {
    const steps = execution.steps as JourneyStep[];
    let currentStep = execution.currentStep;
    let nextStepAt = now;
    let finished = false;

    while (currentStep < steps.length) {
      const step = steps[currentStep]!;

      if (step.type === "wait") {
        nextStepAt = new Date(now.getTime() + step.hours * 60 * 60 * 1000);
        currentStep += 1;
        break;
      }

      if (step.type === "send_whatsapp") {
        const [customer] = await db.select().from(customers).where(eq(customers.id, execution.customerId));
        if (customer) {
          // execution.storeId — not any cached/global store — decides whose WhatsApp config sends this.
          await sendWhatsApp(db, execution.storeId, customer.phone, step.message);
        }
        currentStep += 1;
        continue;
      }

      if (step.type === "apply_tag") {
        await db
          .insert(customerTags)
          .values({
            id: randomUUID(),
            storeId: execution.storeId,
            customerId: execution.customerId,
            tag: step.tag,
          })
          .onDuplicateKeyUpdate({ set: { tag: step.tag } });
        currentStep += 1;
        continue;
      }
    }

    if (currentStep >= steps.length) {
      finished = true;
    }

    await db
      .update(journeyExecutions)
      .set({
        currentStep,
        nextStepAt,
        status: finished ? "completed" : "running",
      })
      .where(eq(journeyExecutions.id, execution.id));

    if (finished) completed += 1;
  }

  return { processed: due.length, completed };
}

const VIP_SPEND_THRESHOLD = 300;
const INACTIVE_DAYS_THRESHOLD = 30;

/**
 * Recomputes the auto tags for exactly one (storeId, customerId) pair,
 * using ONLY that store's own orders — never the customer's order
 * history from any other store. This is the function to reach for both
 * from the periodic job and from tests, since it makes no assumption
 * about wall-clock time beyond an injectable `now`.
 */
export async function computeCustomerTagsForStore(
  db: Database,
  storeId: string,
  customerId: string,
  opts: { now?: Date } = {},
): Promise<string[]> {
  const now = opts.now ?? new Date();

  const customerOrders = await db
    .select()
    .from(orders)
    .where(and(eq(orders.storeId, storeId), eq(orders.customerId, customerId), ne(orders.status, "canceled")));

  const tags = new Set<string>();
  if (customerOrders.length === 1) tags.add("novo");
  if (customerOrders.length >= 2) tags.add("recorrente");

  if (customerOrders.length > 0) {
    const totalSpend = customerOrders.reduce((sum, order) => sum + Number(order.total), 0);
    if (totalSpend >= VIP_SPEND_THRESHOLD) tags.add("vip");

    const mostRecent = customerOrders.reduce((latest, order) =>
      order.createdAt > latest.createdAt ? order : latest,
    );
    const daysSinceLastOrder = (now.getTime() - mostRecent.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastOrder >= INACTIVE_DAYS_THRESHOLD) tags.add("inativo_30");
  }

  const existing = await db
    .select()
    .from(customerTags)
    .where(and(eq(customerTags.storeId, storeId), eq(customerTags.customerId, customerId)));

  const toRemove = existing.filter((row) => !tags.has(row.tag));
  const existingTagNames = new Set(existing.map((row) => row.tag));
  const toAdd = [...tags].filter((tag) => !existingTagNames.has(tag));

  if (toRemove.length > 0) {
    await db.delete(customerTags).where(
      inArray(
        customerTags.id,
        toRemove.map((row) => row.id),
      ),
    );
  }
  for (const tag of toAdd) {
    await db.insert(customerTags).values({ id: randomUUID(), storeId, customerId, tag });
  }

  return [...tags];
}

/**
 * The periodic tag-recompute job: finds every (storeId, customerId) pair
 * that has placed at least one order, grouped by BOTH columns together —
 * grouping by customerId alone would blend a customer's behavior across
 * stores, which is exactly the bug this phase exists to avoid.
 */
export async function recomputeAllCustomerTags(db: Database, opts: { now?: Date } = {}): Promise<number> {
  const pairs = await db
    .selectDistinct({ storeId: orders.storeId, customerId: orders.customerId })
    .from(orders)
    .where(ne(orders.status, "canceled"));

  let count = 0;
  for (const pair of pairs) {
    if (!pair.customerId) continue;
    await computeCustomerTagsForStore(db, pair.storeId, pair.customerId, opts);
    count += 1;
  }
  return count;
}
