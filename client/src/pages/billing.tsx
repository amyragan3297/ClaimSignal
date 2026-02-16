import { useAuth } from "@/lib/auth";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Check, CreditCard, Shield, Zap, Users, Building2 } from "lucide-react";

const tiers = [
  {
    id: "founder",
    name: "Founder",
    price: "$149",
    period: "/mo",
    icon: Shield,
    description: "Full unmasked access with founder benefits.",
    features: [
      "Full unmasked data access",
      "All intelligence modules",
      "14-day free trial",
      "Priority support",
      "Founder advisory input",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$79",
    period: "/mo",
    icon: Zap,
    description: "Essential claim management.",
    features: [
      "Masked data access",
      "Friction scoring",
      "Claims management",
      "Basic reporting",
      "Email support",
    ],
  },
  {
    id: "team",
    name: "Team",
    price: "$199",
    period: "/mo",
    icon: Users,
    description: "For growing teams.",
    features: [
      "Up to 10 seats",
      "Masked data access",
      "All intelligence modules",
      "Team analytics",
      "Priority support",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    period: "",
    icon: Building2,
    description: "Dedicated infrastructure.",
    features: [
      "Unlimited seats",
      "Custom data policies",
      "Dedicated infrastructure",
      "SLA guarantee",
      "Custom integrations",
    ],
  },
];

export default function BillingPage() {
  const { user, refetch } = useAuth();
  const { toast } = useToast();
  const currentTier = user?.subscription?.tier || "pro";

  const upgradeMutation = useMutation({
    mutationFn: async (tier: string) => {
      await apiRequest("POST", "/api/billing/checkout", { tier });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      refetch();
      toast({ title: "Subscription updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Billing error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-billing-title">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Manage your subscription and billing details
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
          <CardTitle className="text-base font-semibold">Current Plan</CardTitle>
          <Badge variant="outline" className="capitalize" data-testid="badge-current-tier">{currentTier}</Badge>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <Badge variant="outline" className="text-xs capitalize" data-testid="badge-subscription-status">
              {user?.subscription?.status || "active"}
            </Badge>
          </div>
          {user?.subscription?.trialEnd && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Trial Ends</span>
              <span className="text-sm font-medium" data-testid="text-trial-end">
                {new Date(user.subscription.trialEnd).toLocaleDateString()}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Seat Limit</span>
            <span className="text-sm font-medium" data-testid="text-seat-limit">
              {user?.subscription?.seatLimit || 1}
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {tiers.map((tier) => {
          const isCurrent = tier.id === currentTier;
          return (
            <Card
              key={tier.id}
              className={isCurrent ? "border-primary" : ""}
              data-testid={`card-billing-tier-${tier.id}`}
            >
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-3">
                  <tier.icon className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold">{tier.name}</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-4">{tier.description}</p>
                <div className="mb-4">
                  <span className="text-2xl font-bold">{tier.price}</span>
                  <span className="text-sm text-muted-foreground">{tier.period}</span>
                </div>
                <div className="space-y-2 mb-6">
                  {tier.features.map((f) => (
                    <div key={f} className="flex items-center gap-2 text-sm">
                      <Check className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="text-muted-foreground">{f}</span>
                    </div>
                  ))}
                </div>
                <Button
                  className="w-full"
                  variant={isCurrent ? "secondary" : "outline"}
                  disabled={isCurrent || tier.id === "enterprise"}
                  onClick={() => upgradeMutation.mutate(tier.id)}
                  data-testid={`button-select-tier-${tier.id}`}
                >
                  {isCurrent ? "Current Plan" : tier.id === "enterprise" ? "Contact Sales" : "Select Plan"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
