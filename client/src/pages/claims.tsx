import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import type { Claim } from "@shared/schema";
import { Plus, Search, FileText, Eye, Loader2, X, Shield } from "lucide-react";

const createClaimSchema = z.object({
  claimNumber: z.string().min(1, "Claim number required"),
  carrier: z.string().optional(),
  propertyAddress: z.string().optional(),
  homeownerName: z.string().optional(),
  homeownerPhone: z.string().optional(),
  homeownerEmail: z.string().optional(),
  policyNumber: z.string().optional(),
  insuredName: z.string().optional(),
  lossType: z.string().optional(),
  status: z.string().default("open"),
  notes: z.string().optional(),
  currentPhase: z.string().default("pre_claim"),
  dateOfLoss: z.string().optional(),
  rcvAmount: z.string().optional(),
  acvAmount: z.string().optional(),
  deductible: z.string().optional(),
});

const statusColors: Record<string, string> = {
  open: "default",
  in_progress: "secondary",
  approved: "default",
  denied: "destructive",
  closed: "outline",
};

const phaseColors: Record<string, string> = {
  pre_claim: "outline",
  filed: "default",
  inspected: "secondary",
  initial_determination: "secondary",
  supplement_submitted: "secondary",
  reinspection_requested: "secondary",
  escalated: "destructive",
  resolved: "default",
  closed: "outline",
};

const escalationColors = (level: number | null | undefined) => {
  if (level === null || level === undefined) return "outline";
  if (level <= 1) return "secondary";
  if (level <= 3) return "secondary";
  return "destructive";
};

const formatPhase = (phase: string) => {
  return phase
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

export default function ClaimsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: authData } = useAuth();
  const userRole = authData?.user?.role || "standard";
  const canToggleUnmasked = userRole === "super_admin";
  const [showUnmasked, setShowUnmasked] = useState(false);

  const { data: claims, isLoading } = useQuery<Claim[]>({
    queryKey: ["/api/claims", { unmasked: showUnmasked && canToggleUnmasked }],
    queryFn: async () => {
      const url = showUnmasked && canToggleUnmasked ? "/api/claims?unmasked=true" : "/api/claims";
      const res = await apiRequest("GET", url);
      return res.json();
    },
  });

  const form = useForm<z.infer<typeof createClaimSchema>>({
    resolver: zodResolver(createClaimSchema),
    defaultValues: {
      claimNumber: "",
      carrier: "",
      propertyAddress: "",
      homeownerName: "",
      homeownerPhone: "",
      homeownerEmail: "",
      policyNumber: "",
      insuredName: "",
      lossType: "",
      status: "open",
      notes: "",
      currentPhase: "pre_claim",
      dateOfLoss: "",
      rcvAmount: "",
      acvAmount: "",
      deductible: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof createClaimSchema>) => {
      await apiRequest("POST", "/api/claims", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/claims"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Claim created successfully" });
      setDialogOpen(false);
      form.reset();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create claim", description: err.message, variant: "destructive" });
    },
  });

  const filteredClaims = claims?.filter(
    (c) =>
      (c.claimNumber || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.carrier || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.propertyAddress || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      ((c as any).homeownerName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      formatPhase(c.currentPhase).toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-claims-title">Claims</h1>
          <p className="text-sm text-muted-foreground">Manage and track property claims</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-claim">
              <Plus className="w-4 h-4" />
              New Claim
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Claim</DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
              <div className="space-y-2">
                <Label>Claim Number</Label>
                <Input placeholder="CLM-00001" data-testid="input-claim-number" {...form.register("claimNumber")} />
                {form.formState.errors.claimNumber && <p className="text-xs text-destructive">{form.formState.errors.claimNumber.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Carrier</Label>
                <Input placeholder="State Farm, Allstate..." data-testid="input-carrier" {...form.register("carrier")} />
              </div>
              <div className="space-y-2">
                <Label>Property Address</Label>
                <Input placeholder="123 Main Street, Dallas TX" data-testid="input-address" {...form.register("propertyAddress")} />
              </div>
              <div className="space-y-2">
                <Label>Homeowner Name</Label>
                <Input placeholder="John Doe" data-testid="input-homeowner-name" {...form.register("homeownerName")} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Homeowner Phone</Label>
                  <Input placeholder="555-0100" data-testid="input-homeowner-phone" {...form.register("homeownerPhone")} />
                </div>
                <div className="space-y-2">
                  <Label>Homeowner Email</Label>
                  <Input placeholder="john@example.com" data-testid="input-homeowner-email" {...form.register("homeownerEmail")} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Policy Number</Label>
                  <Input placeholder="POL-12345" data-testid="input-policy-number" {...form.register("policyNumber")} />
                </div>
                <div className="space-y-2">
                  <Label>Loss Type</Label>
                  <Input placeholder="Wind, Hail, Fire..." data-testid="input-loss-type" {...form.register("lossType")} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Insured Name</Label>
                <Input placeholder="Insured party name" data-testid="input-insured-name" {...form.register("insuredName")} />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea placeholder="Additional details..." data-testid="input-notes" {...form.register("notes")} className="resize-none" />
              </div>
              <div className="space-y-2">
                <Label>Current Phase</Label>
                <Select value={form.watch("currentPhase")} onValueChange={(value) => form.setValue("currentPhase", value)}>
                  <SelectTrigger data-testid="select-current-phase">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pre_claim">Pre Claim</SelectItem>
                    <SelectItem value="filed">Filed</SelectItem>
                    <SelectItem value="inspected">Inspected</SelectItem>
                    <SelectItem value="initial_determination">Initial Determination</SelectItem>
                    <SelectItem value="supplement_submitted">Supplement Submitted</SelectItem>
                    <SelectItem value="reinspection_requested">Reinspection Requested</SelectItem>
                    <SelectItem value="escalated">Escalated</SelectItem>
                    <SelectItem value="resolved">Resolved</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Date of Loss</Label>
                  <Input type="date" data-testid="input-date-of-loss" {...form.register("dateOfLoss")} />
                </div>
                <div className="space-y-2">
                  <Label>RCV Amount</Label>
                  <Input type="number" placeholder="0.00" data-testid="input-rcv-amount" {...form.register("rcvAmount")} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>ACV Amount</Label>
                  <Input type="number" placeholder="0.00" data-testid="input-acv-amount" {...form.register("acvAmount")} />
                </div>
                <div className="space-y-2">
                  <Label>Deductible</Label>
                  <Input type="number" placeholder="0.00" data-testid="input-deductible" {...form.register("deductible")} />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel-claim">
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-claim">
                  {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create Claim
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search claims..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search-claims"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {canToggleUnmasked && (
        <div className="flex items-center justify-between rounded-md border border-border bg-card p-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium" data-testid="text-privacy-label">Data Privacy Mode</p>
              <p className="text-xs text-muted-foreground">PII is masked for non-privileged roles by default to protect homeowner privacy.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{showUnmasked ? "Showing full data" : "PII masked"}</span>
            <Switch
              checked={showUnmasked}
              onCheckedChange={setShowUnmasked}
              data-testid="switch-unmask-toggle"
            />
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !filteredClaims?.length ? (
            <div className="p-12 text-center">
              <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground font-medium">No claims found</p>
              <p className="text-sm text-muted-foreground/70 mb-4">
                {searchQuery ? "Try adjusting your search" : "Create your first claim to get started"}
              </p>
              {!searchQuery && (
                <Button variant="outline" onClick={() => setDialogOpen(true)} data-testid="button-empty-new-claim">
                  <Plus className="w-4 h-4" />
                  New Claim
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Claim #</TableHead>
                    <TableHead>Carrier</TableHead>
                    <TableHead>Property</TableHead>
                    <TableHead>Homeowner</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Phase</TableHead>
                    <TableHead>Escalation</TableHead>
                    <TableHead>Risk Score</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClaims.map((claim) => (
                    <TableRow key={claim.id} className="hover-elevate cursor-pointer" onClick={() => setLocation(`/claims/${claim.id}`)} data-testid={`row-claim-${claim.id}`}>
                      <TableCell className="font-mono text-sm" data-testid={`text-claim-number-${claim.id}`}>{claim.claimNumber}</TableCell>
                      <TableCell data-testid={`text-carrier-${claim.id}`}>{claim.carrier || "\u2014"}</TableCell>
                      <TableCell className="text-muted-foreground max-w-[200px] truncate" data-testid={`text-address-${claim.id}`}>
                        {claim.propertyAddress || "\u2014"}
                      </TableCell>
                      <TableCell className="text-muted-foreground" data-testid={`text-homeowner-${claim.id}`}>
                        {(claim as any).homeownerName || "\u2014"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={(statusColors[claim.status] as any) || "outline"}
                          className="text-xs capitalize"
                        >
                          {claim.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={(phaseColors[claim.currentPhase] as any) || "outline"}
                          className="text-xs"
                          data-testid={`badge-phase-${claim.id}`}
                        >
                          {formatPhase(claim.currentPhase)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={(escalationColors(claim.escalationLevel) as any) || "outline"}
                          className="text-xs"
                          data-testid={`badge-escalation-${claim.id}`}
                        >
                          {claim.escalationLevel ?? "\u2014"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {claim.riskScore !== null ? (
                          <Badge variant={claim.riskScore > 70 ? "destructive" : claim.riskScore > 40 ? "secondary" : "outline"} className="text-xs">
                            {claim.riskScore}
                          </Badge>
                        ) : "\u2014"}
                      </TableCell>
                      <TableCell>
                        <Eye className="w-4 h-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
