import type { Database } from "../db/client.js";
import { processJourneyExecutionsBatch, recomputeAllCustomerTags } from "./engine.js";

const EXECUTIONS_INTERVAL_MS = 60_000; // check for due journey steps every minute
const TAGS_INTERVAL_MS = 15 * 60_000; // recompute customer tags every 15 minutes

/**
 * Starts the two background loops backing this phase's automations.
 * Deliberately NOT called from anywhere tests import — tests call
 * `processJourneyExecutionsBatch`/`recomputeAllCustomerTags` directly
 * with a controlled `now`, so behavior never depends on real wall-clock
 * timing. Call this once from the server entry point in production.
 */
export function startAutomationScheduler(db: Database): { stop: () => void } {
  const executionsTimer = setInterval(() => {
    processJourneyExecutionsBatch(db).catch((err) => {
      console.error("[automations] failed to process journey executions", err);
    });
  }, EXECUTIONS_INTERVAL_MS);

  const tagsTimer = setInterval(() => {
    recomputeAllCustomerTags(db).catch((err) => {
      console.error("[automations] failed to recompute customer tags", err);
    });
  }, TAGS_INTERVAL_MS);

  // Don't hold the process open just for these timers (relevant for scripts/tests
  // that might import this module without ever calling start).
  executionsTimer.unref?.();
  tagsTimer.unref?.();

  return {
    stop: () => {
      clearInterval(executionsTimer);
      clearInterval(tagsTimer);
    },
  };
}
