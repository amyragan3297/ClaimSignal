import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Shield, ArrowRight } from "lucide-react";
import logoImg from "@assets/claimsignal_logo_transparent.png";
import { PLANS } from "@/lib/pricing";

const planCards = [
  PLANS.founder,
  PLANS.individual,
  PLANS.team,
  PLANS.enterprise,
] as const;

const planCardBg: Record<string, string> = {
  founder: "border-amber-500/20",
  individual: "border-border/50",
  team: "border-border/50",
  enterprise: "border-border/50",
};

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/90 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <Link href="/">
            <div className="flex items-center" data-testid="img-logo">
              <img src={logoImg} alt="ClaimSignal" className="h-10 w-auto object-contain" />
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">Log In</Button>
            </Link>
            <Link href="/founding-partner-apply">
              <Button size="sm">Request Founder Access</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-16 px-6 text-center">
        <div className="max-w-3xl mx-auto">
          <Badge variant="outline" className="mb-5 text-xs tracking-wide uppercase px-3 py-1">
            Pricing
          </Badge>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
            Simple pricing for every claim team.
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto text-sm leading-relaxed">
            All plans include full platform access, claim intelligence, and evidence management.
          </p>
        </div>
      </section>

      {/* Plans */}
      <section className="pb-24 px-6">
        <div className="max-w-6xl mx-auto grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {planCards.map((plan) => (
            <Card
              key={plan.id}
              className={`border ${planCardBg[plan.id]} bg-card/60 flex flex-col`}
              data-testid={`card-plan-${plan.id}`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{plan.name}</CardTitle>
                  {plan.badge && (
                    <Badge className="text-xs bg-amber-500/20 text-amber-400 border-amber-500/30">
                      {plan.badge}
                    </Badge>
                  )}
                </div>
                <div className="mt-2">
                  <span className="text-2xl font-bold tracking-tight">{plan.priceLabel}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{plan.description}</p>
                {plan.availability && (
                  <p className="text-[11px] text-muted-foreground/80 mt-0.5">{plan.availability}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-4 flex-1 flex flex-col">
                <ul className="space-y-2 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <Check className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                      <span className="leading-relaxed">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link href={plan.id === "founder" ? "/founding-partner-apply" : plan.id === "enterprise" ? "/enterprise-contact" : `/login?tab=register&plan=${plan.id}`}>
                  <Button className="w-full" size="sm" variant={plan.id === "founder" ? "default" : "outline"} data-testid={`button-plan-${plan.id}`}>
                    {plan.id === "enterprise" ? (
                      <>
                        Contact Sales
                        <ArrowRight className="w-3.5 h-3.5 ml-1" />
                      </>
                    ) : (
                      <>
                        {plan.ctaLabel}
                        <ArrowRight className="w-3.5 h-3.5 ml-1" />
                      </>
                    )}
                  </Button>
                </Link>
                <p className="text-[11px] text-center text-muted-foreground">{plan.note}</p>
              </CardContent>
            </Card>
          ))}
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
                <a href="/" className="hover:text-foreground transition-colors">Overview</a>
                <a href="/" className="hover:text-foreground transition-colors">Security</a>
                <Link href="/login" className="hover:text-foreground transition-colors">Log In</Link>
              </div>
              <div className="flex flex-col gap-2">
                <span className="font-semibold text-foreground uppercase tracking-wider text-[10px]">Contact</span>
                <a href="mailto:claimsignal1@gmail.com" className="hover:text-foreground transition-colors">claimsignal1@gmail.com</a>
                <a href="/brand-assets" className="hover:text-foreground transition-colors">Brand Assets</a>
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
