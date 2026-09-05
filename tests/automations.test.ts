import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  caller,
  closeDb,
  createAccountWithStore,
  createCustomer,
  resetDb,
  seedOrderForCustomer,
  testDb,
} from "./helpers.js";
import { customerTags, journeyExecutions, journeys } from "../src/db/schema.js";
import { computeCustomerTagsForStore, fireJourneyTrigger, processJourneyExecutionsBatch } from "../src/automations/engine.js";
import { clearWhatsAppLog, sentWhatsAppLog } from "../src/adapters/whatsapp.js";

afterAll(async () => {
  await closeDb();
});

beforeEach(async () => {
  await resetDb();
  clearWhatsAppLog();
});

describe("customer tags are computed per store, never aggregated", () => {
  it("the same customer gets different tags in store A and store B", async () => {
    const storeA = await createAccountWithStore("A");
    const storeB = await createAccountWithStore("B");
    const customer = await createCustomer();

    // Two orders in store A (recorrente), zero orders in store B.
    await seedOrderForCustomer(storeA.store.id, customer.id, { total: "40.00" });
    await seedOrderForCustomer(storeA.store.id, customer.id, { total: "40.00" });
    // One order in store B (novo).
    await seedOrderForCustomer(storeB.store.id, customer.id, { total: "20.00" });

    const tagsA = await computeCustomerTagsForStore(testDb, storeA.store.id, customer.id);
    const tagsB = await computeCustomerTagsForStore(testDb, storeB.store.id, customer.id);

    expect(tagsA).toContain("recorrente");
    expect(tagsA).not.toContain("novo");
    expect(tagsB).toContain("novo");
    expect(tagsB).not.toContain("recorrente");
  });

  it("computes vip in the high-spend store while staying novo in the other", async () => {
    const storeA = await createAccountWithStore("A");
    const storeB = await createAccountWithStore("B");
    const customer = await createCustomer();

    await seedOrderForCustomer(storeA.store.id, customer.id, { total: "500.00" });
    await seedOrderForCustomer(storeB.store.id, customer.id, { total: "10.00" });

    const tagsA = await computeCustomerTagsForStore(testDb, storeA.store.id, customer.id);
    const tagsB = await computeCustomerTagsForStore(testDb, storeB.store.id, customer.id);

    expect(tagsA).toContain("vip");
    expect(tagsB).not.toContain("vip");
  });
});

describe("fireJourneyTrigger never crosses stores", () => {
  it("firing a trigger in store A does not start an execution for store B's journey with the same trigger", async () => {
    const storeA = await createAccountWithStore("A");
    const storeB = await createAccountWithStore("B");
    const customer = await createCustomer();

    await testDb.insert(journeys).values({
      id: randomUUID(),
      storeId: storeA.store.id,
      name: "Boas vindas A",
      trigger: "novo_cliente",
      steps: [{ type: "apply_tag", tag: "boas-vindas" }],
    });
    await testDb.insert(journeys).values({
      id: randomUUID(),
      storeId: storeB.store.id,
      name: "Boas vindas B",
      trigger: "novo_cliente",
      steps: [{ type: "apply_tag", tag: "boas-vindas" }],
    });

    const executionIds = await fireJourneyTrigger(testDb, "novo_cliente", storeA.store.id, customer.id);
    expect(executionIds).toHaveLength(1);

    const allExecutions = await testDb.select().from(journeyExecutions);
    expect(allExecutions).toHaveLength(1);
    expect(allExecutions[0]!.storeId).toBe(storeA.store.id);
  });

  it("only active journeys fire, and only for the exact trigger given", async () => {
    const storeA = await createAccountWithStore("A");
    const customer = await createCustomer();

    await testDb.insert(journeys).values({
      id: randomUUID(),
      storeId: storeA.store.id,
      name: "Inativa",
      trigger: "novo_cliente",
      steps: [{ type: "apply_tag", tag: "x" }],
      status: "inactive",
    });
    await testDb.insert(journeys).values({
      id: randomUUID(),
      storeId: storeA.store.id,
      name: "Trigger errado",
      trigger: "inativo_30",
      steps: [{ type: "apply_tag", tag: "y" }],
    });

    const executionIds = await fireJourneyTrigger(testDb, "novo_cliente", storeA.store.id, customer.id);
    expect(executionIds).toHaveLength(0);
  });
});

describe("processJourneyExecutionsBatch uses each row's own store", () => {
  it("sends WhatsApp and applies tags using the correct store per row when batching across stores", async () => {
    const storeA = await createAccountWithStore("A");
    const storeB = await createAccountWithStore("B");
    const customerA = await createCustomer({ phone: "+5511900000001" });
    const customerB = await createCustomer({ phone: "+5511900000002" });

    const journeyA = randomUUID();
    const journeyB = randomUUID();
    await testDb.insert(journeys).values({
      id: journeyA,
      storeId: storeA.store.id,
      name: "Journey A",
      trigger: "novo_cliente",
      steps: [
        { type: "send_whatsapp", message: "Oi de A" },
        { type: "apply_tag", tag: "contatado" },
      ],
    });
    await testDb.insert(journeys).values({
      id: journeyB,
      storeId: storeB.store.id,
      name: "Journey B",
      trigger: "novo_cliente",
      steps: [
        { type: "send_whatsapp", message: "Oi de B" },
        { type: "apply_tag", tag: "contatado" },
      ],
    });

    const past = new Date(Date.now() - 60_000);
    await testDb.insert(journeyExecutions).values([
      {
        id: randomUUID(),
        storeId: storeA.store.id,
        journeyId: journeyA,
        customerId: customerA.id,
        status: "running",
        currentStep: 0,
        nextStepAt: past,
      },
      {
        id: randomUUID(),
        storeId: storeB.store.id,
        journeyId: journeyB,
        customerId: customerB.id,
        status: "running",
        currentStep: 0,
        nextStepAt: past,
      },
    ]);

    const result = await processJourneyExecutionsBatch(testDb);
    expect(result.processed).toBe(2);
    expect(result.completed).toBe(2);

    // Each customer got the message meant for THEIR store, on their own phone.
    const messageToA = sentWhatsAppLog.find((entry) => entry.phone === customerA.phone);
    const messageToB = sentWhatsAppLog.find((entry) => entry.phone === customerB.phone);
    expect(messageToA?.storeId).toBe(storeA.store.id);
    expect(messageToA?.message).toBe("Oi de A");
    expect(messageToB?.storeId).toBe(storeB.store.id);
    expect(messageToB?.message).toBe("Oi de B");

    // The applied tag landed under the correct store for each customer.
    const tagsA = await testDb.select().from(customerTags).where(eq(customerTags.customerId, customerA.id));
    expect(tagsA).toHaveLength(1);
    expect(tagsA[0]!.storeId).toBe(storeA.store.id);
  });

  it("a wait step defers the execution instead of completing it immediately", async () => {
    const storeA = await createAccountWithStore("A");
    const customer = await createCustomer();
    const journeyId = randomUUID();

    await testDb.insert(journeys).values({
      id: journeyId,
      storeId: storeA.store.id,
      name: "Com espera",
      trigger: "novo_cliente",
      steps: [
        { type: "apply_tag", tag: "primeiro-contato" },
        { type: "wait", hours: 24 },
        { type: "apply_tag", tag: "segundo-contato" },
      ],
    });

    const executionId = randomUUID();
    await testDb.insert(journeyExecutions).values({
      id: executionId,
      storeId: storeA.store.id,
      journeyId,
      customerId: customer.id,
      status: "running",
      currentStep: 0,
      nextStepAt: new Date(Date.now() - 1000),
    });

    const now = new Date();
    const result = await processJourneyExecutionsBatch(testDb, { now });
    expect(result.processed).toBe(1);
    expect(result.completed).toBe(0);

    const [execution] = await testDb.select().from(journeyExecutions).where(eq(journeyExecutions.id, executionId));
    expect(execution!.status).toBe("running");
    expect(execution!.currentStep).toBe(2);
    expect(execution!.nextStepAt.getTime()).toBeGreaterThan(now.getTime());
  });
});

describe("crm.getCustomerDetail is scoped to the resolved store", () => {
  it("never returns orders the customer placed at a different store", async () => {
    const storeA = await createAccountWithStore("A");
    const storeB = await createAccountWithStore("B");
    const customer = await createCustomer();

    await seedOrderForCustomer(storeA.store.id, customer.id, { total: "30.00" });
    await seedOrderForCustomer(storeB.store.id, customer.id, { total: "999.00" });

    const detail = await caller(storeA.adminUser).crm.getCustomerDetail({ customerId: customer.id });

    expect(detail.orders).toHaveLength(1);
    expect(detail.orders[0]!.storeId).toBe(storeA.store.id);
    expect(detail.orders.some((order) => order.total === "999.00")).toBe(false);
  });

  it("reflects the per-store tags only", async () => {
    const storeA = await createAccountWithStore("A");
    const storeB = await createAccountWithStore("B");
    const customer = await createCustomer();

    await seedOrderForCustomer(storeA.store.id, customer.id);
    await seedOrderForCustomer(storeA.store.id, customer.id);
    await seedOrderForCustomer(storeB.store.id, customer.id);

    await computeCustomerTagsForStore(testDb, storeA.store.id, customer.id);
    await computeCustomerTagsForStore(testDb, storeB.store.id, customer.id);

    const detailA = await caller(storeA.adminUser).crm.getCustomerDetail({ customerId: customer.id });
    const detailB = await caller(storeB.adminUser).crm.getCustomerDetail({ customerId: customer.id });

    expect(detailA.tags).toContain("recorrente");
    expect(detailB.tags).toContain("novo");
    expect(detailB.tags).not.toContain("recorrente");
  });
});
