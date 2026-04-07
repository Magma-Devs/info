import { describe, it, expect } from "vitest";
import {
  PROVIDER_STATUS,
  HEALTH_STATUS,
  EVENT_TYPES,
  type ProviderStatus,
  type HealthStatus,
  type EventType,
  type PaginatedResponse,
  type PaginationParams,
  type ApiError,
  type HealthCheckResult,
  type BlockchainEvent,
} from "../index.js";
import { IGNORED_EVENT_TYPES } from "../constants/event-types.js";

describe("PROVIDER_STATUS", () => {
  it("has all required statuses", () => {
    expect(PROVIDER_STATUS.Active).toBe("Active");
    expect(PROVIDER_STATUS.Frozen).toBe("Frozen");
    expect(PROVIDER_STATUS.Unstaking).toBe("Unstaking");
    expect(PROVIDER_STATUS.Inactive).toBe("Inactive");
    expect(PROVIDER_STATUS.Jailed).toBe("Jailed");
  });

  it("is exhaustive (5 values)", () => {
    expect(Object.keys(PROVIDER_STATUS)).toHaveLength(5);
  });
});

describe("HEALTH_STATUS", () => {
  it("has all required statuses", () => {
    expect(HEALTH_STATUS.Healthy).toBe("healthy");
    expect(HEALTH_STATUS.Unhealthy).toBe("unhealthy");
    expect(HEALTH_STATUS.Frozen).toBe("frozen");
    expect(HEALTH_STATUS.Jailed).toBe("jailed");
  });
});

describe("EVENT_TYPES", () => {
  it("has all major event types", () => {
    expect(EVENT_TYPES.StakeNewProvider).toBe("lava_stake_new_provider");
    expect(EVENT_TYPES.RelayPayment).toBe("lava_relay_payment");
    expect(EVENT_TYPES.DelegateToProvider).toBe("lava_delegate_to_provider");
    expect(EVENT_TYPES.ConflictVoteGotCommit).toBe("lava_conflict_vote_got_commit");
    expect(EVENT_TYPES.BuySubscription).toBe("lava_buy_subscription_event");
    expect(EVENT_TYPES.ProviderBonusRewards).toBe("lava_provider_bonus_rewards");
    expect(EVENT_TYPES.ProviderReported).toBe("lava_provider_reported");
    expect(EVENT_TYPES.ProviderLatestBlockReport).toBe("lava_provider_latest_block_report");
    expect(EVENT_TYPES.AddKeyToProject).toBe("lava_add_key_to_project_event");
    expect(EVENT_TYPES.IprpcPoolEmission).toBe("lava_iprpc_pool_emmission");
  });

  it("all event type values start with lava_", () => {
    for (const value of Object.values(EVENT_TYPES)) {
      expect(value).toMatch(/^lava_/);
    }
  });

  it("has 30+ event types defined", () => {
    expect(Object.keys(EVENT_TYPES).length).toBeGreaterThanOrEqual(30);
  });
});

describe("IGNORED_EVENT_TYPES", () => {
  it("contains infrastructure events", () => {
    expect(IGNORED_EVENT_TYPES).toContain("lava_new_epoch");
    expect(IGNORED_EVENT_TYPES).toContain("lava_earliest_epoch");
    expect(IGNORED_EVENT_TYPES).toContain("lava_spec_add");
    expect(IGNORED_EVENT_TYPES).toContain("lava_param_change");
  });

  it("does NOT contain data events", () => {
    expect(IGNORED_EVENT_TYPES).not.toContain("lava_relay_payment");
    expect(IGNORED_EVENT_TYPES).not.toContain("lava_stake_new_provider");
  });
});

describe("type shapes (compile-time verification via runtime construction)", () => {
  it("PaginatedResponse shape", () => {
    const resp: PaginatedResponse<{ id: number }> = {
      data: [{ id: 1 }],
      pagination: { total: 1, page: 1, limit: 20, pages: 1 },
    };
    expect(resp.data).toHaveLength(1);
    expect(resp.pagination.total).toBe(1);
  });

  it("PaginationParams shape", () => {
    const params: PaginationParams = { page: 1, limit: 20, sort: "name", order: "asc" };
    expect(params.page).toBe(1);
  });

  it("ApiError shape", () => {
    const err: ApiError = { error: "NotFound", message: "Not found", statusCode: 404 };
    expect(err.statusCode).toBe(404);
  });

  it("HealthCheckResult shape", () => {
    const result: HealthCheckResult = {
      provider: "lava@test",
      spec: "ETH1",
      apiInterface: "jsonrpc",
      status: "healthy",
      block: 100,
      latency: 50,
    };
    expect(result.status).toBe("healthy");
  });

  it("BlockchainEvent shape", () => {
    const evt: BlockchainEvent = {
      eventType: "lava_relay_payment",
      blockId: 100,
      tx: "hash",
      timestamp: new Date(),
      provider: "lava@test",
      data: { key: "value" },
    };
    expect(evt.eventType).toBe("lava_relay_payment");
  });
});
