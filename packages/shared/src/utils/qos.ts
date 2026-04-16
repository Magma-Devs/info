/**
 * Compute relay-weighted QoS triple from MV (materialized-view) weighted sums.
 * Returns nulls when weight is 0 (no relays = QoS is undefined).
 *
 * Matches the formula used across the explorer: `qosField = fieldW / weight`.
 * Excellence QoS (`exQos*`) is computed the same way with its own weight.
 */
export function weightedQos(
  syncW: number | null,
  availW: number | null,
  latencyW: number | null,
  weight: number,
): { qosSync: number | null; qosAvailability: number | null; qosLatency: number | null } {
  if (weight <= 0) {
    return { qosSync: null, qosAvailability: null, qosLatency: null };
  }
  return {
    qosSync: (syncW ?? 0) / weight,
    qosAvailability: (availW ?? 0) / weight,
    qosLatency: (latencyW ?? 0) / weight,
  };
}
