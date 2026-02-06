import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Package, CheckCircle, Clock, XCircle, DollarSign, Mail, User, FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { authFetch } from "@/lib/api";

interface AddonPurchase {
  id: string;
  userId: string | null;
  customerEmail: string;
  customerName: string | null;
  addonType: string;
  addonName: string;
  amount: number;
  status: string;
  claimDetails: string | null;
  notes: string | null;
  fulfilledAt: string | null;
  createdAt: string;
}

export default function AdminAddons() {
  const [filter, setFilter] = useState<string>('all');
  const [selectedPurchase, setSelectedPurchase] = useState<string | null>(null);
  const [fulfillmentNotes, setFulfillmentNotes] = useState<string>('');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: purchases, isLoading } = useQuery<AddonPurchase[]>({
    queryKey: ['/api/admin/addon-purchases', filter],
    queryFn: async () => {
      const url = filter === 'all' 
        ? '/api/admin/addon-purchases' 
        : `/api/admin/addon-purchases?status=${filter}`;
      const res = await authFetch(url);
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes?: string }) => {
      const res = await authFetch(`/api/admin/addon-purchases/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, notes }),
      });
      if (!res.ok) throw new Error('Failed to update');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/addon-purchases'] });
      setSelectedPurchase(null);
      setFulfillmentNotes('');
      toast({ title: 'Purchase updated', description: 'Status has been updated successfully.' });
    },
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="bg-amber-500/20 text-amber-400 px-2 py-1 rounded text-xs flex items-center gap-1"><Clock className="w-3 h-3" /> Pending</span>;
      case 'fulfilled':
        return <span className="bg-green-500/20 text-green-400 px-2 py-1 rounded text-xs flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Fulfilled</span>;
      case 'cancelled':
        return <span className="bg-red-500/20 text-red-400 px-2 py-1 rounded text-xs flex items-center gap-1"><XCircle className="w-3 h-3" /> Cancelled</span>;
      default:
        return <span className="bg-muted px-2 py-1 rounded text-xs">{status}</span>;
    }
  };

  const getAddonIcon = (type: string) => {
    switch (type) {
      case 'expert_review':
        return <FileText className="w-5 h-5 text-amber-500" />;
      case 'carrier_report':
        return <Package className="w-5 h-5 text-blue-500" />;
      case 'training_session':
        return <User className="w-5 h-5 text-purple-500" />;
      default:
        return <Package className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const pendingCount = purchases?.filter(p => p.status === 'pending').length || 0;

  return (
    <Layout>
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Package className="w-6 h-6 text-amber-500" />
                Add-on Purchases
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Manage customer add-on service requests
              </p>
            </div>
            {pendingCount > 0 && (
              <div className="bg-amber-500/20 text-amber-400 px-4 py-2 rounded-lg flex items-center gap-2">
                <Clock className="w-4 h-4" />
                <span className="font-semibold">{pendingCount} pending</span>
              </div>
            )}
          </div>

          <div className="flex gap-2 mb-6">
            {['all', 'pending', 'fulfilled', 'cancelled'].map((f) => (
              <Button
                key={f}
                variant={filter === f ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter(f)}
                className="capitalize"
              >
                {f}
              </Button>
            ))}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : purchases?.length === 0 ? (
            <div className="bg-card/60 border border-border/50 rounded-xl p-12 text-center">
              <Package className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold mb-2">No purchases yet</h3>
              <p className="text-sm text-muted-foreground">
                Add-on purchases will appear here when customers buy them.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {purchases?.map((purchase) => (
                <div
                  key={purchase.id}
                  className={`bg-card/60 border rounded-xl p-4 transition-all ${
                    purchase.status === 'pending' 
                      ? 'border-amber-500/50 bg-amber-500/5' 
                      : 'border-border/50'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      {getAddonIcon(purchase.addonType)}
                      <div>
                        <h3 className="font-semibold">{purchase.addonName}</h3>
                        <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                          <Mail className="w-3 h-3" />
                          <span>{purchase.customerEmail}</span>
                          {purchase.customerName && (
                            <>
                              <span>•</span>
                              <span>{purchase.customerName}</span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-sm">
                          <DollarSign className="w-3 h-3 text-green-500" />
                          <span className="text-green-500 font-semibold">
                            ${(purchase.amount / 100).toFixed(2)}
                          </span>
                          <span className="text-muted-foreground">•</span>
                          <span className="text-muted-foreground">
                            {format(new Date(purchase.createdAt), 'MMM d, yyyy h:mm a')}
                          </span>
                        </div>
                        {purchase.claimDetails && (
                          <div className="mt-2 text-sm bg-muted/50 rounded p-2">
                            <span className="text-muted-foreground">Claim Details: </span>
                            {purchase.claimDetails}
                          </div>
                        )}
                        {purchase.notes && (
                          <div className="mt-2 text-sm text-muted-foreground italic">
                            Notes: {purchase.notes}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {getStatusBadge(purchase.status)}
                      {purchase.fulfilledAt && (
                        <span className="text-xs text-muted-foreground">
                          Fulfilled {format(new Date(purchase.fulfilledAt), 'MMM d')}
                        </span>
                      )}
                    </div>
                  </div>

                  {purchase.status === 'pending' && (
                    <div className="mt-4 pt-4 border-t border-border/50">
                      {selectedPurchase === purchase.id ? (
                        <div className="space-y-3">
                          <Textarea
                            placeholder="Add fulfillment notes (optional)..."
                            value={fulfillmentNotes}
                            onChange={(e) => setFulfillmentNotes(e.target.value)}
                            className="h-20"
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700"
                              onClick={() => updateMutation.mutate({ 
                                id: purchase.id, 
                                status: 'fulfilled', 
                                notes: fulfillmentNotes 
                              })}
                              disabled={updateMutation.isPending}
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Mark Fulfilled
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setSelectedPurchase(null);
                                setFulfillmentNotes('');
                              }}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => setSelectedPurchase(purchase.id)}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Fulfill Request
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-400 hover:text-red-300"
                            onClick={() => updateMutation.mutate({ 
                              id: purchase.id, 
                              status: 'cancelled' 
                            })}
                            disabled={updateMutation.isPending}
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Cancel
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
