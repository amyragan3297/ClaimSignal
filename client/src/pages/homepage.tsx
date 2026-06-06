import { Link } from "wouter";
import logoImg from "@assets/claimsignal_logo_transparent.png";
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
} from "lucide-react";

const solutionCards = [
  { icon: ClipboardList, title: "Claim Intake", description: "Structured intake for loss type, carrier, policy, lifecycle phase, and key dates." },
  { icon: Brain, title: "Document Intelligence", description: "Structured extraction of financials, scope fields, code items, denial signals, and risk indicators from uploaded claim documents." },
  { icon: Zap, title: "Action Engine", description: "Generates prioritized recommended actions from extracted document intelligence and scoring signals." },
  { icon: BookOpen, title: "Playbook Engine", description: "Builds adjuster-specific behavioral playbooks from historical claim pattern data." },
  { icon: BarChart2, title: "Carrier Intelligence", description: "Aggregated adjuster and carrier behavioral data for pattern analysis without homeowner PII." },
  { icon: Users, title: "Adjuster Intelligence", description: "Friction scoring, supplement resistance, IRC behavior, and response velocity by adjuster." },
  { icon: CloudLightning, title: "Storm Date Intelligence", description: "Storm event lookup module for correlating claim dates with verifiable weather events." },
  { icon: FileText, title: "Audit Logs", description: "Immutable event stream capturing all platform actions for compliance and review purposes." },
];


export default function Homepage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/90 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <Link href="/">
            <div className="flex items-center" data-testid="img-logo">
              <img src={logoImg} alt="ClaimSignal" className="h-12 w-auto object-contain" />
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
            ClaimSignal™ organizes estimates, photos, denial letters, audio, inspection notes, storm data, and carrier communications into structured claim intelligence for contractors, claim professionals, and restoration teams.
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
            Claim files often live across estimates, photos, emails, voicemails, inspection notes, and carrier correspondence. ClaimSignal™ is designed to convert that scattered evidence into structured operational intelligence.
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
                ClaimSignal™ enforces role-based access control with organization-level tenant isolation. PII masking is on by default and enforced server-side — only the Master role can view unmasked records, and every unmasking action is written to an immutable audit log. Restricted roles see masked claim numbers, carrier names, and property addresses across dashboards and exports.
              </p>
              <p className="text-muted-foreground/80 leading-relaxed text-xs mt-3">
                Authentication, role-based access, PII masking, and audit logging are implemented and active. Behavioral scoring is currently MVP rule-based analysis, clearly labeled in-product.
              </p>
            </div>
            <div className="space-y-4">
              {[
                { icon: Lock, label: "JWT authentication with tenant-isolated, role-based access" },
                { icon: Eye, label: "Server-enforced PII masking — on by default for non-Master roles" },
                { icon: FileText, label: "Immutable audit logging for all major platform actions" },
                { icon: Shield, label: "Master-only unmasking, with every access recorded to the audit trail" },
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
            MVP platform — live core, roadmap intelligence.
          </h2>
          <p className="text-muted-foreground leading-relaxed text-sm max-w-2xl mx-auto">
            Live today: authentication, role-based access, tenant isolation, server-enforced PII masking, audit logging, Stripe billing, claim and evidence management, AI claim analysis, and audio transcription. Behavioral scoring (friction, escalation, supplement resistance) runs as MVP rule-based analysis. On the roadmap: live storm/weather API integration, geographic heat-map visualization, and OCR-driven document extraction. We label what is rule-based and never display fabricated metrics — empty data shows as "Not enough data" rather than a false zero.
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

      {/* Footer */}
      <footer className="border-t border-border/40 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col gap-8">
          <div className="flex flex-col sm:flex-row justify-between gap-8">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-blue-500" />
                <span className="text-sm font-bold tracking-tight">ClaimSignal&#8482;</span>
              </div>
              <p className="text-xs text-muted-foreground max-w-[200px] leading-relaxed">Operational intelligence for property insurance claims.</p>
            </div>
            <div className="flex flex-wrap gap-10 text-xs text-muted-foreground">
              <div className="flex flex-col gap-2">
                <span className="font-semibold text-foreground uppercase tracking-wider text-[10px]">Intelligence</span>
                <a href="/learn" className="hover:text-foreground transition-colors">Glossary</a>
                <a href="/carriers" className="hover:text-foreground transition-colors">Carrier Profiles</a>
                <a href="/claims" className="hover:text-foreground transition-colors">Claim Patterns</a>
              </div>
              <div className="flex flex-col gap-2">
                <span className="font-semibold text-foreground uppercase tracking-wider text-[10px]">Platform</span>
                <a href="#platform" className="hover:text-foreground transition-colors">Overview</a>
                <a href="#security" className="hover:text-foreground transition-colors">Security</a>
                <Link href="/login" className="hover:text-foreground transition-colors">Log In</Link>
              </div>
              <div className="flex flex-col gap-2">
                <span className="font-semibold text-foreground uppercase tracking-wider text-[10px]">Contact</span>
                <a href="mailto:claimsignal1@gmail.com" className="hover:text-foreground transition-colors">claimsignal1@gmail.com</a>
                <Link href="/brand-assets" className="hover:text-foreground transition-colors">Brand Assets</Link>
              </div>
            </div>
          </div>
          <div className="border-t border-border/40 pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>© {new Date().getFullYear()} ClaimSignal™. All rights reserved.</span>
            <span>All carrier information is educational and informational only. Not legal advice.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
