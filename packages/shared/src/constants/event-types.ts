/**
 * Infrastructure events that the indexer acknowledges but does not store.
 */
export const IGNORED_EVENT_TYPES = [
  "lava_new_epoch",
  "lava_earliest_epoch",
  "lava_fixated_params_change",
  "lava_fixated_params_clean",
  "lava_param_change",
  "lava_spec_add",
  "lava_spec_refresh",
  "lava_spec_modify",
] as const;
