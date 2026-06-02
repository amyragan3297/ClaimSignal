/* eslint-disable @typescript-eslint/no-explicit-any */
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CreditCard, Shield, Loader2 } from "lucide-react";
import { useState } from "react";

export default function BillingPage() {
  const { data: auth, refetch } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const billing = auth?.billing;
  const daysLeft = billing?.trialEndDate
    ? Math.max(0, Math.ceil((new Date(billing.trialEndDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  const isActive = billing?.subscriptionStatus === "active";
  const isTrialing = billing?.subscriptionStatus === "trialing" && billing.trialEndDate && new Date(billing.trialEndDate) > new Date();
  const needsPayment = !isActive && !isTrialing;

  async function handleCheckout() {
    try {
      setLoading(true);
      const res = await apiRequest("POST", "/api/billing/checkout", { planType: billing?.planType || "pro" });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (data.fallback) {
        toast({ title: "Development Mode", description: data.message });
        await refetch();
      }
    } catch (err: any) {
      toast({ title: "Checkout failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-billing-title">Billing</h1>
        <p className="text-sm text-muted-foreground">Manage your subscription and payment</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">Subscription Status</CardTitle>
            <CreditCard className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Status</span>
              <Badge
                variant={isActive ? "default" : isTrialing ? "secondary" : "destructive"}
                className="capitalize"
                data-testid="badge-subscription-status"
              >
                {billing?.subscriptionStatus || "inactive"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Plan</span>
              <span className="text-sm font-medium" data-testid="text-plan-type">{billing?.planType === "founder" ? "Founding Partner" : billing?.planType ? billing.planType.charAt(0).toUpperCase() + billing.planType.slice(1) : "None"}</span>
            </div>
            {isTrialing && daysLeft !== null && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Trial Remaining</span>
                <span className="text-sm font-medium" data-testid="text-trial-days">{daysLeft} days</span>
              </div>
            )}
            {billing?.trialEndDate && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Trial Ends</span>
                <span className="text-sm text-muted-foreground">{new Date(billing.trialEndDate).toLocaleDateString()}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base" data-testid="text-plan-name">
              {billing?.planType === "founder" ? "Founding Partner" : billing?.planType ? billing.planType.charAt(0).toUpperCase() + billing.planType.slice(1) : "Free"} Plan
            </CardTitle>
            <Shield className="w-4 h-4 text-primary" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Price</span>
              <span className="text-sm font-medium" data-testid="text-plan-price">
                {billing?.planType === "founder" ? "$79/mo"
                  : billing?.planType === "pro" ? "$199/mo"
                  : billing?.planType === "team" ? "$399/mo"
                  : billing?.planType === "enterprise" ? "Custom"
                  : "N/A"}
              </span>
            </div>
            {billing?.planType === "founder" && (
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li className="flex items-center gap-2"><Shield className="w-3 h-3 text-primary" /> Founding Partner access</li>
                <li className="flex items-center gap-2"><CreditCard className="w-3 h-3 text-primary" /> Permanently locked pricing</li>
              </ul>
            )}
            {(billing?.planType === "pro" || billing?.planType === "team") && (
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li className="flex items-center gap-2"><Shield className="w-3 h-3 text-primary" /> No trial - immediate access</li>
                <li className="flex items-center gap-2"><Shield className="w-3 h-3 text-primary" /> Full platform access</li>
              </ul>
            )}
            {billing?.planType === "enterprise" && (
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li className="flex items-center gap-2"><Shield className="w-3 h-3 text-primary" /> Custom enterprise plan</li>
                <li className="flex items-center gap-2"><Shield className="w-3 h-3 text-primary" /> Dedicated support</li>
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {needsPayment && (
        <Card className="border-primary/30">
          <CardContent className="p-6 text-center space-y-4">
            <h3 className="text-lg font-semibold">Subscription Required</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Your trial has expired or no payment method is on file. Complete checkout to continue using ClaimSignal™.
            </p>
            <Button onClick={handleCheckout} disabled={loading} data-testid="button-checkout">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Complete Checkout
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
