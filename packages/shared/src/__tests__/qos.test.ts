import { describe, it, expect } from "vitest";
import { weightedQos } from "../utils/qos.js";

describe("weightedQos", () => {
  it("returns all nulls when weight is 0", () => {
    expect(weightedQos(100, 50, 10, 0)).toEqual({
      qosSync: null,
      qosAvailability: null,
      qosLatency: null,
    });
  });

  it("returns all nulls when weight is negative", () => {
    expect(weightedQos(100, 50, 10, -1)).toEqual({
      qosSync: null,
      qosAvailability: null,
      qosLatency: null,
    });
  });

  it("divides weighted sums by the weight", () => {
    expect(weightedQos(500, 200, 50, 10)).toEqual({
      qosSync: 50,
      qosAvailability: 20,
      qosLatency: 5,
    });
  });

  it("treats null component sums as 0", () => {
    expect(weightedQos(null, null, null, 10)).toEqual({
      qosSync: 0,
      qosAvailability: 0,
      qosLatency: 0,
    });
  });
});
