import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  Activity,
  TrendingUp,
  Brain,
  AlertTriangle,
  FileText,
  Lock,
  Database,
  Users,
  HardDrive,
  Zap,
  ChevronRight,
  BarChart3,
  Target,
  Search,
  LineChart,
  ArrowRight,
  Check,
} from "lucide-react";

const intelligenceLayers = [
  {
    icon: Activity,
    title: "Friction Scoring Engine",
    description: "Quantify adjuster responsiveness and claim progression velocity with behavioral analytics.",
  },
  {
    icon: Brain,
    title: "Repairability Intelligence",
    description: "Structured documentation models that identify scope gaps and supplement opportunities.",
  },
  {
    icon: TrendingUp,
    title: "Depreciation Recovery Modeling",
    description: "Recoverable depreciation tracking with timeline projections and recovery probability scoring.",
  },
  {
    icon: Target,
    title: "Predictive Approval Engine",
    description: "Probability modeling for claim outcomes based on carrier patterns and historical data.",
  },
  {
    icon: AlertTriangle,
    title: "Escalation Readiness Modeling",
    description: "Automated escalation triggers with DOI complaint scoring and regulatory risk assessment.",
  },
  {
    icon: FileText,
    title: "DOI Documentation Assistant",
    description: "Structured complaint generation with jurisdiction-specific templates and audit-ready formatting.",
  },
];

const infraFeatures = [
  { icon: Lock, title: "Tenant Isolation", description: "Complete data isolation between organizations with row-level security." },
  { icon: Database, title: "Immutable Audit Logs", description: "Every action tracked, timestamped, and permanently recorded." },
  { icon: Users, title: "Role-Based Enforcement", description: "Granular access control across owner, admin, analyst, and member roles." },
  { icon: HardDrive, title: "Encrypted Backups", description: "Point-in-time recovery with AES-256 encrypted backup infrastructure." },
  { icon: Zap, title: "Built for Scale", description: "Horizontally scalable architecture designed for enterprise claim volumes." },
];

const outcomes = [
  "Reduce denial cycle time by 40%",
  "Increase supplement recovery rate",
  "Identify adjuster risk patterns early",
  "Standardize repairability documentation",
  "Protect gross margin across portfolios",
];

const tiers = [
  {
    name: "Founder",
    price: "$149",
    period: "/mo",
    badge: "Limited to 3",
    description: "Full platform access with unmasked data and founder benefits.",
    features: [
      "Full unmasked data access",
      "All intelligence modules",
      "12-day free trial",
      "Priority support",
      "Founder advisory input",
      "Early feature access",
    ],
    cta: "Start Free Trial",
    highlight: true,
  },
  {
    name: "Pro",
    price: "$79",
    period: "/mo",
    description: "Essential claim management with core analytics.",
    features: [
      "Masked data access",
      "Friction scoring",
      "Claims management",
      "Basic reporting",
      "Email support",
    ],
    cta: "Get Started",
    highlight: false,
  },
  {
    name: "Team",
    price: "$199",
    period: "/mo",
    description: "Collaborative claim operations for growing teams.",
    features: [
      "Up to 10 seats",
      "Masked data access",
      "All intelligence modules",
      "Team analytics",
      "Priority support",
      "Custom workflows",
    ],
    cta: "Get Started",
    highlight: false,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "Dedicated infrastructure with full customization.",
    features: [
      "Unlimited seats",
      "Custom data policies",
      "Dedicated infrastructure",
      "SLA guarantee",
      "On-premise option",
      "Custom integrations",
    ],
    cta: "Contact Sales",
    highlight: false,
  },
];

export default function Homepage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap px-6 py-4">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            <span className="text-lg font-semibold tracking-tight" data-testid="text-logo">ClaimSignal</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Link href="/login">
              <Button variant="ghost" size="sm" data-testid="link-login">Log In</Button>
            </Link>
            <Link href="/login?tab=register">
              <Button size="sm" data-testid="link-register">
                Start 14-Day Trial
                <ChevronRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      <section className="relative pt-32 pb-24 px-6">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/5 rounded-full blur-3xl" />
        </div>
        <div className="max-w-4xl mx-auto text-center relative">
          <Badge variant="outline" className="mb-6">
            Operational Intelligence Platform
          </Badge>
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6" data-testid="text-hero-title">
            Claim<span className="text-primary">Signal</span>
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground mb-3 font-medium" data-testid="text-hero-subtitle">
            Operational Intelligence for Property Claims
          </p>
          <p className="text-base text-muted-foreground/80 mb-10 max-w-2xl mx-auto leading-relaxed" data-testid="text-hero-subtext">
            Structured behavioral analytics, escalation modeling, and audit-ready claim infrastructure.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link href="/login?tab=register">
              <Button size="lg" data-testid="button-hero-cta">
                Start 14-Day Trial
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <a href="#infrastructure">
              <Button variant="outline" size="lg" data-testid="button-hero-secondary">
                View Enterprise Architecture
              </Button>
            </a>
          </div>
        </div>
      </section>

      <section className="py-24 px-6" id="intelligence">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4">
              Core Platform
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
              Intelligence Layers
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Six integrated analytics engines that transform raw claim data into actionable operational intelligence.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {intelligenceLayers.map((item) => (
              <Card key={item.title} className="hover-elevate" data-testid={`card-intelligence-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                <CardContent className="p-6">
                  <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center mb-4">
                    <item.icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-2">{item.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 px-6 bg-card/50" id="infrastructure">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4">
              Architecture
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
              Enterprise Infrastructure
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Built from the ground up for compliance, security, and performance at scale.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4">
            {infraFeatures.map((item) => (
              <Card key={item.title} className="text-center hover-elevate" data-testid={`card-infra-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                <CardContent className="p-6">
                  <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <item.icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-sm mb-2">{item.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <Badge variant="outline" className="mb-4">
                Outcomes
              </Badge>
              <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
                Measured Performance. Not Guesswork.
              </h2>
              <p className="text-muted-foreground mb-8 leading-relaxed">
                Every metric is derived from structured claim data, carrier behavior analysis, and outcome modeling.
              </p>
            </div>
            <div className="space-y-4">
              {outcomes.map((outcome) => (
                <div key={outcome} className="flex items-start gap-3" data-testid={`text-outcome-${outcome.substring(0, 10).toLowerCase().replace(/\s+/g, "-")}`}>
                  <div className="mt-0.5 w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 text-primary" />
                  </div>
                  <span className="text-sm font-medium">{outcome}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 px-6 bg-card/50" id="pricing">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4">
              Pricing
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
              Choose Your Tier
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Start with a 12-day free trial on the Founder tier. Scale as your operations grow.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {tiers.map((tier) => (
              <Card
                key={tier.name}
                className={`relative ${tier.highlight ? "border-primary" : ""}`}
                data-testid={`card-tier-${tier.name.toLowerCase()}`}
              >
                {tier.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="text-xs">{tier.badge}</Badge>
                  </div>
                )}
                <CardContent className="p-6">
                  <h3 className="font-semibold text-lg mb-1">{tier.name}</h3>
                  <p className="text-xs text-muted-foreground mb-4">{tier.description}</p>
                  <div className="mb-6">
                    <span className="text-3xl font-bold">{tier.price}</span>
                    <span className="text-muted-foreground text-sm">{tier.period}</span>
                  </div>
                  <div className="space-y-3 mb-6">
                    {tier.features.map((feature) => (
                      <div key={feature} className="flex items-center gap-2 text-sm">
                        <Check className="w-4 h-4 text-primary shrink-0" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                  <Link href="/login?tab=register">
                    <Button
                      className="w-full"
                      variant={tier.highlight ? "default" : "outline"}
                      data-testid={`button-tier-${tier.name.toLowerCase()}`}
                    >
                      {tier.cta}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border/50 py-12 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              <span className="font-semibold">ClaimSignal</span>
            </div>
            <div className="flex items-center gap-6 flex-wrap text-sm text-muted-foreground">
              <a href="#pricing" className="hover-elevate px-2 py-1 rounded-md" data-testid="link-footer-enterprise">Enterprise</a>
              <Link href="/investor" className="hover-elevate px-2 py-1 rounded-md" data-testid="link-footer-investor">Investor Inquiry</Link>
              <a href="#infrastructure" className="hover-elevate px-2 py-1 rounded-md" data-testid="link-footer-security">Security</a>
              <a href="#" className="hover-elevate px-2 py-1 rounded-md" data-testid="link-footer-terms">Terms</a>
            </div>
          </div>
          <div className="mt-8 text-center text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} ClaimSignal. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
