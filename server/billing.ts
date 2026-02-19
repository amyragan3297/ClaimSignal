import Stripe from "stripe";
import { storage } from "./storage";
import { log } from "./index";

function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export async function createFounderCheckoutSession(
  orgId: string,
  userId: string,
  userEmail: string
): Promise<{ url: string } | { error: string }> {
  const stripe = getStripe();
  if (!stripe) {
    const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const existing = await storage.getBillingAccountByOrg(orgId);
    if (existing) {
      await storage.updateBillingAccount(existing.id, {
        subscriptionStatus: "trialing",
        trialStartDate: new Date(),
        trialEndDate: trialEnd,
      });
    }
    return { error: "Stripe is not configured. Trial activated locally for development." };
  }

  const priceId = process.env.STRIPE_PRICE_FOUNDER;
  if (!priceId) {
    return { error: "Founder price ID not configured" };
  }

  const appUrl = process.env.APP_URL || `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_collection: "always",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/dashboard?checkout=success`,
    cancel_url: `${appUrl}/billing?checkout=canceled`,
    customer_email: userEmail,
    subscription_data: {
      trial_period_days: 14,
      metadata: {
        org_id: orgId,
        user_id: userId,
        plan_type: "founder",
      },
    },
    metadata: {
      org_id: orgId,
      user_id: userId,
      plan_type: "founder",
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
  if (!orgId) {
    log("Checkout session missing org_id metadata", "stripe");
    return;
  }

  const existing = await storage.getBillingAccountByOrg(orgId);
  if (existing) {
    await storage.updateBillingAccount(existing.id, {
      stripeCustomerId: session.customer as string,
      stripeSubscriptionId: session.subscription as string,
      subscriptionStatus: "trialing",
    });
  }

  log(`Checkout complete for org ${orgId}`, "stripe");
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

  const existing = await storage.getBillingAccountByOrg(orgId);
  if (existing) {
    await storage.updateBillingAccount(existing.id, {
      subscriptionStatus: status as any,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: subscription.customer as string,
      trialStartDate: trialStart,
      trialEndDate: trialEnd,
    });
  }

  log(`Subscription updated for org ${orgId}: status=${status}`, "stripe");
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

function mapStripeStatus(stripeStatus: string): string {
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
