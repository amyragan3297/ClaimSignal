import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Check, Loader2, ShieldAlert, Gift, Star, AlertCircle } from "lucide-react";
import { authFetch } from "@/lib/api";

interface Price {
  id: string;
  unit_amount: number;
  currency: string;
  recurring: { interval: string } | null;
}

interface Product {
  id: string;
  name: string;
  description: string;
  prices: Price[];
}

export default function Pricing() {
  const [, setLocation] = useLocation();
  const { authenticated, userType, needsSubscription, refreshSession } = useAuth();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/stripe/products')
      .then(res => res.json())
      .then(data => {
        setProducts(data.products || []);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
        toast({ title: "Error", description: "Failed to load pricing", variant: "destructive" });
      });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    if (sessionId) {
      authFetch(`/api/stripe/verify-subscription?session_id=${sessionId}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            refreshSession();
            toast({ title: "Success", description: "Your subscription is now active!" });
            setLocation("/");
          }
        });
    }
  }, []);

  const handleCheckout = async (priceId: string) => {
    if (!authenticated) {
      setLocation("/login");
      return;
    }

    if (userType === 'team') {
      toast({ title: "Team accounts", description: "Team accounts don't require a subscription.", variant: "default" });
      setLocation("/");
      return;
    }

    setCheckoutLoading(priceId);
    try {
      const res = await authFetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId }),
      });

      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast({ title: "Error", description: data.error || "Failed to start checkout", variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to start checkout", variant: "destructive" });
    }
    setCheckoutLoading(null);
  };

  const formatPrice = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  const tierFeatures: Record<string, { features: string[]; bonus: string; highlight?: boolean }> = {
    'ClaimSignal Basic': {
      features: [
        "Access to adjuster database",
        "Basic claim tracking",
        "Document storage (100 docs)",
        "Email support",
      ],
      bonus: "Free Training Session ($149 value)",
    },
    'ClaimSignal Pro': {
      features: [
        "Full adjuster database access",
        "Advanced claim analytics",
        "Unlimited document storage",
        "AI tactical advisor",
        "Priority email support",
      ],
      bonus: "Free Carrier Report ($99 value)",
      highlight: true,
    },
    'ClaimSignal Enterprise': {
      features: [
        "Everything in Pro",
        "Team collaboration tools",
        "Advanced analytics dashboard",
        "API access",
        "Dedicated support",
        "Custom integrations",
      ],
      bonus: "Free Expert Review ($299 value)",
    },
  };

  const defaultFeatures = [
    "Full access to adjuster database",
    "Claim tracking & analytics",
    "Document management",
    "AI tactical advisor",
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="max-w-4xl mx-auto py-12">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-2 mb-4">
            <ShieldAlert className="h-8 w-8 text-amber-500" />
            <h1 className="text-3xl font-bold text-white">ClaimSignal</h1>
          </div>
          <h2 className="text-2xl font-semibold text-white mb-2">Choose Your Plan</h2>
          <p className="text-slate-400">Get full access to ClaimSignal's powerful tools</p>
        </div>

        {loading ? (
          <div className="flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
          </div>
        ) : products.length === 0 ? (
          <Card className="bg-slate-800/50 border-slate-700 max-w-md mx-auto">
            <CardHeader>
              <CardTitle className="text-white">Pro Access</CardTitle>
              <CardDescription className="text-slate-400">
                Full access to all features
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-slate-300 mb-4">
                Subscription products are being configured. Please check back soon.
              </p>
              <ul className="space-y-2">
                {defaultFeatures.map((feature, i) => (
                  <li key={i} className="flex items-center gap-2 text-slate-300">
                    <Check className="h-4 w-4 text-green-500" />
                    {feature}
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button 
                onClick={() => setLocation("/login")}
                className="w-full bg-amber-600 hover:bg-amber-500"
                data-testid="button-back-login"
              >
                Back to Login
              </Button>
            </CardFooter>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {products
              .filter(p => p.prices.some(price => price.recurring))
              .sort((a, b) => {
                const order = ['ClaimSignal Basic', 'ClaimSignal Pro', 'ClaimSignal Enterprise'];
                return order.indexOf(a.name) - order.indexOf(b.name);
              })
              .map((product) => {
                const tier = tierFeatures[product.name];
                const features = tier?.features || defaultFeatures;
                const isHighlighted = tier?.highlight;
                const monthlyPrice = product.prices.find(p => p.recurring?.interval === 'month');
                const yearlyPrice = product.prices.find(p => p.recurring?.interval === 'year');

                return (
                  <Card 
                    key={product.id} 
                    className={`bg-slate-800/50 border-slate-700 relative ${isHighlighted ? 'ring-2 ring-amber-500' : ''}`}
                  >
                    {isHighlighted && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-500 text-black text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                        <Star className="h-3 w-3" /> Most Popular
                      </div>
                    )}
                    <CardHeader>
                      <CardTitle className="text-white">{product.name.replace('ClaimSignal ', '')}</CardTitle>
                      <CardDescription className="text-slate-400">
                        {product.description || "Full access to all features"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {monthlyPrice && (
                        <div className="mb-2">
                          <div className="text-3xl font-bold text-white">
                            {formatPrice(monthlyPrice.unit_amount, monthlyPrice.currency)}
                            <span className="text-lg font-normal text-slate-400">/month</span>
                          </div>
                        </div>
                      )}
                      {yearlyPrice && (
                        <div className="mb-4 p-3 bg-green-900/30 border border-green-700/50 rounded-lg">
                          <div className="text-lg font-semibold text-green-400">
                            {formatPrice(yearlyPrice.unit_amount, yearlyPrice.currency)}/year
                          </div>
                          {tier?.bonus && (
                            <div className="flex items-center gap-1 text-sm text-green-300 mt-1">
                              <Gift className="h-4 w-4" />
                              {tier.bonus}
                            </div>
                          )}
                        </div>
                      )}
                      <ul className="space-y-2 mt-4">
                        {features.map((feature, i) => (
                          <li key={i} className="flex items-center gap-2 text-slate-300 text-sm">
                            <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                    <CardFooter className="flex flex-col gap-2">
                      {monthlyPrice && (
                        <Button
                          onClick={() => handleCheckout(monthlyPrice.id)}
                          variant="outline"
                          className="w-full border-slate-600 text-slate-300 hover:bg-slate-700"
                          disabled={checkoutLoading === monthlyPrice.id}
                          data-testid={`button-checkout-monthly-${product.id}`}
                        >
                          {checkoutLoading === monthlyPrice.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          Start Monthly
                        </Button>
                      )}
                      {yearlyPrice && (
                        <Button
                          onClick={() => handleCheckout(yearlyPrice.id)}
                          className="w-full bg-amber-600 hover:bg-amber-500"
                          disabled={checkoutLoading === yearlyPrice.id}
                          data-testid={`button-checkout-yearly-${product.id}`}
                        >
                          {checkoutLoading === yearlyPrice.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          Start Yearly + Bonus
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                );
              })}
          </div>
        )}

        {/* One-Time Add-ons Section */}
        <div className="mt-16">
          <h2 className="text-2xl font-semibold text-white text-center mb-8">One-Time Add-ons</h2>
          
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left text-slate-300 font-semibold p-4">Add-on</th>
                  <th className="text-left text-slate-300 font-semibold p-4">Price</th>
                  <th className="text-left text-slate-300 font-semibold p-4">What's Included</th>
                </tr>
              </thead>
              <tbody className="text-slate-300 text-sm">
                <tr className="border-b border-slate-700/50">
                  <td className="p-4 font-medium">Carrier Intelligence Report</td>
                  <td className="p-4 text-amber-400">One-time $99</td>
                  <td className="p-4">Deep-dive analysis of a specific carrier's behavior and patterns.</td>
                </tr>
                <tr className="border-b border-slate-700/50">
                  <td className="p-4 font-medium">Adjuster Deep Dive</td>
                  <td className="p-4 text-amber-400">One-time $99</td>
                  <td className="p-4">Detailed behavioral analysis of a specific adjuster and recommended communication approach.</td>
                </tr>
                <tr className="border-b border-slate-700/50">
                  <td className="p-4 font-medium">Tier 1 Quick Denial Triage</td>
                  <td className="p-4 text-amber-400">One-time $99</td>
                  <td className="p-4">Review of denial letter plus brief guidance on the most likely path forward. No deep claim file review. User must provide the denial letter and any supporting documents available.</td>
                </tr>
                <tr className="border-b border-slate-700/50">
                  <td className="p-4 font-medium">Tier 2 Denial Deep Dive</td>
                  <td className="p-4 text-amber-400">Starting at $199</td>
                  <td className="p-4">Review of denial letter plus claim file review. Includes evidence gaps checklist, rebuttal outline, and escalation steps. Final price depends on documentation volume and complexity.</td>
                </tr>
                <tr className="border-b border-slate-700/50">
                  <td className="p-4 font-medium">Tier 3 Full Claim Support and Training</td>
                  <td className="p-4 text-amber-400">Starting at $399</td>
                  <td className="p-4">Start-to-finish claim support plus documentation standards, supplement strategy, escalation cadence, and closeout checklist. Final price depends on scope, time, attendees, and claim file data reviewed.</td>
                </tr>
                <tr className="border-b border-slate-700/50">
                  <td className="p-4 font-medium">Expert Claim Review</td>
                  <td className="p-4 text-amber-400">Starting at $159.99</td>
                  <td className="p-4">Professional review of your claim. Final price depends on complexity. User must provide all documentation and be available for Google Meet/Zoom calls when requested.</td>
                </tr>
                <tr>
                  <td className="p-4 font-medium">Training</td>
                  <td className="p-4 text-amber-400">Varies</td>
                  <td className="p-4">Claims process, estimating and documentation workflows, supplements and escalation, sales and objection handling, customer communication, and field operations. Pricing varies based on scope, data reviewed, and time required.</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Important Notes */}
          <div className="mt-8 bg-slate-800/30 border border-amber-500/30 rounded-lg p-6">
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              <h3 className="text-lg font-semibold text-white">Important Notes</h3>
            </div>
            <ul className="space-y-2 text-slate-300 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-amber-500 mt-1">•</span>
                <span>Educational guidance only. Not legal advice and not public adjuster services.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-500 mt-1">•</span>
                <span>User must provide complete documentation. Recommendations are based on information provided.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-500 mt-1">•</span>
                <span>Pricing and scope may change if file volume or complexity changes.</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="text-center mt-8">
          <Button
            variant="ghost"
            onClick={() => setLocation("/login")}
            className="text-slate-400 hover:text-white"
            data-testid="button-back"
          >
            Back to Login
          </Button>
        </div>
      </div>
    </div>
  );
}
