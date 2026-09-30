import { supabaseAdmin } from "../../src/lib/supabaseServer.js";
import type { PlanTier } from "./plans.js";

export type BillingEntitlement = {
  userId: string;
  planTier: PlanTier;
  status: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  priceId: string | null;
  currentPeriodEnd: string | null;
  currentPeriodStart?: string | null;
  billingInterval?: "monthly" | "annual" | null;
  cancelAtPeriodEnd: boolean;
  eventCreatedAt: string | null;
};

function normalizePlanTier(value: unknown): PlanTier {
  return String(value ?? "").trim().toLowerCase() === "pro" ? "pro" : "basic";
}

function isMissingEntitlementsTable(error: any): boolean {
  const code = String(error?.code ?? "");
  return code === "42P01" || code === "PGRST205";
}

function fromRow(userId: string, row: any): BillingEntitlement {
  return {
    userId,
    planTier: normalizePlanTier(row?.plan_tier),
    status: typeof row?.stripe_subscription_status === "string" ? row.stripe_subscription_status : null,
    customerId: typeof row?.stripe_customer_id === "string" ? row.stripe_customer_id : null,
    subscriptionId: typeof row?.stripe_subscription_id === "string" ? row.stripe_subscription_id : null,
    priceId: typeof row?.stripe_price_id === "string" ? row.stripe_price_id : null,
    currentPeriodEnd: typeof row?.stripe_current_period_end === "string" ? row.stripe_current_period_end : null,
    currentPeriodStart: typeof row?.stripe_current_period_start === 'string' ? row.stripe_current_period_start : null,
    billingInterval: row?.stripe_billing_interval === 'annual' || row?.stripe_billing_interval === 'monthly' ? row.stripe_billing_interval : null,
    cancelAtPeriodEnd: row?.stripe_cancel_at_period_end === true,
    eventCreatedAt: typeof row?.stripe_event_created_at === "string" ? row.stripe_event_created_at : null,
  };
}

const BILLING_COLUMNS = "plan_tier, stripe_customer_id, stripe_subscription_id, stripe_subscription_status, stripe_price_id, stripe_current_period_end, stripe_cancel_at_period_end, stripe_event_created_at";

export async function getBillingEntitlement(userId: string): Promise<BillingEntitlement> {
  let result = await supabaseAdmin.from("billing_entitlements")
    .select(BILLING_COLUMNS + ", stripe_current_period_start, stripe_billing_interval")
    .eq("user_id", userId).maybeSingle();

  // A rolling deployment may precede the additive annual-quota migration.
  // Read the same protected table without its new optional fields in that case.
  const code = String(result.error?.code ?? "");
  const message = String(result.error?.message ?? "");
  if (["42703", "PGRST204"].includes(code)
      && /stripe_current_period_start|stripe_billing_interval/.test(message)) {
    result = await supabaseAdmin.from("billing_entitlements")
      .select(BILLING_COLUMNS).eq("user_id", userId).maybeSingle();
  }
  if (!result.error && result.data) return fromRow(userId, result.data);
  // An unavailable database is not evidence of a Free subscription. Callers
  // must return an unavailable state and keep paid actions blocked.
  if (result.error && !isMissingEntitlementsTable(result.error)) throw result.error;

  const legacy = await supabaseAdmin.from("user_profiles")
    .select("plan_tier, stripe_customer_id, stripe_subscription_id, stripe_subscription_status, stripe_price_id, stripe_current_period_end, stripe_cancel_at_period_end")
    .eq("id", userId).maybeSingle();
  if (legacy.error) throw legacy.error;
  return fromRow(userId, legacy.data ?? { plan_tier: "basic" });
}

export async function getServerPlanTier(userId: string): Promise<PlanTier> {
  return (await getBillingEntitlement(userId)).planTier;
}

export async function findUserIdByStripeIds(customerId: string, subscriptionId: string): Promise<string | null> {
  for (const [column, value] of [["stripe_customer_id", customerId], ["stripe_subscription_id", subscriptionId]] as const) {
    const { data, error } = await supabaseAdmin
      .from("billing_entitlements")
      .select("user_id")
      .eq(column, value)
      .maybeSingle();
    if (!error && (data as any)?.user_id) return String((data as any).user_id);
    if (error && !isMissingEntitlementsTable(error)) throw error;
  }

  for (const [column, value] of [["stripe_customer_id", customerId], ["stripe_subscription_id", subscriptionId]] as const) {
    const { data } = await supabaseAdmin.from("user_profiles").select("id").eq(column, value).maybeSingle();
    if ((data as any)?.id) return String((data as any).id);
  }
  return null;
}

export async function saveStripeCustomerId(userId: string, customerId: string): Promise<void> {
  const updatedAt = new Date().toISOString();
  const secureResult = await supabaseAdmin.from("billing_entitlements").upsert({
    user_id: userId,
    stripe_customer_id: customerId,
    updated_at: updatedAt,
  }, { onConflict: "user_id" });
  if (secureResult.error && !isMissingEntitlementsTable(secureResult.error)) throw secureResult.error;

  const legacyResult = await supabaseAdmin.from("user_profiles").upsert({
    id: userId,
    stripe_customer_id: customerId,
    stripe_updated_at: updatedAt,
  }, { onConflict: "id" });
  if (legacyResult.error) throw legacyResult.error;
}

export async function saveStripeSubscription(args: {
  userId: string;
  planTier: PlanTier;
  customerId: string;
  subscriptionId: string;
  status: string;
  priceId: string | null;
  currentPeriodEnd: string | null;
  currentPeriodStart: string | null;
  billingInterval: "monthly" | "annual" | null;
  cancelAtPeriodEnd: boolean;
  eventCreatedAt: string;
}): Promise<void> {
  const current = await getBillingEntitlement(args.userId);
  if (current.eventCreatedAt && Date.parse(current.eventCreatedAt) > Date.parse(args.eventCreatedAt)) return;

  const updatedAt = new Date().toISOString();
  const secureResult = await supabaseAdmin.from("billing_entitlements").upsert({
    user_id: args.userId,
    plan_tier: args.planTier,
    stripe_customer_id: args.customerId,
    stripe_subscription_id: args.subscriptionId,
    stripe_subscription_status: args.status,
    stripe_price_id: args.priceId,
    stripe_current_period_end: args.currentPeriodEnd,
    stripe_cancel_at_period_end: args.cancelAtPeriodEnd,
    stripe_event_created_at: args.eventCreatedAt,
    stripe_current_period_start: args.currentPeriodStart,
    stripe_billing_interval: args.billingInterval,
    updated_at: updatedAt,
  }, { onConflict: "user_id" });
  if (secureResult.error && !isMissingEntitlementsTable(secureResult.error)) throw secureResult.error;

  const legacyResult = await supabaseAdmin.from("user_profiles").upsert({
    id: args.userId,
    plan_tier: args.planTier,
    stripe_customer_id: args.customerId,
    stripe_subscription_id: args.subscriptionId,
    stripe_subscription_status: args.status,
    stripe_price_id: args.priceId,
    stripe_current_period_end: args.currentPeriodEnd,
    stripe_cancel_at_period_end: args.cancelAtPeriodEnd,
    stripe_updated_at: updatedAt,
  }, { onConflict: "id" });
  if (legacyResult.error) throw legacyResult.error;
}

