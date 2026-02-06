import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, DollarSign, FileText, Loader2, AlertCircle, TrendingUp, Clock, Pencil, Trash2, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import type { Supplement, Claim } from "@shared/schema";
import { authFetch } from "@/lib/api";

const SCOPE_DRIVERS = [
  "Shingle quantity",
  "Tear-off",
  "Hip and ridge",
  "Starter course",
  "Drip edge",
  "Ridge vent",
  "Decking replacement",
  "Flashing",
  "Ice & water shield",
  "Gutter damage",
  "Interior damage",
  "Other"
];

const OP_STATUSES = [
  "Not Addressed",
  "Deferred",
  "Denied",
  "Applied"
];

function formatCurrency(cents: number | null | undefined): string {
  if (!cents) return "$0.00";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function formatDollarInput(cents: number | null | undefined): string {
  if (!cents) return "";
  return (cents / 100).toFixed(2);
}

function parseDollarInput(value: string): number {
  const num = parseFloat(value || "0");
  return Math.round(num * 100);
}

function getStatusBadge(status: string) {
  const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
    pending: { variant: "secondary", label: "Pending" },
    submitted: { variant: "default", label: "Submitted" },
    approved: { variant: "outline", label: "Approved" },
    denied: { variant: "destructive", label: "Denied" },
    negotiating: { variant: "default", label: "Negotiating" },
  };
  const config = variants[status] || { variant: "secondary", label: status };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

function getOpStatusBadge(status: string | null | undefined) {
  if (!status) return null;
  const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; color?: string }> = {
    "Not Addressed": { variant: "secondary" },
    "Deferred": { variant: "outline" },
    "Denied": { variant: "destructive" },
    "Applied": { variant: "default" },
  };
  const config = variants[status] || { variant: "secondary" };
  return <Badge variant={config.variant}>O&P: {status}</Badge>;
}

interface SupplementFormData {
  claimId: string;
  title: string;
  description: string;
  status: string;
  originalRcv: number | null;
  revisedRcv: number | null;
  originalAcv: number | null;
  revisedAcv: number | null;
  scopeDrivers: string[];
  opStatus: string;
  notes: string;
}

const defaultFormData: SupplementFormData = {
  claimId: "",
  title: "",
  description: "",
  status: "pending",
  originalRcv: null,
  revisedRcv: null,
  originalAcv: null,
  revisedAcv: null,
  scopeDrivers: [],
  opStatus: "Not Addressed",
  notes: "",
};

export default function SupplementsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingSupplement, setEditingSupplement] = useState<Supplement | null>(null);
  const [newSupplement, setNewSupplement] = useState<SupplementFormData>(defaultFormData);

  const { data: supplementsData, isLoading } = useQuery({
    queryKey: ["/api/supplements"],
    queryFn: async () => {
      const res = await authFetch("/api/supplements");
      if (!res.ok) throw new Error("Failed to load supplements");
      return res.json();
    },
  });

  const { data: claimsData } = useQuery({
    queryKey: ["/api/claims"],
    queryFn: async () => {
      const res = await authFetch("/api/claims");
      if (!res.ok) throw new Error("Failed to load claims");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: SupplementFormData) => {
      const res = await authFetch("/api/supplements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create supplement");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplements"] });
      setIsCreateOpen(false);
      setNewSupplement(defaultFormData);
      toast({ title: "Supplement Logged", description: "The supplement has been added successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create supplement", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Supplement> }) => {
      const res = await authFetch(`/api/supplements/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update supplement");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplements"] });
      setEditingSupplement(null);
      toast({ title: "Supplement Updated", description: "Changes saved successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update supplement", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/supplements/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete supplement");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/supplements"] });
      toast({ title: "Supplement Deleted", description: "The supplement has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete supplement", variant: "destructive" });
    },
  });

  const supplements: Supplement[] = supplementsData?.supplements || [];
  const claims: Claim[] = claimsData?.claims || [];

  const totalRcvIncrease = supplements.reduce((sum, s) => {
    const increase = (s.revisedRcv || 0) - (s.originalRcv || 0);
    return sum + Math.max(0, increase);
  }, 0);
  const totalAcvIncrease = supplements.reduce((sum, s) => {
    const increase = (s.revisedAcv || 0) - (s.originalAcv || 0);
    return sum + Math.max(0, increase);
  }, 0);
  const pendingCount = supplements.filter(s => s.status === "pending" || s.status === "submitted").length;
  const opAppliedCount = supplements.filter(s => s.opStatus === "Applied").length;

  const handleCreate = () => {
    if (!newSupplement.claimId || !newSupplement.title) {
      toast({ title: "Missing Fields", description: "Please select a claim and enter a title", variant: "destructive" });
      return;
    }
    createMutation.mutate(newSupplement);
  };

  const handleScopeDriverToggle = (driver: string, checked: boolean, isEdit: boolean) => {
    if (isEdit && editingSupplement) {
      const current = editingSupplement.scopeDrivers || [];
      const updated = checked 
        ? [...current, driver]
        : current.filter(d => d !== driver);
      setEditingSupplement({ ...editingSupplement, scopeDrivers: updated });
    } else {
      const current = newSupplement.scopeDrivers || [];
      const updated = checked 
        ? [...current, driver]
        : current.filter(d => d !== driver);
      setNewSupplement(prev => ({ ...prev, scopeDrivers: updated }));
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  const SupplementForm = ({ 
    data, 
    onChange, 
    onSubmit, 
    isLoading, 
    submitLabel,
    isEdit = false
  }: { 
    data: SupplementFormData; 
    onChange: (data: SupplementFormData) => void;
    onSubmit: () => void;
    isLoading: boolean;
    submitLabel: string;
    isEdit?: boolean;
  }) => (
    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
      {!isEdit && (
        <div className="space-y-2">
          <Label>Claim</Label>
          <Select
            value={data.claimId}
            onValueChange={(v) => onChange({ ...data, claimId: v })}
          >
            <SelectTrigger data-testid="select-claim">
              <SelectValue placeholder="Select a claim" />
            </SelectTrigger>
            <SelectContent>
              {claims.map((claim) => (
                <SelectItem key={claim.id} value={claim.id}>
                  {claim.maskedId || claim.id} - {claim.carrier} ({claim.homeownerName})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label>Title</Label>
        <Input
          placeholder="e.g., Roof Supplement - Additional Damage"
          value={data.title}
          onChange={(e) => onChange({ ...data, title: e.target.value })}
          data-testid="input-supplement-title"
        />
      </div>

      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          placeholder="Describe the additional damage discovered..."
          value={data.description}
          onChange={(e) => onChange({ ...data, description: e.target.value })}
          data-testid="input-supplement-description"
        />
      </div>

      <div className="space-y-2">
        <Label>Status</Label>
        <Select
          value={data.status}
          onValueChange={(v) => onChange({ ...data, status: v })}
        >
          <SelectTrigger data-testid="select-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="denied">Denied</SelectItem>
            <SelectItem value="negotiating">Negotiating</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
        <h4 className="font-medium text-sm">RCV (Replacement Cost Value)</h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Original RCV ($)</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={formatDollarInput(data.originalRcv)}
              onChange={(e) => onChange({ ...data, originalRcv: parseDollarInput(e.target.value) })}
              data-testid="input-original-rcv"
            />
          </div>
          <div className="space-y-2">
            <Label>Revised RCV ($)</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={formatDollarInput(data.revisedRcv)}
              onChange={(e) => onChange({ ...data, revisedRcv: parseDollarInput(e.target.value) })}
              data-testid="input-revised-rcv"
            />
          </div>
        </div>
        {data.originalRcv && data.revisedRcv && (
          <div className="text-sm flex items-center gap-1">
            <span className="text-muted-foreground">RCV Increase:</span>
            <span className={`font-medium ${(data.revisedRcv - data.originalRcv) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(data.revisedRcv - data.originalRcv)}
            </span>
          </div>
        )}
      </div>

      <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
        <h4 className="font-medium text-sm">ACV (Actual Cash Value)</h4>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Original ACV ($)</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={formatDollarInput(data.originalAcv)}
              onChange={(e) => onChange({ ...data, originalAcv: parseDollarInput(e.target.value) })}
              data-testid="input-original-acv"
            />
          </div>
          <div className="space-y-2">
            <Label>Revised ACV ($)</Label>
            <Input
              type="number"
              step="0.01"
              placeholder="0.00"
              value={formatDollarInput(data.revisedAcv)}
              onChange={(e) => onChange({ ...data, revisedAcv: parseDollarInput(e.target.value) })}
              data-testid="input-revised-acv"
            />
          </div>
        </div>
        {data.originalAcv && data.revisedAcv && (
          <div className="text-sm flex items-center gap-1">
            <span className="text-muted-foreground">ACV Increase:</span>
            <span className={`font-medium ${(data.revisedAcv - data.originalAcv) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(data.revisedAcv - data.originalAcv)}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <Label>Scope Drivers</Label>
        <div className="grid grid-cols-2 gap-2">
          {SCOPE_DRIVERS.map((driver) => (
            <div key={driver} className="flex items-center space-x-2">
              <Checkbox
                id={`driver-${driver}-${isEdit ? 'edit' : 'new'}`}
                checked={(data.scopeDrivers || []).includes(driver)}
                onCheckedChange={(checked) => handleScopeDriverToggle(driver, checked as boolean, isEdit)}
                data-testid={`checkbox-${driver.toLowerCase().replace(/\s+/g, '-')}`}
              />
              <label
                htmlFor={`driver-${driver}-${isEdit ? 'edit' : 'new'}`}
                className="text-sm cursor-pointer"
              >
                {driver}
              </label>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>O&P Status</Label>
        <Select
          value={data.opStatus || "Not Addressed"}
          onValueChange={(v) => onChange({ ...data, opStatus: v })}
        >
          <SelectTrigger data-testid="select-op-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OP_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>{status}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Notes</Label>
        <Textarea
          placeholder="Adjuster / Carrier notes..."
          value={data.notes}
          onChange={(e) => onChange({ ...data, notes: e.target.value })}
          data-testid="input-notes"
        />
      </div>

      <Button onClick={onSubmit} disabled={isLoading} className="w-full">
        {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
        {submitLabel}
      </Button>
    </div>
  );

  return (
    <Layout>
      <div className="space-y-6" data-testid="supplements-page">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Supplements</h1>
            <p className="text-muted-foreground">Track additional damage claims and negotiations</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="create-supplement-btn">
                <Plus className="h-4 w-4 mr-2" />
                Log Supplement
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Log New Supplement</DialogTitle>
              </DialogHeader>
              <SupplementForm
                data={newSupplement}
                onChange={setNewSupplement}
                onSubmit={handleCreate}
                isLoading={createMutation.isPending}
                submitLabel="Log Supplement"
              />
            </DialogContent>
          </Dialog>
        </div>

        {/* Edit Dialog */}
        <Dialog open={!!editingSupplement} onOpenChange={(open) => !open && setEditingSupplement(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Edit Supplement</DialogTitle>
            </DialogHeader>
            {editingSupplement && (
              <SupplementForm
                data={{
                  claimId: editingSupplement.claimId,
                  title: editingSupplement.title,
                  description: editingSupplement.description || "",
                  status: editingSupplement.status,
                  originalRcv: editingSupplement.originalRcv,
                  revisedRcv: editingSupplement.revisedRcv,
                  originalAcv: editingSupplement.originalAcv,
                  revisedAcv: editingSupplement.revisedAcv,
                  scopeDrivers: editingSupplement.scopeDrivers || [],
                  opStatus: editingSupplement.opStatus || "Not Addressed",
                  notes: editingSupplement.notes || "",
                }}
                onChange={(data) => setEditingSupplement({ ...editingSupplement, ...data })}
                onSubmit={() => updateMutation.mutate({ id: editingSupplement.id, data: editingSupplement })}
                isLoading={updateMutation.isPending}
                submitLabel="Save Changes"
                isEdit={true}
              />
            )}
          </DialogContent>
        </Dialog>

        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Supplements</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{supplements.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">RCV Increase</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{formatCurrency(totalRcvIncrease)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-500">{pendingCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">O&P Applied</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{opAppliedCount}</div>
            </CardContent>
          </Card>
        </div>

        {supplements.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">No Supplements Yet</h3>
              <p className="text-muted-foreground text-center max-w-md mt-2">
                Supplements track additional damage discovered after the initial claim. Log your first supplement to get started.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {supplements.map((supplement) => {
              const claim = claims.find(c => c.id === supplement.claimId);
              const rcvIncrease = (supplement.revisedRcv || 0) - (supplement.originalRcv || 0);
              const acvIncrease = (supplement.revisedAcv || 0) - (supplement.originalAcv || 0);
              return (
                <Card key={supplement.id} className="hover:border-primary/50 transition-colors" data-testid={`supplement-card-${supplement.id}`}>
                  <CardHeader>
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div className="space-y-1">
                        <CardTitle className="flex flex-wrap items-center gap-2">
                          {supplement.title}
                          {getStatusBadge(supplement.status)}
                          {getOpStatusBadge(supplement.opStatus)}
                        </CardTitle>
                        <CardDescription>
                          {claim ? (
                            <Link href={`/claims/${claim.id}`} className="hover:underline">
                              {claim.maskedId || claim.id} - {claim.carrier} ({claim.homeownerName})
                            </Link>
                          ) : (
                            "Unknown Claim"
                          )}
                        </CardDescription>
                      </div>
                      <div className="flex items-start gap-4">
                        <div className="grid grid-cols-2 gap-4 text-right">
                          {(supplement.originalRcv || supplement.revisedRcv) && (
                            <div>
                              <div className="text-xs text-muted-foreground">RCV</div>
                              <div className="text-sm">{formatCurrency(supplement.originalRcv)} → {formatCurrency(supplement.revisedRcv)}</div>
                              <div className={`text-sm font-medium flex items-center justify-end gap-1 ${rcvIncrease >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {rcvIncrease >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                                {formatCurrency(Math.abs(rcvIncrease))}
                              </div>
                            </div>
                          )}
                          {(supplement.originalAcv || supplement.revisedAcv) && (
                            <div>
                              <div className="text-xs text-muted-foreground">ACV</div>
                              <div className="text-sm">{formatCurrency(supplement.originalAcv)} → {formatCurrency(supplement.revisedAcv)}</div>
                              <div className={`text-sm font-medium flex items-center justify-end gap-1 ${acvIncrease >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {acvIncrease >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                                {formatCurrency(Math.abs(acvIncrease))}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingSupplement(supplement)}
                            data-testid={`edit-supplement-${supplement.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm("Are you sure you want to delete this supplement?")) {
                                deleteMutation.mutate(supplement.id);
                              }
                            }}
                            data-testid={`delete-supplement-${supplement.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {supplement.description && (
                      <p className="text-sm text-muted-foreground">{supplement.description}</p>
                    )}
                    {supplement.scopeDrivers && supplement.scopeDrivers.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        <span className="text-xs text-muted-foreground mr-1">Scope Drivers:</span>
                        {supplement.scopeDrivers.map((driver) => (
                          <Badge key={driver} variant="outline" className="text-xs">{driver}</Badge>
                        ))}
                      </div>
                    )}
                    {supplement.notes && (
                      <div className="text-sm border-t pt-2 mt-2">
                        <span className="text-muted-foreground">Notes:</span> {supplement.notes}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
