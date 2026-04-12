import { describe, it, expect } from "vitest";
import { buildTestApp } from "./test-helpers.js";
import { parsePagination } from "../plugins/pagination.js";

describe("pagination plugin", () => {
  it("parses default values", () => {
    const p = parsePagination({});
    expect(p.page).toBe(1);
    expect(p.limit).toBe(20);
    expect(p.offset).toBe(0);
    expect(p.sort).toBeNull();
    expect(p.order).toBe("asc");
  });

  it("parses custom values", () => {
    const p = parsePagination({ page: "3", limit: "50", sort: "name", order: "desc" });
    expect(p.page).toBe(3);
    expect(p.limit).toBe(50);
    expect(p.offset).toBe(100);
    expect(p.sort).toBe("name");
    expect(p.order).toBe("desc");
  });

  it("clamps page to 1-4000", () => {
    expect(parsePagination({ page: "0" }).page).toBe(1);
    expect(parsePagination({ page: "-5" }).page).toBe(1);
    expect(parsePagination({ page: "5000" }).page).toBe(4000);
  });

  it("clamps limit to 1-100", () => {
    expect(parsePagination({ limit: "0" }).limit).toBe(20); // 0 is falsy → falls to default 20
    expect(parsePagination({ limit: "200" }).limit).toBe(100);
    expect(parsePagination({ limit: "-1" }).limit).toBe(1);
    expect(parsePagination({ limit: "1" }).limit).toBe(1);
    expect(parsePagination({ limit: "100" }).limit).toBe(100);
  });

  it("defaults order to asc for invalid values", () => {
    expect(parsePagination({ order: "invalid" }).order).toBe("asc");
    expect(parsePagination({ order: "" }).order).toBe("asc");
  });

  it("handles NaN gracefully", () => {
    const p = parsePagination({ page: "abc", limit: "xyz" });
    expect(p.page).toBe(1);
    expect(p.limit).toBe(20);
  });

  it("calculates offset correctly", () => {
    expect(parsePagination({ page: "1", limit: "10" }).offset).toBe(0);
    expect(parsePagination({ page: "2", limit: "10" }).offset).toBe(10);
    expect(parsePagination({ page: "5", limit: "25" }).offset).toBe(100);
  });
});

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
