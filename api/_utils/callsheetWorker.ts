import { getPlanLimits } from "./plans.js";

export const CALLSHEET_WORKER_FETCH_LIMIT = 16;
export const CALLSHEET_PARALLEL_BATCH_SIZE = getPlanLimits("pro").maxCallsheetsPerWorkerRun;

type JobWithUser = {
  user_id?: string | null;
};

export function getCallsheetWorkerFetchLimit(args: {
  manual: boolean;
  manualJobId?: string | null;
}): number {
  if (!args.manual) return CALLSHEET_WORKER_FETCH_LIMIT;
  return args.manualJobId ? 1 : CALLSHEET_PARALLEL_BATCH_SIZE;
}

export function shouldSelfTriggerCallsheetBatch(args: {
  manual: boolean;
  manualJobId?: string | null;
  manualUserId?: string | null;
}): boolean {
  if (!args.manual) return true;
  return !args.manualJobId && Boolean(String(args.manualUserId ?? "").trim());
}

export function limitCallsheetJobsByPlan<T extends JobWithUser>(args: {
  jobs: T[];
  planTierByUserId: ReadonlyMap<string, string | null | undefined>;
}): T[] {
  const jobsByUser = new Map<string, T[]>();

  for (const job of args.jobs) {
    const userId = String(job.user_id ?? "").trim();
    if (!userId) continue;
    if (!jobsByUser.has(userId)) jobsByUser.set(userId, []);
    jobsByUser.get(userId)!.push(job);
  }

  const limitedJobs: T[] = [];
  for (const [userId, userJobs] of jobsByUser) {
    const limits = getPlanLimits(args.planTierByUserId.get(userId));
    limitedJobs.push(...userJobs.slice(0, limits.maxCallsheetsPerWorkerRun));
  }

  return limitedJobs;
}

export async function runWithConcurrencyLimit<T>(args: {
  items: readonly T[];
  concurrency: number;
  worker: (item: T, index: number) => Promise<void>;
}): Promise<void> {
  const { items, worker } = args;
  if (items.length === 0) return;

  const concurrency = Math.max(1, Math.floor(args.concurrency) || 1);
  let nextIndex = 0;

  const consume = async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) return;
      await worker(items[currentIndex], currentIndex);
    }
  };

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => consume());
  await Promise.all(runners);
}
