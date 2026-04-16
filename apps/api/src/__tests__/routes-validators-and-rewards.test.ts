import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { errorHandlerPlugin } from "../plugins/error-handler.js";

vi.mock("../rpc/lava.js", () => ({
  fetchValidatorsWithRewards: vi.fn(),
}));

const { fetchValidatorsWithRewards } = await import("../rpc/lava.js");
const { validatorsAndRewardsRoutes } = await import("../routes/validators-and-rewards.js");

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(errorHandlerPlugin);
  await app.register(validatorsAndRewardsRoutes);
  return app;
}

const EMPTY_BREAKDOWN = { tokens: [], total_usd: 0 };

const MOCK_VALIDATORS = {
  height: 1_234_567,
  datetime: 1_700_000_000,
  validators: [
    {
      address: "lava@valoper1abc",
      moniker: "Validator One",
      jailed: false,
      tokens: "5000000000",
      commission: {
        commission_rates: { rate: "0.05", max_rate: "0.20", max_change_rate: "0.01" },
        update_time: "2024-01-01T00:00:00Z",
      },
      distribution: {
        self_bond_rewards: EMPTY_BREAKDOWN,
        commission: EMPTY_BREAKDOWN,
        operator_address: "lava@valoper1abc",
      },
      outstanding_rewards: EMPTY_BREAKDOWN,
      estimated_rewards: EMPTY_BREAKDOWN,
      delegations: { delegation_responses: [], pagination: { next_key: null, total: "0" } },
      unbonding_delegations: { unbonding_responses: [], pagination: { next_key: null, total: "0" } },
    },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  (fetchValidatorsWithRewards as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_VALIDATORS);
});

describe("GET /validators-and-rewards", () => {
  it("returns jsinfo-shape response with { data: { height, datetime, validators: [] } }", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/validators-and-rewards",
    });
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body);
    expect(body.data).toBeDefined();
    expect(body.data.height).toBe(1_234_567);
    expect(body.data.datetime).toBe(1_700_000_000);
    expect(body.data.validators).toHaveLength(1);

    const v = body.data.validators[0];
    expect(v.address).toBe("lava@valoper1abc");
    expect(v.moniker).toBe("Validator One");
    expect(v.jailed).toBe(false);
    expect(v.tokens).toBe("5000000000");
    expect(v.commission.commission_rates.rate).toBe("0.05");
    expect(v.distribution).toBeDefined();
    expect(v.outstanding_rewards).toBeDefined();
    expect(v.estimated_rewards).toBeDefined();
    expect(v.delegations.delegation_responses).toEqual([]);
    expect(v.unbonding_delegations.unbonding_responses).toEqual([]);
  });

  it("returns empty validators array when fetch returns no validators", async () => {
    (fetchValidatorsWithRewards as ReturnType<typeof vi.fn>).mockResolvedValue({
      height: 100, datetime: 123, validators: [],
    });
    const app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/validators-and-rewards" });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.validators).toEqual([]);
  });
});
