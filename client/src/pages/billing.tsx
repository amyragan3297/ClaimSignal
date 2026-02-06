import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { 
  CreditCard, 
  Receipt, 
  Download, 
  ExternalLink, 
  Loader2, 
  ArrowLeft,
  CheckCircle,
  Clock,
  AlertCircle,
  Package,
  ShoppingCart
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { authFetch } from "@/lib/api";

interface Invoice {
  id: string;
  number: string;
  status: string;
  amount_due: number;
  amount_paid: number;
  currency: string;
  created: number;
  invoice_pdf: string | null;
  hosted_invoice_url: string | null;
  description: string;
}

interface Subscription {
  id: string;
  status: string;
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end: boolean;
  product_name: string;
  price_amount: number;
  price_currency: string;
  price_interval: string;
}

interface Addon {
  id: string;
  name: string;
  description: string;
  category: string;
  prices: { id: string; unit_amount: number; currency: string }[];
}

export default function Billing() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payment') === 'success') {
      toast({ title: "Payment Successful", description: "Thank you for your purchase!" });
      window.history.replaceState({}, '', '/billing');
    }
  }, []);

  useEffect(() => {
    Promise.all([
      authFetch('/api/stripe/subscription').then(r => r.json()),
      authFetch('/api/stripe/invoices').then(r => r.json()),
      authFetch('/api/stripe/addons').then(r => r.json()),
    ]).then(([subData, invData, addonData]) => {
      setSubscription(subData.subscription);
      setInvoices(invData.invoices || []);
      setAddons(addonData.addons || []);
      setLoading(false);
    }).catch(() => {
      setLoading(false);
      toast({ title: "Error", description: "Failed to load billing data", variant: "destructive" });
    });
  }, []);

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const res = await authFetch('/api/stripe/portal', {
        method: 'POST',
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast({ title: "Error", description: data.error || "Failed to open portal", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to open billing portal", variant: "destructive" });
    }
    setPortalLoading(false);
  };

  const handlePurchaseAddon = async (priceId: string) => {
    setCheckoutLoading(priceId);
    try {
      const res = await authFetch('/api/stripe/one-time-checkout', {
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
    } catch {
      toast({ title: "Error", description: "Failed to process purchase", variant: "destructive" });
    }
    setCheckoutLoading(null);
  };

  const formatPrice = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return <Badge className="bg-green-600"><CheckCircle className="w-3 h-3 mr-1" /> Paid</Badge>;
      case 'open':
        return <Badge className="bg-blue-600"><Clock className="w-3 h-3 mr-1" /> Open</Badge>;
      case 'draft':
        return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" /> Draft</Badge>;
      case 'uncollectible':
      case 'void':
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" /> {status}</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <Loader2 className="h-8 w-8 animate-spin text-amber-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="max-w-4xl mx-auto py-8">
        <Button
          variant="ghost"
          onClick={() => setLocation("/")}
          className="text-slate-400 hover:text-white mb-6"
          data-testid="button-back-home"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>

        <h1 className="text-3xl font-bold text-white mb-8">Billing & Subscription</h1>

        <Tabs defaultValue="subscription" className="space-y-6">
          <TabsList className="bg-slate-800">
            <TabsTrigger value="subscription" data-testid="tab-subscription">
              <CreditCard className="w-4 h-4 mr-2" />
              Subscription
            </TabsTrigger>
            <TabsTrigger value="invoices" data-testid="tab-invoices">
              <Receipt className="w-4 h-4 mr-2" />
              Invoices
            </TabsTrigger>
            <TabsTrigger value="addons" data-testid="tab-addons">
              <Package className="w-4 h-4 mr-2" />
              Add-ons
            </TabsTrigger>
          </TabsList>

          <TabsContent value="subscription">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">Your Subscription</CardTitle>
                <CardDescription className="text-slate-400">
                  Manage your subscription and billing details
                </CardDescription>
              </CardHeader>
              <CardContent>
                {subscription ? (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg">
                      <div>
                        <h3 className="text-lg font-semibold text-white">{subscription.product_name}</h3>
                        <p className="text-slate-400">
                          {formatPrice(subscription.price_amount, subscription.price_currency)}/{subscription.price_interval}
                        </p>
                      </div>
                      <Badge className={subscription.status === 'active' ? 'bg-green-600' : 'bg-yellow-600'}>
                        {subscription.status === 'active' ? 'Active' : subscription.status}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-slate-700/30 rounded-lg">
                        <p className="text-sm text-slate-400">Current Period</p>
                        <p className="text-white font-medium">
                          {formatDate(subscription.current_period_start)} - {formatDate(subscription.current_period_end)}
                        </p>
                      </div>
                      <div className="p-4 bg-slate-700/30 rounded-lg">
                        <p className="text-sm text-slate-400">Renewal</p>
                        <p className="text-white font-medium">
                          {subscription.cancel_at_period_end ? 'Cancels at period end' : 'Auto-renews'}
                        </p>
                      </div>
                    </div>

                    <Button
                      onClick={handleManageSubscription}
                      disabled={portalLoading}
                      className="w-full bg-amber-600 hover:bg-amber-500"
                      data-testid="button-manage-subscription"
                    >
                      {portalLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Manage Subscription
                    </Button>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <CreditCard className="h-12 w-12 text-slate-500 mx-auto mb-4" />
                    <p className="text-slate-400 mb-4">No active subscription</p>
                    <Button
                      onClick={() => setLocation("/pricing")}
                      className="bg-amber-600 hover:bg-amber-500"
                      data-testid="button-view-plans"
                    >
                      View Plans
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="invoices">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">Invoice History</CardTitle>
                <CardDescription className="text-slate-400">
                  View and download your past invoices
                </CardDescription>
              </CardHeader>
              <CardContent>
                {invoices.length === 0 ? (
                  <div className="text-center py-8">
                    <Receipt className="h-12 w-12 text-slate-500 mx-auto mb-4" />
                    <p className="text-slate-400">No invoices yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {invoices.map((invoice) => (
                      <div
                        key={invoice.id}
                        className="flex items-center justify-between p-4 bg-slate-700/30 rounded-lg"
                        data-testid={`invoice-${invoice.id}`}
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <span className="text-white font-medium">{invoice.number || invoice.id.slice(-8)}</span>
                            {getStatusBadge(invoice.status || 'unknown')}
                          </div>
                          <p className="text-sm text-slate-400 mt-1">
                            {formatDate(invoice.created)} - {invoice.description}
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-white font-medium">
                            {formatPrice(invoice.amount_paid || invoice.amount_due, invoice.currency)}
                          </span>
                          <div className="flex gap-2">
                            {invoice.invoice_pdf && (
                              <Button
                                variant="ghost"
                                size="sm"
                                asChild
                                className="text-slate-400 hover:text-white"
                              >
                                <a href={invoice.invoice_pdf} target="_blank" rel="noopener noreferrer">
                                  <Download className="h-4 w-4" />
                                </a>
                              </Button>
                            )}
                            {invoice.hosted_invoice_url && (
                              <Button
                                variant="ghost"
                                size="sm"
                                asChild
                                className="text-slate-400 hover:text-white"
                              >
                                <a href={invoice.hosted_invoice_url} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="addons">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white">Add-on Services</CardTitle>
                <CardDescription className="text-slate-400">
                  One-time purchases to enhance your experience
                </CardDescription>
              </CardHeader>
              <CardContent>
                {addons.length === 0 ? (
                  <div className="text-center py-8">
                    <Package className="h-12 w-12 text-slate-500 mx-auto mb-4" />
                    <p className="text-slate-400">No add-on services available</p>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {addons.map((addon) => (
                      <div
                        key={addon.id}
                        className="p-4 bg-slate-700/30 rounded-lg border border-slate-600"
                        data-testid={`addon-${addon.id}`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h3 className="text-white font-medium">{addon.name}</h3>
                            <p className="text-sm text-slate-400 mt-1">{addon.description}</p>
                          </div>
                          <Badge variant="outline" className="text-slate-400">
                            {addon.category}
                          </Badge>
                        </div>
                        {addon.prices[0] && (
                          <div className="flex items-center justify-between mt-4">
                            <span className="text-lg font-bold text-white">
                              {formatPrice(addon.prices[0].unit_amount, addon.prices[0].currency)}
                            </span>
                            <Button
                              size="sm"
                              onClick={() => handlePurchaseAddon(addon.prices[0].id)}
                              disabled={checkoutLoading === addon.prices[0].id}
                              className="bg-amber-600 hover:bg-amber-500"
                              data-testid={`button-purchase-${addon.id}`}
                            >
                              {checkoutLoading === addon.prices[0].id ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <ShoppingCart className="mr-2 h-4 w-4" />
                              )}
                              Purchase
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
