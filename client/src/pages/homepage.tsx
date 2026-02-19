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
  Target,
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
    title: "Inspection Integrity Engine",
    description: "Track location authentication, photo coverage depth, mechanical test documentation, and visual reference clarity.",
  },
  {
    icon: TrendingUp,
    title: "Scope Delta Engine",
    description: "Compare estimated vs. actual scope with supplement detection and depreciation recovery modeling.",
  },
  {
    icon: Target,
    title: "Lifecycle Phase Engine",
    description: "8-phase claim lifecycle from Pre-Claim Validation through Resolution with phase-specific scoring.",
  },
  {
    icon: AlertTriangle,
    title: "Escalation Architecture Engine",
    description: "Track reinspection requests, denial flags, policyholder activation, and regulatory signaling with escalation levels 0-5.",
  },
  {
    icon: FileText,
    title: "Outcome Migration Engine",
    description: "Your monetization layer. Track Initial Determination to Final Outcome with full outcome migration data.",
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

export default function Homepage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap px-6 py-4">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            <span className="text-lg font-semibold tracking-tight" data-testid="text-logo">
              CLAIM<span className="text-primary">SIGNAL</span>
            </span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Link href="/login">
              <Button variant="ghost" size="sm" data-testid="link-login">Log In</Button>
            </Link>
            <Link href="/login?tab=register">
              <Button size="sm" data-testid="link-register">
                Get Started
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
            Insurance Adjuster Intelligence
          </Badge>
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6" data-testid="text-hero-title">
            Claim<span className="text-primary">Signal</span>
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground mb-3 font-medium" data-testid="text-hero-subtitle">
            Operational Intelligence for Property Claims
          </p>
          <p className="text-base text-muted-foreground/80 mb-10 max-w-2xl mx-auto leading-relaxed" data-testid="text-hero-subtext">
            Structured behavioral analytics, escalation modeling, and audit-ready claim infrastructure.
            Built for contractors who want structural advantage &mdash; not reactive workflows.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link href="/login?tab=register">
              <Button size="lg" data-testid="button-hero-cta">
                Get Started
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
                <div key={outcome} className="flex items-start gap-3">
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
              Operate With Signal.
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
              Pricing
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Choose the plan that fits your operation.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card data-testid="card-pricing-pro">
              <CardContent className="p-6">
                <div className="mb-6">
                  <h3 className="text-lg font-bold mb-1">Pro</h3>
                  <p className="text-sm text-muted-foreground mb-4">For individual contractors</p>
                  <div>
                    <span className="text-3xl font-bold">$79</span>
                    <span className="text-muted-foreground">/mo</span>
                  </div>
                </div>
                <div className="space-y-3 mb-8">
                  {[
                    "Masked data access",
                    "6 intelligence engines",
                    "Claims lifecycle tracking",
                    "Adjuster metrics",
                  ].map((feature) => (
                    <div key={feature} className="flex items-center gap-2 text-sm">
                      <Check className="w-4 h-4 text-primary shrink-0" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
                <Link href="/login?tab=register&plan=pro">
                  <Button className="w-full" data-testid="button-pricing-pro">
                    Get Started
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card data-testid="card-pricing-team">
              <CardContent className="p-6">
                <div className="mb-6">
                  <h3 className="text-lg font-bold mb-1">Team</h3>
                  <p className="text-sm text-muted-foreground mb-4">For growing teams</p>
                  <div>
                    <span className="text-3xl font-bold">$149</span>
                    <span className="text-muted-foreground">/mo</span>
                  </div>
                </div>
                <div className="space-y-3 mb-8">
                  {[
                    "Everything in Pro",
                    "Multi-user organization",
                    "Role-based access",
                    "Priority support",
                  ].map((feature) => (
                    <div key={feature} className="flex items-center gap-2 text-sm">
                      <Check className="w-4 h-4 text-primary shrink-0" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
                <Link href="/login?tab=register&plan=team">
                  <Button className="w-full" data-testid="button-pricing-team">
                    Get Started
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card className="border-primary" data-testid="card-pricing-founder">
              <CardContent className="p-6">
                <div className="mb-6">
                  <Badge variant="secondary" className="mb-3" data-testid="badge-founder-spots">Limited - 3 Spots</Badge>
                  <h3 className="text-lg font-bold mb-1">Founder</h3>
                  <p className="text-sm text-muted-foreground mb-4">For early adopters</p>
                  <div>
                    <span className="text-3xl font-bold">$249</span>
                    <span className="text-muted-foreground">/mo</span>
                  </div>
                </div>
                <div className="space-y-3 mb-8">
                  {[
                    "Full unmasked data access",
                    "All 6 intelligence engines",
                    "14-day free trial",
                    "Founder advisory input",
                    "Permanently locked pricing",
                    "Priority support",
                  ].map((feature) => (
                    <div key={feature} className="flex items-center gap-2 text-sm">
                      <Check className="w-4 h-4 text-primary shrink-0" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
                <Link href="/login?tab=register&plan=founder">
                  <Button className="w-full" data-testid="button-pricing-founder">
                    Start 14-Day Trial
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card data-testid="card-pricing-enterprise">
              <CardContent className="p-6">
                <div className="mb-6">
                  <h3 className="text-lg font-bold mb-1">Enterprise</h3>
                  <p className="text-sm text-muted-foreground mb-4">For large organizations</p>
                  <div>
                    <span className="text-3xl font-bold">Custom</span>
                  </div>
                </div>
                <div className="space-y-3 mb-8">
                  {[
                    "Everything in Founder",
                    "Unlimited seats",
                    "Custom integrations",
                    "Dedicated support",
                    "SLA guarantees",
                  ].map((feature) => (
                    <div key={feature} className="flex items-center gap-2 text-sm">
                      <Check className="w-4 h-4 text-primary shrink-0" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>
                <a href="mailto:enterprise@claimsignal.com">
                  <Button variant="outline" className="w-full" data-testid="button-pricing-enterprise">
                    Contact Sales
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </a>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/50 py-12 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              <span className="font-semibold">
                CLAIM<span className="text-primary">SIGNAL</span>
              </span>
            </div>
            <div className="flex items-center gap-6 flex-wrap text-sm text-muted-foreground">
              <a href="#pricing" className="hover-elevate px-2 py-1 rounded-md">Pricing</a>
              <a href="#infrastructure" className="hover-elevate px-2 py-1 rounded-md">Security</a>
              <a href="#intelligence" className="hover-elevate px-2 py-1 rounded-md">Platform</a>
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
