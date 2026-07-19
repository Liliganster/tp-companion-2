import { describe, expect, it } from "vitest";
import {
  getPlanTierForSubscription,
  getSubscriptionCustomerId,
  getSubscriptionPeriodEnd,
  getSubscriptionPriceId,
  getSubscriptionUserId,
} from "./stripeSubscription";

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_test",
    customer: "cus_test",
    status: "active",
    cancel_at_period_end: false,
    metadata: { user_id: "user-test" },
    items: {
      data: [{ price: { id: "price_monthly" }, current_period_end: 1_800_000_000 }],
    },
    ...overrides,
  } as any;
}

describe("Stripe subscription adapters", () => {
  it("extracts billing identifiers and the latest item period", () => {
    const value = subscription({
      items: { data: [
        { price: { id: "price_monthly" }, current_period_end: 1_800_000_000 },
        { price: { id: "price_other" }, current_period_end: 1_800_000_100 },
      ] },
    });
    expect(getSubscriptionPriceId(value)).toBe("price_monthly");
    expect(getSubscriptionPeriodEnd(value)).toBe(new Date(1_800_000_100 * 1000).toISOString());
    expect(getSubscriptionCustomerId(value)).toBe("cus_test");
    expect(getSubscriptionUserId(value)).toBe("user-test");
  });

  it("grants Pro only for configured prices and eligible statuses", () => {
    const prices = new Set(["price_monthly", "price_annual"]);
    expect(getPlanTierForSubscription(subscription(), prices)).toBe("pro");
    expect(getPlanTierForSubscription(subscription({ status: "past_due" }), prices)).toBe("pro");
    expect(getPlanTierForSubscription(subscription({ status: "canceled" }), prices)).toBe("basic");
    expect(getPlanTierForSubscription(subscription({
      items: { data: [{ price: { id: "price_unknown" }, current_period_end: 1_800_000_000 }] },
    }), prices)).toBe("basic");
  });
});

