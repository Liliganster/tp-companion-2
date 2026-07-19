import Stripe from "stripe";

let stripeClient: Stripe | null = null;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export function getStripeClient(): Stripe {
  if (!stripeClient) stripeClient = new Stripe(requiredEnv("STRIPE_SECRET_KEY"));
  return stripeClient;
}

export function getStripeWebhookSecret(): string {
  return requiredEnv("STRIPE_WEBHOOK_SECRET");
}

export function getStripePriceId(billing: "monthly" | "annual"): string {
  return requiredEnv(billing === "monthly" ? "STRIPE_PRICE_PRO_MONTHLY" : "STRIPE_PRICE_PRO_ANNUAL");
}

export function getAllowedStripePriceIds(): ReadonlySet<string> {
  return new Set([
    requiredEnv("STRIPE_PRICE_PRO_MONTHLY"),
    requiredEnv("STRIPE_PRICE_PRO_ANNUAL"),
  ]);
}

export function getPublicAppUrl(): string {
  const value = process.env.APP_URL?.trim() || "https://dashboard.fahrtenbuchpro.com";
  const url = new URL(value);
  if (url.protocol !== "https:" && url.hostname !== "localhost") throw new Error("APP_URL must use HTTPS");
  return url.origin;
}

