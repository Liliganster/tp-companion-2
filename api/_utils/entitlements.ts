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
  cancelAtPeriodEnd: boolean;
  eventCreatedAt: string | null;
};

function normalizePlanTier(value: unknown): PlanTier {
  return String(value ?? "").trim().toLowerCase() === "pro" ? "pro" : "basic";
}

function isMissingEntitlementsTable(error: any): boolean {
  const code = String(error?.code ?? "");
  const message = String(error?.message ?? "").toLowerCase();
  return code === "42P01" || code === "PGRST205" || message.includes("billing_entitlements");
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
    cancelAtPeriodEnd: row?.stripe_cancel_at_period_end === true,
    eventCreatedAt: typeof row?.stripe_event_created_at === "string" ? row.stripe_event_created_at : null,
  };
}

export async function getBillingEntitlement(userId: string): Promise<BillingEntitlement> {
  const { data, error } = await supabaseAdmin
    .from("billing_entitlements")
    .select("plan_tier, stripe_customer_id, stripe_subscription_id, stripe_subscription_status, stripe_price_id, stripe_current_period_end, stripe_cancel_at_period_end, stripe_event_created_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (!error && data) return fromRow(userId, data);

  // Compatibilidad durante el despliegue: antes de aplicar la migración, la
  // tabla legacy sigue protegida por el trigger de billing.
  if (error && !isMissingEntitlementsTable(error)) {
    console.error("[entitlements] secure table lookup failed; failing closed to basic", error.message);
    return fromRow(userId, { plan_tier: "basic" });
  }

  const { data: legacy } = await supabaseAdmin
    .from("user_profiles")
    .select("plan_tier, stripe_customer_id, stripe_subscription_id, stripe_subscription_status, stripe_price_id, stripe_current_period_end, stripe_cancel_at_period_end")
    .eq("id", userId)
    .maybeSingle();
  return fromRow(userId, legacy ?? { plan_tier: "basic" });
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

