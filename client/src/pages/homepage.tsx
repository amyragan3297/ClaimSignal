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
  { icon: ClipboardList, title: "Claim Intelligence", description: "Automatically organizes claim information including homeowner data, carrier details, claim numbers, dates of loss, financials, communications, and claim status." },
  { icon: Brain, title: "AI Extraction", description: "Extracts financial data, scope items, code requirements, denial indicators, adjuster information, carrier information, and claim activity directly from uploaded documents." },
  { icon: Zap, title: "Action Engine", description: "Identifies missing scope, supplement opportunities, documentation gaps, escalation triggers, and recommended next steps." },
  { icon: Users, title: "Adjuster Intelligence", description: "Tracks adjuster response times, supplement behavior, reinspection trends, approval patterns, friction indicators, and claim outcomes." },
  { icon: BarChart2, title: "Carrier Intelligence", description: "Analyzes carrier approval trends, supplement success rates, response performance, payment behavior, and recurring claim patterns." },
  { icon: BookOpen, title: "Claim Playbooks", description: "Builds intelligence from historical claim outcomes to identify what documentation, strategies, and actions produce successful results." },
  { icon: CloudLightning, title: "Storm Intelligence", description: "Correlates claims with verified weather events, storm dates, hail activity, wind events, and geographic loss data." },
  { icon: FileText, title: "Audit & Compliance", description: "Maintains complete audit history, document tracking, role-based permissions, and compliance records across all claim activity." },
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
            <Link href="/founding-partner-apply">
              <Button size="sm" data-testid="button-nav-request-access">
                Request Founder Access
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
          <h1
            className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6 leading-tight"
            data-testid="text-hero-title"
          >
            Property Claim Intelligence Powered by AI
          </h1>
          <p
            className="text-base md:text-lg text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed"
            data-testid="text-hero-subtext"
          >
            Upload claim documents, photos, estimates, denial letters, emails, recordings, and inspection reports. ClaimSignal automatically extracts claim data, identifies risk factors, tracks adjuster and carrier patterns, and recommends next actions.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link href="/founding-partner-apply">
              <Button size="lg" className="px-8" data-testid="button-hero-cta">
                Request Founder Access
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
            <Button
              variant="outline"
              size="lg"
              className="px-8"
              data-testid="button-hero-secondary"
              onClick={() => document.getElementById("platform")?.scrollIntoView({ behavior: "smooth" })}
            >
              View Platform
            </Button>
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
            Critical Claim Information Is Scattered Everywhere.
          </h2>
          <p className="text-muted-foreground leading-relaxed text-base">
            Property claim files are spread across estimates, photos, emails, denial letters, inspection reports, recordings, invoices, and carrier communications. Important information is often missed, timelines become difficult to track, and opportunities for recovery are lost.
          </p>
          <p className="text-muted-foreground/80 leading-relaxed text-sm mt-4">
            ClaimSignal centralizes claim intelligence, automatically extracts key information, and helps claim professionals make faster, more informed decisions.
          </p>
        </div>
      </section>

      {/* Platform */}
      <section className="py-24 px-6" id="platform">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <Badge variant="outline" className="mb-5 text-xs tracking-wide uppercase px-3 py-1">
              Platform
            </Badge>
            <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-4">
              One Platform. Complete Claim Intelligence.
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto text-sm leading-relaxed">
              ClaimSignal transforms claim documents into actionable intelligence. Every upload contributes to a living claim record, automated timeline, financial analysis, adjuster profile, carrier profile, and recommended next actions.
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
                Authentication, role-based access, PII masking, and audit logging are implemented and active. Behavioral scoring is computed from real claim data with clearly labeled analysis.
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

      {/* Final CTA */}
      <section className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <Badge variant="outline" className="mb-5 text-xs tracking-wide uppercase px-3 py-1">
            Get Started
          </Badge>
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-5">
            Upload a Claim. Get Answers.
          </h2>
          <p className="text-muted-foreground leading-relaxed text-sm max-w-2xl mx-auto">
            ClaimSignal automatically extracts claim data, analyzes claim activity, identifies opportunities, tracks adjuster and carrier patterns, and delivers actionable intelligence from every document you upload.
          </p>
          <div className="mt-8 flex items-center justify-center">
            <Link href="/founding-partner-apply">
              <Button size="lg" className="px-8" data-testid="button-stage-cta">
                Request Founder Access
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
                <button onClick={() => document.getElementById("platform")?.scrollIntoView({ behavior: "smooth" })} className="hover:text-foreground transition-colors text-left">Overview</button>
                <button onClick={() => document.getElementById("security")?.scrollIntoView({ behavior: "smooth" })} className="hover:text-foreground transition-colors text-left">Security</button>
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
