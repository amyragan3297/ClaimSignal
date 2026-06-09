import Stripe from "stripe";
import type { BillingAccount } from "@shared/schema";
import { storage } from "./storage";
import { log } from "./index";

function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

async function getFounderCount(): Promise<number> {
  return storage.getFounderSubscriptionCount();
}

export async function createCheckoutSession(
  orgId: string,
  userId: string,
  userEmail: string,
  planType: string,
  extraSeats?: number
): Promise<{ url: string } | { error: string }> {
  if (planType === "founder") {
    const founderCount = await getFounderCount();
    if (founderCount >= 100) {
      return { error: "Founder tier unavailable - all spots are taken" };
    }
  }

  const stripe = getStripe();
  if (!stripe) {
    const existing = await storage.getBillingAccountByOrg(orgId);
    if (existing) {
      if (planType === "founder") {
        const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
        await storage.updateBillingAccount(existing.id, {
          subscriptionStatus: "trialing",
          planType: planType as BillingAccount["planType"],
          trialStartDate: new Date(),
          trialEndDate: trialEnd,
        });
      } else {
        await storage.updateBillingAccount(existing.id, {
          subscriptionStatus: "active",
          planType: planType as BillingAccount["planType"],
        });
      }
    }
    return { error: "Stripe is not configured. Trial activated locally for development." };
  }

  const priceEnvMap: Record<string, string | undefined> = {
    founder: process.env.STRIPE_PRICE_FOUNDER,
    individual: process.env.STRIPE_PRICE_INDIVIDUAL,
    pro: process.env.STRIPE_PRICE_INDIVIDUAL,
    team: process.env.STRIPE_PRICE_TEAM,
    enterprise: undefined,
  };

  const priceId = priceEnvMap[planType];
  if (!priceId) {
    return { error: `${planType} price ID not configured` };
  }

  const appUrl = process.env.APP_URL || `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;

  const subscriptionData: Stripe.Checkout.SessionCreateParams.SubscriptionData = {
    metadata: {
      org_id: orgId,
      user_id: userId,
      plan_type: planType,
    },
  };

  if (planType === "founder") {
    subscriptionData.trial_period_days = 14;
  }

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    { price: priceId, quantity: 1 },
  ];

  const extraSeatPriceId = process.env.STRIPE_PRICE_EXTRA_SEAT;
  const extraSeatCount = planType === "team" && extraSeats && extraSeatPriceId ? Math.max(0, extraSeats) : 0;
  if (extraSeatCount > 0 && extraSeatPriceId) {
    lineItems.push({ price: extraSeatPriceId, quantity: extraSeatCount });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_collection: "always",
    line_items: lineItems,
    success_url: `${appUrl}/dashboard?checkout=success`,
    cancel_url: `${appUrl}/billing?checkout=canceled`,
    customer_email: userEmail,
    subscription_data: subscriptionData,
    metadata: {
      org_id: orgId,
      user_id: userId,
      plan_type: planType,
    },
  });

  return { url: session.url! };
}

export async function handleWebhookEvent(
  rawBody: Buffer,
  signature: string
): Promise<{ received: boolean; error?: string }> {
  const stripe = getStripe();
  if (!stripe) return { received: false, error: "Stripe not configured" };

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) return { received: false, error: "Webhook secret not configured" };

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    log(`Webhook signature verification failed: ${(err as Error).message}`, "stripe");
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
    case "invoice.payment_failed": {
      const invoice = event.data.object as unknown as Record<string, unknown>;
      await handlePaymentFailed(invoice);
      break;
    }
  }

  return { received: true };
}

async function handleCheckoutComplete(session: Stripe.Checkout.Session) {
  const orgId = session.metadata?.org_id;
  if (!orgId) {
    log("Checkout session missing org_id metadata", "stripe");
    return;
  }

  const planType = session.metadata?.plan_type;

  const existing = await storage.getBillingAccountByOrg(orgId);
  if (existing) {
    const updateData: Partial<BillingAccount> = {
      stripeCustomerId: session.customer as string,
      stripeSubscriptionId: session.subscription as string,
      subscriptionStatus: planType === "founder" ? "trialing" : "active",
    };
    if (planType) {
      updateData.planType = planType as BillingAccount["planType"];
    }
    await storage.updateBillingAccount(existing.id, updateData);
  }

  log(`Checkout complete for org ${orgId}, plan=${planType}`, "stripe");
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const orgId = subscription.metadata?.org_id;
  if (!orgId) {
    log("Subscription update missing org_id metadata", "stripe");
    return;
  }

  const status = mapStripeStatus(subscription.status);
  const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;
  const trialStart = subscription.trial_start ? new Date(subscription.trial_start * 1000) : null;

  const planType = subscription.metadata?.plan_type;

  const existing = await storage.getBillingAccountByOrg(orgId);
  if (existing) {
    const updateData: Partial<BillingAccount> = {
      subscriptionStatus: status as BillingAccount["subscriptionStatus"],
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: subscription.customer as string,
      trialStartDate: trialStart,
      trialEndDate: trialEnd,
    };
    if (planType) {
      updateData.planType = planType as BillingAccount["planType"];
    }
    await storage.updateBillingAccount(existing.id, updateData);
  }

  log(`Subscription updated for org ${orgId}: status=${status}, plan=${planType}`, "stripe");
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const orgId = subscription.metadata?.org_id;
  if (!orgId) return;

  const existing = await storage.getBillingAccountByOrg(orgId);
  if (existing) {
    await storage.updateBillingAccount(existing.id, {
      subscriptionStatus: "canceled",
    });
  }

  log(`Subscription canceled for org ${orgId}`, "stripe");
}

async function handlePaymentFailed(invoice: Record<string, unknown>) {
  const sub = invoice.subscription as string | { id: string } | null | undefined;
  const subscriptionId = typeof sub === "string" ? sub : sub?.id;
  if (!subscriptionId) return;

  const stripe = getStripe();
  if (!stripe) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const orgId = subscription.metadata?.org_id;
  if (!orgId) {
    log("Payment failed invoice missing org_id in subscription metadata", "stripe");
    return;
  }

  const existing = await storage.getBillingAccountByOrg(orgId);
  if (existing) {
    await storage.updateBillingAccount(existing.id, {
      subscriptionStatus: "past_due",
    });
  }

  log(`Payment failed for org ${orgId}, subscription ${subscriptionId}`, "stripe");
}

function mapStripeStatus(stripeStatus: string): BillingAccount["subscriptionStatus"] {
  switch (stripeStatus) {
    case "active": return "active";
    case "trialing": return "trialing";
    case "past_due": return "past_due";
    case "canceled":
    case "unpaid":
      return "canceled";
    default: return "active";
  }
}
