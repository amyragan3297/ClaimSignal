import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Adjuster, ClaimAdjuster } from "@shared/schema";
import { Users, Plus, Loader2, Trash2, AlertCircle } from "lucide-react";

type EnrichedLink = ClaimAdjuster & {
  adjusterName: string | null;
  carrierName: string | null;
  region: string | null;
};

export const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "primary_adjuster", label: "Primary Adjuster" },
  { value: "field_adjuster", label: "Field Adjuster" },
  { value: "desk_adjuster", label: "Desk Adjuster" },
  { value: "catastrophe_adjuster", label: "Catastrophe Adjuster" },
  { value: "supervisor", label: "Supervisor" },
  { value: "team_lead", label: "Team Lead" },
  { value: "reinspection_adjuster", label: "Reinspection Adjuster" },
  { value: "supplement_adjuster", label: "Supplement Adjuster" },
  { value: "appraisal_contact", label: "Appraisal Contact" },
  { value: "carrier_representative", label: "Carrier Representative" },
  { value: "unknown", label: "Role pending review" },
];

export const INVOLVEMENT_OPTIONS: { value: string; label: string }[] = [
  { value: "assigned", label: "Assigned" },
  { value: "inspected", label: "Inspected" },
  { value: "denied", label: "Denied" },
  { value: "approved", label: "Approved" },
  { value: "partially_approved", label: "Partially Approved" },
  { value: "requested_documents", label: "Requested Documents" },
  { value: "handled_supplement", label: "Handled Supplement" },
  { value: "handled_reinspection", label: "Handled Reinspection" },
  { value: "escalated_review", label: "Escalated Review" },
  { value: "issued_payment", label: "Issued Payment" },
  { value: "communicated", label: "Communicated" },
  { value: "mentioned_only", label: "Mentioned Only" },
  { value: "unknown", label: "Involvement pending review" },
];

function roleLabel(v: string): string {
  return ROLE_OPTIONS.find((o) => o.value === v)?.label ?? "Role pending review";
}
function involvementLabel(v: string): string {
  return INVOLVEMENT_OPTIONS.find((o) => o.value === v)?.label ?? "Involvement pending review";
}

export function ClaimAdjustersCard({ claimId, canEdit }: { claimId: string; canEdit: boolean }) {
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [adjusterId, setAdjusterId] = useState("");
  const [roleOnClaim, setRoleOnClaim] = useState("primary_adjuster");
  const [involvementType, setInvolvementType] = useState("assigned");
  const [notes, setNotes] = useState("");

  const { data: links, isLoading } = useQuery<EnrichedLink[]>({
    queryKey: ["/api/claims", claimId, "adjusters"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/claims/${claimId}/adjusters`);
      return res.json();
    },
    enabled: !!claimId,
  });

  const { data: orgAdjusters } = useQuery<Adjuster[]>({
    queryKey: ["/api/adjusters"],
    enabled: canEdit,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/claims", claimId, "adjusters"] });

  const linkMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/claims/${claimId}/adjusters`, {
        adjusterId, roleOnClaim, involvementType, notes: notes || undefined, sourceType: "manual",
      });
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Adjuster linked to claim" });
      setAddOpen(false);
      setAdjusterId(""); setRoleOnClaim("primary_adjuster"); setInvolvementType("assigned"); setNotes("");
    },
    onError: (err: Error) => toast({ title: "Failed to link adjuster", description: err.message, variant: "destructive" }),
  });

  const roleMutation = useMutation({
    mutationFn: async ({ linkId, role }: { linkId: string; role: string }) => {
      await apiRequest("PATCH", `/api/claims/${claimId}/adjusters/${linkId}`, { roleOnClaim: role });
    },
    onSuccess: () => { invalidate(); toast({ title: "Role updated" }); },
    onError: (err: Error) => toast({ title: "Failed to update role", description: err.message, variant: "destructive" }),
  });

  const unlinkMutation = useMutation({
    mutationFn: async (linkId: string) => {
      await apiRequest("DELETE", `/api/claims/${claimId}/adjusters/${linkId}`);
    },
    onSuccess: () => { invalidate(); toast({ title: "Adjuster unlinked" }); },
    onError: (err: Error) => toast({ title: "Failed to unlink", description: err.message, variant: "destructive" }),
  });

  return (
    <Card data-testid="card-claim-adjusters">
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          Adjusters on this claim
        </CardTitle>
        {canEdit && (
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" data-testid="button-link-adjuster">
                <Plus className="w-4 h-4" /> Link adjuster
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Link an adjuster to this claim</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>Adjuster</Label>
                  <Select value={adjusterId} onValueChange={setAdjusterId}>
                    <SelectTrigger data-testid="select-adjuster"><SelectValue placeholder="Select adjuster" /></SelectTrigger>
                    <SelectContent>
                      {(orgAdjusters ?? []).map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.adjusterName} — {a.carrierName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(orgAdjusters ?? []).length === 0 && (
                    <p className="text-xs text-muted-foreground">No adjusters yet. Add one on the Adjusters page first.</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Role on claim</Label>
                  <Select value={roleOnClaim} onValueChange={setRoleOnClaim}>
                    <SelectTrigger data-testid="select-role"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Involvement</Label>
                  <Select value={involvementType} onValueChange={setInvolvementType}>
                    <SelectTrigger data-testid="select-involvement"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INVOLVEMENT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Notes (optional)</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="input-adjuster-notes" />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => linkMutation.mutate()}
                  disabled={!adjusterId || linkMutation.isPending}
                  data-testid="button-confirm-link-adjuster"
                >
                  {linkMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Link adjuster"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading adjusters…</p>
        ) : !links || links.length === 0 ? (
          <div className="flex items-start gap-2 text-sm text-muted-foreground" data-testid="text-no-adjusters">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>No adjusters linked to this claim yet.</span>
          </div>
        ) : (
          links.map((link) => (
            <div
              key={link.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-card/50 px-3 py-2"
              data-testid={`row-claim-adjuster-${link.id}`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium" data-testid={`text-adjuster-name-${link.id}`}>
                    {link.adjusterName ?? "Unknown adjuster"}
                  </span>
                  {link.roleOnClaim === "unknown" ? (
                    <Badge variant="outline" className="text-amber-500 border-amber-500/40">role pending review</Badge>
                  ) : (
                    <Badge variant="secondary" data-testid={`badge-role-${link.id}`}>{roleLabel(link.roleOnClaim)}</Badge>
                  )}
                  {link.needsReview && <Badge variant="outline" className="text-amber-500 border-amber-500/40">needs review</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  {link.carrierName ?? "Carrier unknown"} · {involvementLabel(link.involvementType)}
                  {link.sourceType === "legacy_backfill" ? " · source: legacy" : ""}
                </p>
              </div>
              {canEdit && (
                <div className="flex items-center gap-2 shrink-0">
                  <Select value={link.roleOnClaim} onValueChange={(v) => roleMutation.mutate({ linkId: link.id, role: v })}>
                    <SelectTrigger className="h-8 w-[170px]" data-testid={`select-edit-role-${link.id}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="ghost" size="icon"
                    onClick={() => { if (confirm("Unlink this adjuster from the claim?")) unlinkMutation.mutate(link.id); }}
                    disabled={unlinkMutation.isPending}
                    data-testid={`button-unlink-adjuster-${link.id}`}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
