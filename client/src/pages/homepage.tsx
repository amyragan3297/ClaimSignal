import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Shield,
  FileText,
  Brain,
  Zap,
  BarChart2,
  CloudLightning,
  Users,
  ClipboardList,
  Lock,
  Eye,
  BookOpen,
  ArrowRight,
  Check,
} from "lucide-react";

const solutionCards = [
  { icon: ClipboardList, title: "Claim Intake", description: "Structured intake for loss type, carrier, policy, lifecycle phase, and key dates." },
  { icon: Brain, title: "AI Extraction Review", description: "Document-level extraction of financials, scope fields, code items, denial signals, and risk indicators." },
  { icon: Zap, title: "Action Engine", description: "Generates prioritized recommended actions from extracted document intelligence and scoring signals." },
  { icon: BookOpen, title: "Playbook Engine", description: "Builds adjuster-specific behavioral playbooks from historical claim pattern data." },
  { icon: BarChart2, title: "Carrier Intelligence", description: "Aggregated adjuster and carrier behavioral data for pattern analysis without homeowner PII." },
  { icon: Users, title: "Adjuster Intelligence", description: "Friction scoring, supplement resistance, IRC behavior, and response velocity by adjuster." },
  { icon: CloudLightning, title: "Storm Date Intelligence", description: "Storm event lookup module for correlating claim dates with verifiable weather events." },
  { icon: FileText, title: "Audit Logs", description: "Immutable event stream capturing all platform actions for compliance and review purposes." },
];

const pricingPlans = [
  {
    name: "Founder Access",
    price: "$79",
    period: "/month",
    description: "Available by approval only for a limited early group.",
    note: "Card required before platform access. Founder pricing remains active while the subscription remains active.",
    features: [
      "Full platform access",
      "All intelligence engines",
      "Unmasked data access",
      "Roadmap collaboration eligibility",
      "Priority support",
    ],
    cta: "Apply for Founder Access",
    ctaHref: "/login?tab=register&plan=founder",
    highlighted: true,
    testId: "card-pricing-founder",
    btnTestId: "button-pricing-founder",
    variant: "default" as const,
  },
  {
    name: "Individual",
    price: "$99",
    period: "/month",
    description: "For independent contractors, consultants, and solo claim professionals.",
    note: "",
    features: [
      "Full platform access",
      "All intelligence engines",
      "Claims lifecycle tracking",
      "Adjuster metrics",
    ],
    cta: "Request Access",
    ctaHref: "/login?tab=register&plan=pro",
    highlighted: false,
    testId: "card-pricing-individual",
    btnTestId: "button-pricing-individual",
    variant: "outline" as const,
  },
  {
    name: "Team",
    price: "$149",
    period: "/month",
    description: "Includes 2 seats. Additional seats are $30.00 per user per month.",
    note: "",
    features: [
      "Everything in Individual",
      "2 included seats",
      "Role-based access control",
      "Priority support",
    ],
    cta: "Request Team Access",
    ctaHref: "/login?tab=register&plan=team",
    highlighted: false,
    testId: "card-pricing-team",
    btnTestId: "button-pricing-team",
    variant: "outline" as const,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For larger organizations needing custom onboarding, expanded data controls, dedicated support, and advanced permissions.",
    note: "",
    features: [
      "Everything in Team",
      "Custom onboarding",
      "Expanded data controls",
      "Dedicated support",
      "Advanced permissions",
    ],
    cta: "Contact Sales",
    ctaHref: "mailto:enterprise@claimsignal.com",
    highlighted: false,
    testId: "card-pricing-enterprise",
    btnTestId: "button-pricing-enterprise",
    variant: "outline" as const,
    external: true,
  },
];

export default function Homepage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/90 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <Link href="/">
            <div className="flex items-center gap-2" data-testid="img-logo">
              <Shield className="h-7 w-7 text-blue-500" />
              <span className="text-lg font-bold tracking-tight">ClaimSignal&#8482;</span>
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm" data-testid="link-login">Log In</Button>
            </Link>
            <Link href="/login?tab=register">
              <Button size="sm" data-testid="button-nav-request-access">
                Request Access
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-36 pb-28 px-6">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/3 w-[480px] h-[480px] bg-blue-500/5 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-[360px] h-[360px] bg-blue-400/4 rounded-full blur-3xl" />
        </div>
        <div className="max-w-3xl mx-auto text-center relative">
          <Badge variant="outline" className="mb-6 text-xs tracking-wide uppercase px-3 py-1">
            Pre-Implementation Pilot
          </Badge>
          <h1
            className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6 leading-tight"
            data-testid="text-hero-title"
          >
            Claim intelligence built from real claim evidence.
          </h1>
          <p
            className="text-base md:text-lg text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed"
            data-testid="text-hero-subtext"
          >
            ClaimSignal organizes estimates, photos, denial letters, audio, inspection notes, storm data, and carrier communications into structured claim intelligence for contractors, claim professionals, and restoration teams.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link href="/login?tab=register">
              <Button size="lg" className="px-8" data-testid="button-hero-cta">
                Request Access
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
            <Link href="/login">
              <Button variant="outline" size="lg" className="px-8" data-testid="button-hero-secondary">
                View Platform
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="py-20 px-6 bg-card/40 border-y border-border/30">
        <div className="max-w-3xl mx-auto text-center">
          <Badge variant="outline" className="mb-5 text-xs tracking-wide uppercase px-3 py-1">
            The Problem
          </Badge>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-5">
            Property claim work is fragmented, manual, and difficult to defend.
          </h2>
          <p className="text-muted-foreground leading-relaxed text-base">
            Claim files often live across estimates, photos, emails, voicemails, inspection notes, and carrier correspondence. ClaimSignal is designed to convert that scattered evidence into structured operational intelligence.
          </p>
        </div>
      </section>

      {/* Solution */}
      <section className="py-24 px-6" id="platform">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <Badge variant="outline" className="mb-5 text-xs tracking-wide uppercase px-3 py-1">
              Platform
            </Badge>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-4">
              A structured intelligence layer for property claims.
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto text-sm leading-relaxed">
              Eight interconnected modules that convert scattered claim evidence into defensible, actionable intelligence.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {solutionCards.map((item) => (
              <Card
                key={item.title}
                className="border border-border/50 bg-card/60"
                data-testid={`card-solution-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
              >
                <CardContent className="p-5">
                  <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center mb-4">
                    <item.icon className="w-4 h-4 text-primary" />
                  </div>
                  <h3 className="font-semibold text-sm mb-2">{item.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Security and Data Governance */}
      <section className="py-20 px-6 bg-card/40 border-y border-border/30" id="security">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <Badge variant="outline" className="mb-5 text-xs tracking-wide uppercase px-3 py-1">
                Data Governance
              </Badge>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-5">
                Built for sensitive claim data.
              </h2>
              <p className="text-muted-foreground leading-relaxed text-sm">
                ClaimSignal uses role-aware access concepts, masked views, audit-ready workflows, and controlled data visibility. Master Admin users may view full unmasked records. Restricted users see masked claim numbers, carrier names, and property addresses.
              </p>
            </div>
            <div className="space-y-4">
              {[
                { icon: Lock, label: "Role-aware access control with tenant isolation" },
                { icon: Eye, label: "Masked PII views by default for restricted users" },
                { icon: FileText, label: "Audit-ready event logging for all platform actions" },
                { icon: Shield, label: "Controlled data visibility with unmasking audit trail" },
              ].map((item) => (
                <div key={item.label} className="flex items-start gap-3">
                  <div className="mt-0.5 w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                    <item.icon className="w-4 h-4 text-primary" />
                  </div>
                  <span className="text-sm leading-relaxed pt-1.5">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Current Stage */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <Badge variant="outline" className="mb-5 text-xs tracking-wide uppercase px-3 py-1">
            Current Stage
          </Badge>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-5">
            Pre-implementation pilot platform.
          </h2>
          <p className="text-muted-foreground leading-relaxed text-sm max-w-2xl mx-auto">
            ClaimSignal is currently being prepared for technical validation, pilot workflows, and commercialization support. Production services such as authentication hardening, payment processing, file storage, OCR, AI extraction, storm APIs, and audit logging will be finalized during backend implementation.
          </p>
          <div className="mt-8">
            <Link href="/login?tab=register">
              <Button variant="outline" data-testid="button-stage-cta">
                Request Access
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-24 px-6 bg-card/40 border-y border-border/30" id="pricing">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <Badge variant="outline" className="mb-5 text-xs tracking-wide uppercase px-3 py-1">
              Pricing
            </Badge>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-4">
              View Pricing
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto text-sm">
              Access options for independent professionals, teams, and enterprise organizations.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {pricingPlans.map((plan) => (
              <Card
                key={plan.name}
                className={`flex flex-col ${plan.highlighted ? "border-primary ring-1 ring-primary/30" : "border-border/50"}`}
                data-testid={plan.testId}
              >
                <CardContent className="p-6 flex flex-col flex-1">
                  <div className="mb-5">
                    {plan.highlighted && (
                      <Badge className="mb-3 text-xs" data-testid="badge-founder-access">
                        By Approval Only
                      </Badge>
                    )}
                    <h3 className="text-base font-bold mb-1">{plan.name}</h3>
                    <p className="text-xs text-muted-foreground mb-4 leading-relaxed">{plan.description}</p>
                    <div className="flex items-baseline gap-0.5">
                      <span className="text-3xl font-bold">{plan.price}</span>
                      {plan.period && (
                        <span className="text-sm text-muted-foreground">{plan.period}</span>
                      )}
                    </div>
                    {plan.note && (
                      <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{plan.note}</p>
                    )}
                  </div>
                  <div className="space-y-2.5 mb-7 flex-1">
                    {plan.features.map((feature) => (
                      <div key={feature} className="flex items-start gap-2 text-xs">
                        <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                        <span className="leading-relaxed">{feature}</span>
                      </div>
                    ))}
                  </div>
                  {plan.external ? (
                    <a href={plan.ctaHref}>
                      <Button variant={plan.variant} className="w-full text-sm" data-testid={plan.btnTestId}>
                        {plan.cta}
                      </Button>
                    </a>
                  ) : (
                    <Link href={plan.ctaHref}>
                      <Button variant={plan.variant} className="w-full text-sm" data-testid={plan.btnTestId}>
                        {plan.cta}
                        <ArrowRight className="w-3.5 h-3.5 ml-1" />
                      </Button>
                    </Link>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-500" />
            <span className="text-sm font-bold tracking-tight">ClaimSignal&#8482;</span>
          </div>
          <nav className="flex items-center gap-6 text-xs text-muted-foreground">
            <a href="#platform" className="hover:text-foreground transition-colors">Platform</a>
            <a href="#security" className="hover:text-foreground transition-colors">Security</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Pricing</a>
            <Link href="/login" className="hover:text-foreground transition-colors">Log In</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
