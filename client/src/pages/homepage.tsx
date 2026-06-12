import { useEffect } from "react";
import { Link } from "wouter";
import logoImg from "@assets/claimsignal_logo_transparent.png";
import { Button } from "@/components/ui/button";
import { ArrowRight, CheckCircle2 } from "lucide-react";

const FEATURES = [
  "Missing Scope Detection",
  "Adjuster Intelligence",
  "Carrier Intelligence",
  "Claim Timeline Analysis",
  "Supplement Opportunities",
  "Code Compliance Review",
  "Financial Exposure Tracking",
  "AI Recommended Next Actions",
];

export default function Homepage() {
  useEffect(() => {
    document.title = "ClaimSignal — Insurance Claim Intelligence. Built for Contractors.";
  }, []);

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">

      {/* ── Navigation ─────────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/90 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-3">
          <Link href="/">
            <div className="flex items-center cursor-pointer" data-testid="img-logo">
              <img src={logoImg} alt="ClaimSignal" className="h-10 w-auto object-contain" />
            </div>
          </Link>
          <div className="hidden md:flex items-center gap-1">
            <Link href="/platform-overview">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" data-testid="link-nav-platform">Platform</Button>
            </Link>
            <Link href="/pricing">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" data-testid="link-nav-features">Features</Button>
            </Link>
            <Link href="/investor-relations">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" data-testid="link-nav-investors">Investors</Button>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm" data-testid="link-login">Log In</Button>
            </Link>
            <Link href="/founding-partner-apply" className="hidden sm:block">
              <Button size="sm" className="bg-primary hover:bg-primary/90" data-testid="button-nav-cta">
                Request Access
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section className="flex-1 flex items-center justify-center relative pt-28 pb-20 px-6">

        {/* Background glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/3 w-[600px] h-[600px] bg-blue-600/6 rounded-full blur-[120px]" />
          <div className="absolute bottom-1/3 right-1/4 w-[500px] h-[500px] bg-blue-400/4 rounded-full blur-[100px]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[1px] bg-gradient-to-r from-transparent via-border/60 to-transparent" />
        </div>

        <div className="max-w-4xl mx-auto text-center relative">

          {/* Badge */}
          <div className="inline-flex items-center gap-2 mb-7" data-testid="badge-infrastructure">
            <span className="inline-flex items-center px-3 py-1 rounded-full border border-blue-500/40 bg-blue-500/8 text-[10px] font-bold tracking-[0.18em] text-blue-400 uppercase select-none">
              Claims Intelligence Infrastructure™
            </span>
          </div>

          {/* Headline */}
          <h1
            className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black tracking-tight leading-[1.05] mb-6"
            data-testid="text-hero-title"
          >
            <span className="block text-foreground">Insurance Claim Intelligence.</span>
            <span className="block bg-gradient-to-r from-blue-400 via-blue-300 to-blue-500 bg-clip-text text-transparent">
              Built for Contractors.
            </span>
          </h1>

          {/* Body */}
          <p
            className="text-base md:text-lg text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed"
            data-testid="text-hero-subtext"
          >
            Upload claim documents, estimates, denial letters, photos, emails, and communications.
            ClaimSignal transforms insurance claim files into structured intelligence — identifying missing scope,
            tracking adjuster and carrier patterns, detecting claim risks, and recommending next actions.
          </p>

          {/* Feature grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 mb-10 max-w-3xl mx-auto text-left" data-testid="list-features">
            {FEATURES.map((feature) => (
              <div key={feature} className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <span className="text-sm text-foreground/85 leading-snug">{feature}</span>
              </div>
            ))}
          </div>

          {/* Audience line */}
          <p className="text-xs text-muted-foreground/70 mb-8 tracking-wide" data-testid="text-audience">
            Built for Roofing Contractors, Restoration Companies, Insurance Consultants, Public Adjusters, and Claims Professionals.
          </p>

          {/* CTAs */}
          <div className="flex items-center justify-center gap-4 flex-wrap mb-5">
            <Link href="/founding-partner-apply">
              <Button
                size="lg"
                className="px-8 h-12 text-base font-semibold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/30"
                data-testid="button-hero-cta"
              >
                Request Founder Access
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            <Link href="/platform-overview">
              <Button
                variant="outline"
                size="lg"
                className="px-8 h-12 text-base font-semibold border-border/60 hover:border-border"
                data-testid="button-hero-secondary"
              >
                Explore Platform
              </Button>
            </Link>
          </div>

          {/* Trust statement */}
          <p className="text-xs text-muted-foreground/60 max-w-lg mx-auto leading-relaxed" data-testid="text-trust-statement">
            Limited Founder Access Available. Early members receive lifetime founder pricing, priority feature access,
            and direct input into platform development.
          </p>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="border-t border-border/40 py-6 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-muted-foreground">
          <span className="shrink-0">© {new Date().getFullYear()} ClaimSignal™. All Rights Reserved.</span>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <Link href="/investor-access" className="hover:text-foreground transition-colors" data-testid="link-footer-investor-access">
              Investor Access
            </Link>
            <Link href="/founder-access" className="hover:text-foreground transition-colors" data-testid="link-footer-founder-login">
              Founder Login
            </Link>
            <Link href="/login" className="hover:text-foreground transition-colors" data-testid="link-footer-platform-login">
              Platform Login
            </Link>
            <a href="https://www.claimsignal1.com" className="hover:text-foreground transition-colors" data-testid="link-footer-website">
              www.claimsignal1.com
            </a>
            <a href="mailto:claimsignal1@gmail.com" className="hover:text-foreground transition-colors" data-testid="link-footer-email">
              claimsignal1@gmail.com
            </a>
          </div>
        </div>
      </footer>

    </div>
  );
}
