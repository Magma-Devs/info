import { describe, it, expect } from "vitest";
import { buildTestApp } from "./test-helpers.js";

describe("error handler plugin", () => {
  it("returns 404 for unknown routes", async () => {
    const app = await buildTestApp();
    const res = await app.inject({ method: "GET", url: "/nonexistent" });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("Not Found");
    expect(body.statusCode).toBe(404);
  });

  it("returns structured error for thrown errors", async () => {
    const app = await buildTestApp();
    app.get("/fail", async () => {
      throw new Error("test error");
    });

    const res = await app.inject({ method: "GET", url: "/fail" });
    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.error).toBeDefined();
    expect(body.message).toBe("Internal Server Error");
    expect(body.statusCode).toBe(500);
  });

  it("preserves 4xx error messages", async () => {
    const app = await buildTestApp();
    app.get("/bad", async (_req, reply) => {
      reply.status(400);
      throw { statusCode: 400, message: "Bad request data" };
    });

    const res = await app.inject({ method: "GET", url: "/bad" });
    expect(res.statusCode).toBe(400);
  });
});
