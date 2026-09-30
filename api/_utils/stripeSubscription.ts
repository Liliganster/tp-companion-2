import type Stripe from "stripe";

const PRO_ACCESS_STATUSES = new Set<Stripe.Subscription.Status>(["active", "trialing", "past_due"]);

export function getSubscriptionPriceId(subscription: Stripe.Subscription): string | null {
  return subscription.items.data[0]?.price?.id ?? null;
}

export function getSubscriptionPeriodEnd(subscription: Stripe.Subscription): string | null {
  const timestamps = subscription.items.data
    .map((item) => item.current_period_end)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps) * 1000).toISOString();
}

/** Use the same subscription item as the price that grants Pro. */
export function getSubscriptionQuotaPeriod(subscription: Stripe.Subscription): { billingInterval: "monthly" | "annual" | null; currentPeriodStart: string | null; currentPeriodEnd: string | null } {
  const item = subscription.items.data[0];
  const recurring = item?.price?.recurring;
  const billingInterval = recurring?.interval_count === 1
    ? recurring.interval === 'year' ? 'annual' : recurring.interval === 'month' ? 'monthly' : null
    : null;
  const iso = (value: unknown) => typeof value === 'number' && Number.isFinite(value)
    ? new Date(value * 1000).toISOString() : null;
  return { billingInterval, currentPeriodStart: iso(item?.current_period_start), currentPeriodEnd: iso(item?.current_period_end) };
}

export function getSubscriptionCustomerId(subscription: Stripe.Subscription): string {
  return typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
}

export function getSubscriptionUserId(subscription: Stripe.Subscription): string | null {
  const value = subscription.metadata?.user_id?.trim();
  return value || null;
}

export function getPlanTierForSubscription(
  subscription: Stripe.Subscription,
  allowedProPriceIds: ReadonlySet<string>,
): "basic" | "pro" {
  const priceId = getSubscriptionPriceId(subscription);
  return priceId && allowedProPriceIds.has(priceId) && PRO_ACCESS_STATUSES.has(subscription.status)
    ? "pro"
    : "basic";
}

