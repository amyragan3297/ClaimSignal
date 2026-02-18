import Stripe from "stripe";
import { storage } from "./storage";
import { log } from "./index";

const PRICE_MAP: Record<string, string | undefined> = {
  founder: process.env.STRIPE_PRICE_FOUNDER,
  pro: process.env.STRIPE_PRICE_PRO,
  team: process.env.STRIPE_PRICE_TEAM,
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE,
};

const SEAT_LIMITS: Record<string, number> = {
  founder: 1,
  pro: 1,
  team: 10,
  enterprise: 999,
};

function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export async function createCheckoutSession(
  orgId: string,
  userId: string,
  tier: string,
  userEmail: string
): Promise<{ url: string } | { error: string }> {
  if (!["founder", "pro", "team", "enterprise"].includes(tier)) {
    return { error: "Invalid tier" };
  }

  if (tier === "founder") {
    const founderCount = await storage.getFounderCount();
    if (founderCount >= 3) {
      return { error: "Founder tier is at capacity (3/3). Please select another plan." };
    }
  }

  const stripe = getStripe();
  if (!stripe) {
    const trialEnd = tier === "founder" ? new Date(Date.now() + 12 * 24 * 60 * 60 * 1000) : null;
    const seatLimit = SEAT_LIMITS[tier] || 1;
    const status = tier === "founder" ? "trialing" : "active";

    const existing = await storage.getSubscriptionByOrg(orgId);
    if (existing) {
      await storage.updateSubscription(existing.id, {
        tier: tier as any,
        status: status as any,
        seatLimit,
        trialEnd,
      });
    }
    return { error: "Stripe is not configured. Subscription updated locally for development." };
  }

  const priceId = PRICE_MAP[tier];
  if (!priceId) {
    return { error: `Price ID not configured for tier: ${tier}` };
  }

  const appUrl = process.env.APP_URL || `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/dashboard?success=true`,
    cancel_url: `${appUrl}/billing?canceled=true`,
    customer_email: userEmail,
    metadata: {
      org_id: orgId,
      user_id: userId,
      tier,
    },
  };

  if (tier === "founder") {
    sessionParams.subscription_data = {
      trial_period_days: 12,
      metadata: {
        org_id: orgId,
        tier,
      },
    };
  } else {
    sessionParams.subscription_data = {
      metadata: {
        org_id: orgId,
        tier,
      },
    };
  }

  const session = await stripe.checkout.sessions.create(sessionParams);
  return { url: session.url! };
}

export async function handleWebhookEvent(
  rawBody: Buffer,
  signature: string
): Promise<{ received: boolean; error?: string }> {
  const stripe = getStripe();
  if (!stripe) {
    return { received: false, error: "Stripe not configured" };
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return { received: false, error: "Webhook secret not configured" };
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err: any) {
    log(`Webhook signature verification failed: ${err.message}`, "stripe");
    return { received: false, error: "Signature verification failed" };
  }

  log(`Received Stripe event: ${event.type}`, "stripe");

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutComplete(session);
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      await handleSubscriptionUpdate(subscription);
      break;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await handleSubscriptionDeleted(subscription);
      break;
    }
  }

  return { received: true };
}

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const orgId = session.metadata?.org_id;
  const tier = session.metadata?.tier;
  if (!orgId || !tier) {
    log("Checkout session missing metadata", "stripe");
    return;
  }

  const existing = await storage.getSubscriptionByOrg(orgId);
  const seatLimit = SEAT_LIMITS[tier] || 1;

  if (existing) {
    await storage.updateSubscription(existing.id, {
      tier: tier as any,
      status: "active",
      stripeCustomerId: session.customer as string,
      stripeSubscriptionId: session.subscription as string,
      seatLimit,
    });
  } else {
    await storage.createSubscription({
      orgId,
      tier: tier as any,
      status: "active",
      stripeCustomerId: session.customer as string,
      stripeSubscriptionId: session.subscription as string,
      seatLimit,
    });
  }

  log(`Checkout complete for org ${orgId}, tier: ${tier}`, "stripe");
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const orgId = subscription.metadata?.org_id;
  const tier = subscription.metadata?.tier;
  if (!orgId) {
    log("Subscription update missing org_id metadata", "stripe");
    return;
  }

  const status = mapStripeStatus(subscription.status);
  const trialEnd = subscription.trial_end
    ? new Date(subscription.trial_end * 1000)
    : null;

  const existing = await storage.getSubscriptionByOrg(orgId);
  const seatLimit = SEAT_LIMITS[tier || "pro"] || 1;

  if (existing) {
    await storage.updateSubscription(existing.id, {
      status: status as any,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: subscription.customer as string,
      trialEnd,
      seatLimit,
      ...(tier ? { tier: tier as any } : {}),
    });
  }

  log(`Subscription updated for org ${orgId}: status=${status}, tier=${tier}`, "stripe");
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const orgId = subscription.metadata?.org_id;
  if (!orgId) return;

  const existing = await storage.getSubscriptionByOrg(orgId);
  if (existing) {
    await storage.updateSubscription(existing.id, {
      status: "canceled" as any,
      tier: "pro" as any,
    });
  }

  log(`Subscription canceled for org ${orgId}`, "stripe");
}

function mapStripeStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case "active": return "active";
    case "trialing": return "trialing";
    case "past_due": return "past_due";
    case "canceled":
    case "unpaid":
      return "canceled";
    case "incomplete":
    case "incomplete_expired":
      return "incomplete";
    default: return "active";
  }
}
