export const PLANS = {
  founder: {
    id: "founder" as const,
    name: "Founding Partner",
    price: 79,
    priceLabel: "$79/mo",
    description: "14-day free trial. Card required.",
    badge: "Limited Early Access",
    trial: true,
    trialDays: 14,
    seats: 1,
    features: [
      "Locked early partner pricing",
      "Full platform access",
      "14-day trial with card required",
      "Manual approval required",
      "Limited availability",
    ],
    ctaLabel: "Apply for Access",
    note: "Application required. Approval needed before access.",
    availability: "Limited to first 100 organizations",
  },
  individual: {
    id: "individual" as const,
    name: "Individual",
    price: 99,
    priceLabel: "$99/mo",
    description: "Immediate access. No trial.",
    badge: null,
    trial: false,
    trialDays: 0,
    seats: 1,
    features: [
      "Full platform access",
      "Unlimited claims",
      "Evidence management",
      "AI extraction",
      "Claim intelligence",
      "Carrier intelligence",
      "Adjuster intelligence",
      "Audit logging",
      "Storm date intelligence",
    ],
    ctaLabel: "Start Individual Subscription",
    note: "Immediate access. No trial period.",
    availability: null,
  },
  team: {
    id: "team" as const,
    name: "Team",
    price: 299,
    priceLabel: "$299/mo",
    description: "Includes 5 users. Additional seats $25/user/month.",
    badge: null,
    trial: false,
    trialDays: 0,
    seats: 5,
    extraSeatPrice: 25,
    features: [
      "Everything in Individual",
      "5 users included",
      "Additional seats $25/user/month",
      "Team reporting",
      "Shared claim access",
      "Organization management",
    ],
    ctaLabel: "Start Team Subscription",
    note: "Includes 5 users. Additional seats $25/user/month.",
    availability: null,
  },
  enterprise: {
    id: "enterprise" as const,
    name: "Enterprise",
    price: null,
    priceLabel: "Contact Sales",
    description: "Custom pricing for larger organizations.",
    badge: null,
    trial: false,
    trialDays: 0,
    seats: null,
    features: [
      "Custom user limits",
      "Custom integrations",
      "API access",
      "Single Sign-On",
      "Dedicated onboarding",
      "Dedicated support",
      "SLA agreements",
      "Custom reporting",
      "Carrier-level analytics",
      "Franchise and multi-region management",
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
  if (planType === "individual") return "Professional";
  if (planType === "pro") return "Professional";
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
