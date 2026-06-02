import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Shield,
  ArrowLeft,
  BarChart3,
  Lock,
  Layers,
  Target,
} from "lucide-react";

const metrics = [
  { label: "Intelligence Modules", value: "6", icon: Layers },
  { label: "Data Points Per Claim", value: "28+", icon: BarChart3 },
  { label: "Tier Architecture", value: "4-tier", icon: Target },
  { label: "Compliance Ready", value: "SOC 2", icon: Lock },
];

const highlights = [
  {
    title: "Market Opportunity",
    description: "The property claims industry processes $80B+ annually with minimal technology adoption. ClaimSignal™ brings structured intelligence to an underserved market.",
  },
  {
    title: "Product Moat",
    description: "Six proprietary intelligence layers create compounding value. Friction scoring, repairability modeling, and predictive approval engines have no direct competitors.",
  },
  {
    title: "Revenue Model",
    description: "Multi-tier SaaS with high-margin subscriptions. Founder tier creates early revenue lock-in. Team and Enterprise tiers drive expansion revenue.",
  },
  {
    title: "Go-to-Market",
    description: "Direct sales to restoration contractors, public adjusters, and insurance consultants. Bottom-up adoption with team expansion upsell path.",
  },
];

export default function InvestorPage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4 flex-wrap px-6 py-4">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            <span className="text-lg font-semibold tracking-tight">ClaimSignal&#8482;</span>
          </div>
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="button-back-home">
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Button>
          </Link>
        </div>
      </nav>

      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-4">
              Investor Relations
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4" data-testid="text-investor-title">
              Building the Intelligence Layer for Property Claims
            </h1>
            <p className="text-lg text-muted-foreground max-w-3xl mx-auto leading-relaxed">
              ClaimSignal™ is an operational intelligence platform that transforms how property claims are processed, analyzed, and resolved.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
            {metrics.map((m) => (
              <Card key={m.label} className="text-center" data-testid={`card-metric-${m.label.toLowerCase().replace(/\s+/g, "-")}`}>
                <CardContent className="p-6">
                  <m.icon className="w-6 h-6 text-primary mx-auto mb-3" />
                  <p className="text-2xl font-bold mb-1">{m.value}</p>
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid md:grid-cols-2 gap-4 mb-16">
            {highlights.map((h) => (
              <Card key={h.title} data-testid={`card-highlight-${h.title.toLowerCase().replace(/\s+/g, "-")}`}>
                <CardContent className="p-6">
                  <h3 className="font-semibold mb-2">{h.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{h.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardContent className="p-8 text-center">
              <h2 className="text-xl font-semibold mb-2">Interested in ClaimSignal&#8482;?</h2>
              <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                For investment inquiries, partnership opportunities, or enterprise discussions, reach out to our team.
              </p>
              <Button data-testid="button-contact-team">
                Contact Team
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
