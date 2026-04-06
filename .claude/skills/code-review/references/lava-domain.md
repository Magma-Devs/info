# Lava Domain Review Reference

Quick reference for domain-specific review rules. Agents should consult this when unsure about Lava-specific conventions.

## Critical rules (violations = CRITICAL/ERROR)

| Rule | Wrong | Right |
|------|-------|-------|
| Token amounts | `Number(amount)` | `BigInt(amount)` |
| Commission | `commission * 100` | `commission` (already %) |
| Relay aggregates | `query { relayPayments { ... } }` | `query { mvRelayDailies { ... } }` |
| MV date filter | `filter: { date: { gte: "2024-01-01T00:00:00Z" } }` | `filter: { date: { greaterThanOrEqualTo: "2024-01-01" } }` |
| QoS computation | `avg(qosSync)` | `sum(qosSyncW) / sum(qosWeight)` |
| Consumer filter | `consumer: { isNull: false }` | `consumer: { notEqualTo: "" }` |
| GraphQL variables | `` `query { x(id: "${id}") }` `` | `query($id: String!) { x(id: $id) }` |

## Warning rules (violations = WARNING)

| Rule | Details |
|------|---------|
| Base specs in UI | COSMOSSDK, COSMOSSDK50, COSMOSWASM, ETHERMINT, TENDERMINT, IBC must be filtered out |
| Geolocation | Bitmask, not enum. Use bitwise ops for multi-region |
| RPC batching | Provider queries must batch in groups of 5 specs |
| Cache TTL | health=10-30s, lists=60-300s, supply=300s, avatars=86400s |
| React hooks | All hooks before conditional returns |
| Tailwind | Semantic tokens only (text-foreground, bg-card), no inline styles |
| Table columns | Every column needs `accessorFn`, BigInt cols need `Number()` wrapper |

## Token amounts cheat sheet

```
Chain returns: "50000000000" (ulava string)
Storage: BigInt("50000000000")
Arithmetic: BigInt(a) + BigInt(b) — never Number()
Display: (Number(amount) / 1_000_000).toLocaleString() + " LAVA"
```

## Reward pools (circulating supply)

Exactly 5 pools subtracted:
1. validators_rewards_distribution_pool
2. validators_rewards_allocation_pool
3. providers_rewards_distribution_pool
4. providers_rewards_allocation_pool
5. iprpc_pool
