import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { caller, closeDb, resetDb } from "./helpers.js";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await closeDb();
});

describe("auth.signup", () => {
  it("creates an account, its first store, and an admin user, returning a session token", async () => {
    const anon = caller(null);
    const result = await anon.auth.signup({
      accountName: "Pizzaria do Zé",
      storeName: "Pizzaria do Zé - Centro",
      adminName: "Zé da Silva",
      email: "ze@example.com",
      password: "supersecret123",
    });

    expect(result.token).toBeTruthy();
    expect(result.user.role).toBe("admin");
    expect(result.account.name).toBe("Pizzaria do Zé");
    expect(result.store.name).toBe("Pizzaria do Zé - Centro");
    expect(result.user.accountId).toBe(result.account.id);
  });

  it("rejects a second signup with the same email", async () => {
    const anon = caller(null);
    await anon.auth.signup({
      accountName: "Conta 1",
      storeName: "Loja 1",
      adminName: "Dono 1",
      email: "dup@example.com",
      password: "supersecret123",
    });

    await expect(
      anon.auth.signup({
        accountName: "Conta 2",
        storeName: "Loja 2",
        adminName: "Dono 2",
        email: "dup@example.com",
        password: "anotherpassword",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("auth.login", () => {
  it("logs in with correct credentials and rejects wrong password", async () => {
    const anon = caller(null);
    await anon.auth.signup({
      accountName: "Conta Login",
      storeName: "Loja Login",
      adminName: "Dono Login",
      email: "login@example.com",
      password: "correcthorsebattery",
    });

    const result = await anon.auth.login({
      email: "login@example.com",
      password: "correcthorsebattery",
    });
    expect(result.token).toBeTruthy();
    expect(result.user.email).toBe("login@example.com");

    await expect(
      anon.auth.login({ email: "login@example.com", password: "wrongpassword" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    await expect(
      anon.auth.login({ email: "nobody@example.com", password: "whatever" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
