export const EVENT_TYPES = {
  StakeNewProvider: "lava_stake_new_provider",
  StakeUpdateProvider: "lava_stake_update_provider",
  ProviderUnstakeCommit: "lava_provider_unstake_commit",
  FreezeProvider: "lava_freeze_provider",
  UnfreezeProvider: "lava_unfreeze_provider",
  ProviderJailed: "lava_provider_jailed",
  ProviderTemporaryJailed: "lava_provider_temporary_jailed",
  RelayPayment: "lava_relay_payment",
  ProviderReported: "lava_provider_reported",
  ProviderLatestBlockReport: "lava_provider_latest_block_report",
  BuySubscription: "lava_buy_subscription_event",
  AddProjectToSubscription: "lava_add_project_to_subscription_event",
  DelProjectToSubscription: "lava_del_project_to_subscription_event",
  ExpireSubscription: "lava_expire_subscription_event",
  SetSubscriptionPolicy: "lava_set_subscription_policy_event",
  AddKeyToProject: "lava_add_key_to_project_event",
  DelKeyFromProject: "lava_del_key_from_project_event",
  ConflictVoteGotCommit: "lava_conflict_vote_got_commit",
  ResponseConflictDetection: "lava_response_conflict_detection",
  ConflictDetectionReceived: "lava_conflict_detection_received",
  ConflictVoteGotReveal: "lava_conflict_vote_got_reveal",
  ConflictVoteRevealStarted: "lava_conflict_vote_reveal_started",
  ConflictDetectionVoteResolved: "lava_conflict_detection_vote_resolved",
  ConflictDetectionVoteUnresolved: "lava_conflict_detection_vote_unresolved",
  DelegateToProvider: "lava_delegate_to_provider",
  UnbondFromProvider: "lava_unbond_from_provider",
  RedelegateBetweenProviders: "lava_redelegate_between_providers",
  DelegatorClaimRewards: "lava_delegator_claim_rewards",
  ValidatorSlash: "lava_validator_slash",
  FreezeFromUnbond: "lava_freeze_from_unbond",
  UnstakeFromUnbond: "lava_unstake_from_unbond",
  ProviderBonusRewards: "lava_provider_bonus_rewards",
  IprpcPoolEmission: "lava_iprpc_pool_emmission",
  DistributionPoolsRefill: "lava_distribution_pools_refill",
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

export interface EventAttribute {
  key: string;
  value: string;
}

export interface BlockchainEvent {
  eventType: EventType | string;
  blockId: number;
  tx: string;
  timestamp: Date;
  provider?: string;
  consumer?: string;
  specId?: string;
  amount?: bigint;
  data?: Record<string, unknown>;
}
