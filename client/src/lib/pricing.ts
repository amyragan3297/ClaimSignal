export const PLANS = {
  founder: {
    id: "founder" as const,
    name: "Founding Partner",
    price: 79,
    priceLabel: "$79/mo",
    description: "Unlock lifetime access to the ClaimSignal platform at the Founding Partner rate of $79/month. Includes full AI-powered claim intelligence, carrier analytics, adjuster behavior tracking, and 14-day free trial. Rate is locked for life while subscription remains active. Invitation-only program.",
    badge: "Limited Early Access",
    trial: true,
    trialDays: 14,
    seats: 1,
    features: [
      "Locked early partner pricing for life",
      "Full platform access",
      "14-day trial with card required",
      "AI-powered claim extraction",
      "Carrier intelligence & analytics",
      "Adjuster behavior tracking",
      "Playbook recommendations",
      "Audit logging & compliance",
      "Manual approval required",
      "Limited availability",
    ],
    ctaLabel: "Apply for Access",
    note: "Application required. Approval needed before access.",
    availability: "Limited availability",
  },
  individual: {
    id: "individual" as const,
    name: "Individual",
    price: 149,
    priceLabel: "$149/mo",
    description: "Full ClaimSignal platform access for individual restoration contractors, public adjusters, and insurance consultants. Includes AI claim extraction, timeline analysis, risk scoring, playbook intelligence, and carrier analytics. Immediate access.",
    badge: null,
    trial: false,
    trialDays: 0,
    seats: 1,
    features: [
      "Full platform access",
      "Unlimited claims",
      "Evidence management",
      "AI-powered claim extraction",
      "Claim intelligence & risk scoring",
      "Carrier intelligence & analytics",
      "Adjuster behavior tracking",
      "Playbook recommendations",
      "Audit logging & compliance",
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
    description: "ClaimSignal platform access for teams. Includes 5 user seats, AI-powered claim intelligence, carrier analytics, team collaboration tools, and shared claim access. Additional seats available at $25/month per user. Immediate access.",
    badge: null,
    trial: false,
    trialDays: 0,
    seats: 5,
    extraSeatPrice: 25,
    features: [
      "Everything in Individual",
      "5 users included",
      "Additional seats $25/user/month",
      "Team reporting & dashboards",
      "Shared claim access",
      "Organization management",
      "Collaborative playbook building",
      "Admin controls & permissions",
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
    description: "Custom pricing and tailored solutions for larger organizations, multi-region operators, and franchise networks. Includes custom integrations, API access, SSO, dedicated onboarding, and carrier-level analytics.",
    badge: null,
    trial: false,
    trialDays: 0,
    seats: null,
    features: [
      "Custom user limits",
      "Custom integrations",
      "API access",
      "Single Sign-On (SSO)",
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
