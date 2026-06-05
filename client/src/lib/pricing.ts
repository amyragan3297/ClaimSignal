export const PLANS = {
  founder: {
    id: "founder" as const,
    name: "Founding Partner",
    price: 79,
    priceLabel: "$79/mo",
    description: "14-day free trial. Card required.",
    badge: "Locked for Life",
    trial: true,
    trialDays: 14,
    seats: 1,
    features: [
      "Founding Partner access — permanently locked pricing",
      "14-day free trial (card required)",
      "Full unmasked data access (with signed agreement)",
      "Early access to new features",
      "Roadmap collaboration & advisory input",
    ],
    ctaLabel: "Start 14-Day Free Trial",
    note: "14-day free trial. Payment method required.",
    availability: "Limited — invitation only",
  },
  individual: {
    id: "individual" as const,
    name: "Individual",
    price: 99,
    priceLabel: "$99/mo",
    description: "Immediate access. No trial period.",
    badge: null,
    trial: false,
    trialDays: 0,
    seats: 1,
    features: [
      "Full platform access",
      "Claim & evidence management",
      "AI extraction & scoring",
      "Adjuster intelligence",
      "Immediate access — no trial",
    ],
    ctaLabel: "Get Started",
    note: "Immediate access. No trial period.",
    availability: null,
  },
  team: {
    id: "team" as const,
    name: "Team",
    price: 299,
    priceLabel: "$299/mo",
    description: "Includes 5 users. +$25/user/month for additional seats.",
    badge: null,
    trial: false,
    trialDays: 0,
    seats: 5,
    extraSeatPrice: 25,
    features: [
      "Everything in Individual",
      "5 users included",
      "+$25/user/month for additional seats",
      "Team-level reporting",
      "Immediate access — no trial",
    ],
    ctaLabel: "Get Started",
    note: "Includes 5 users. Additional seats $25/user/month.",
    availability: null,
  },
  enterprise: {
    id: "enterprise" as const,
    name: "Enterprise",
    price: null,
    priceLabel: "Contact Sales",
    description: "Custom pricing for large organizations.",
    badge: null,
    trial: false,
    trialDays: 0,
    seats: null,
    features: [
      "Custom seat count",
      "Dedicated support",
      "SLA guarantees",
      "Custom integrations",
      "Enterprise onboarding",
    ],
    ctaLabel: "Contact Sales",
    note: "Custom pricing for large organizations.",
    availability: null,
  },
} as const;

export type PlanId = keyof typeof PLANS;

export function getPlanLabel(planType: string | null | undefined): string {
  if (!planType) return "Free";
  if (planType === "founder") return "Founding Partner";
  if (planType === "individual") return "Individual";
  if (planType === "pro") return "Individual";
  if (planType === "team") return "Team";
  if (planType === "enterprise") return "Enterprise";
  return planType.charAt(0).toUpperCase() + planType.slice(1);
}

export function getPlanPrice(planType: string | null | undefined): string {
  if (!planType) return "N/A";
  if (planType === "founder") return PLANS.founder.priceLabel;
  if (planType === "individual" || planType === "pro") return PLANS.individual.priceLabel;
  if (planType === "team") return PLANS.team.priceLabel;
  if (planType === "enterprise") return PLANS.enterprise.priceLabel;
  return "N/A";
}
