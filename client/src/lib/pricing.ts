export const PLANS = {
  founder: {
    id: "founder" as const,
    name: "Founding Partner",
    price: 99,
    priceLabel: "$99/mo",
    description: "Invitation-only founding partner program. Lock in $99/month for life with a 14-day free trial. Includes full ClaimSignal intelligence suite, carrier analytics, adjuster behavior tracking, and early access to pilot features. Rate is locked forever while subscription remains active.",
    badge: "Invitation Only",
    trial: true,
    trialDays: 14,
    seats: 1,
    features: [
      "Locked $99/month pricing for life",
      "14-day trial — card required",
      "Full platform access",
      "AI-powered claim extraction",
      "Carrier intelligence & analytics",
      "Adjuster behavior tracking",
      "Playbook recommendations",
      "Early access to pilot features",
      "Founder badge",
      "Limited availability",
    ],
    ctaLabel: "Apply for Founder Access",
    note: "Invitation required. Rate locked forever upon enrollment.",
    availability: "Invitation only · Limited availability",
  },
  individual: {
    id: "individual" as const,
    name: "Individual Professional",
    price: 149,
    priceLabel: "$149/mo",
    description: "Full ClaimSignal platform access for individual restoration contractors, public adjusters, and insurance consultants. Includes AI claim extraction, timeline analysis, risk scoring, playbook intelligence, and carrier analytics. Immediate access.",
    badge: null,
    trial: false,
    trialDays: 0,
    seats: 1,
    features: [
      "1 user included",
      "Full platform access",
      "Unlimited claims",
      "Evidence management",
      "AI-powered claim extraction",
      "Claim intelligence & risk scoring",
      "Carrier intelligence & analytics",
      "Adjuster behavior tracking",
      "Playbook recommendations",
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
    description: "ClaimSignal for growing teams. Includes 3 user seats, AI-powered claim intelligence, team admin controls, and shared claim library. Additional seats at $35/month each. Immediate access.",
    badge: null,
    trial: false,
    trialDays: 0,
    seats: 3,
    extraSeatPrice: 35,
    features: [
      "Everything in Individual",
      "3 users included",
      "Additional seats $35/user/month",
      "Team admin controls",
      "Shared claim library",
      "Team reporting & dashboards",
      "Organization management",
      "Collaborative playbook building",
    ],
    ctaLabel: "Start Team Subscription",
    note: "Includes 3 users. Additional seats $35/user/month.",
    availability: null,
  },
  growth_team: {
    id: "growth_team" as const,
    name: "Growth Team",
    price: 599,
    priceLabel: "$599/mo",
    description: "Designed for larger roofing, restoration, and claim teams. Includes 10 user seats, full ClaimSignal intelligence suite, team admin controls, and shared claim library. Immediate access.",
    badge: "Best for Growing Teams",
    trial: false,
    trialDays: 0,
    seats: 10,
    extraSeatPrice: 35,
    features: [
      "Everything in Team",
      "10 users included",
      "Additional seats $35/user/month",
      "Team admin controls",
      "Shared claim library",
      "Team reporting & dashboards",
      "Organization management",
      "Priority support",
    ],
    ctaLabel: "Start Growth Team Subscription",
    note: "Includes 10 users. Additional seats $35/user/month.",
    availability: null,
  },
  enterprise: {
    id: "enterprise" as const,
    name: "Enterprise",
    price: null,
    priceLabel: "Custom Pricing",
    description: "For 15+ users, multi-location teams, advanced data controls, custom onboarding, investor/legal/export needs, and dedicated support. Contact us for a custom quote.",
    badge: null,
    trial: false,
    trialDays: 0,
    seats: null,
    features: [
      "15+ users",
      "Multi-location teams",
      "Advanced data controls",
      "Custom onboarding",
      "Investor / legal / export support",
      "Custom reporting",
      "Dedicated support & SLA",
      "API access",
      "Single Sign-On (SSO)",
    ],
    ctaLabel: "Contact Sales",
    note: "Custom pricing for large organizations. Contact us.",
    availability: null,
  },
} as const;

export type PlanId = keyof typeof PLANS;

export function getPlanLabel(planType: string | null | undefined): string {
  if (!planType) return "Free";
  if (planType === "founder") return "Founding Partner";
  if (planType === "individual") return "Individual Professional";
  if (planType === "pro") return "Individual Professional";
  if (planType === "team") return "Team";
  if (planType === "growth_team") return "Growth Team";
  if (planType === "enterprise") return "Enterprise";
  return planType.charAt(0).toUpperCase() + planType.slice(1);
}

export function getPlanPrice(planType: string | null | undefined): string {
  if (!planType) return "N/A";
  if (planType === "founder") return PLANS.founder.priceLabel;
  if (planType === "individual" || planType === "pro") return PLANS.individual.priceLabel;
  if (planType === "team") return PLANS.team.priceLabel;
  if (planType === "growth_team") return PLANS.growth_team.priceLabel;
  if (planType === "enterprise") return PLANS.enterprise.priceLabel;
  return "N/A";
}
