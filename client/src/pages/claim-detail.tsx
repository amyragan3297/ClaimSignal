import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Claim } from "@shared/schema";
import {
  ArrowLeft,
  FileText,
  MapPin,
  DollarSign,
  Clock,
  Trash2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { useLocation } from "wouter";

export default function ClaimDetailPage() {
  const [, params] = useRoute("/claims/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: claim, isLoading } = useQuery<Claim>({
    queryKey: ["/api/claims", params?.id],
    enabled: !!params?.id,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/claims/${params?.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/claims"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Claim deleted" });
      setLocation("/claims");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid md:grid-cols-2 gap-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!claim) {
    return (
      <div className="text-center py-24">
        <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
        <p className="text-muted-foreground font-medium">Claim not found</p>
        <Link href="/claims">
          <Button variant="outline" className="mt-4">Back to Claims</Button>
        </Link>
      </div>
    );
  }

  const statusColor: Record<string, string> = {
    open: "default",
    in_progress: "secondary",
    approved: "default",
    denied: "destructive",
    closed: "outline",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/claims">
            <Button variant="ghost" size="icon" data-testid="button-back-claims">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight" data-testid="text-claim-title">
              {claim.claimNumber}
            </h1>
            <p className="text-sm text-muted-foreground">{claim.insuredName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant={(statusColor[claim.status] as any) || "outline"}
            className="capitalize"
            data-testid="badge-claim-status"
          >
            {claim.status.replace("_", " ")}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (confirm("Delete this claim?")) deleteMutation.mutate();
            }}
            disabled={deleteMutation.isPending}
            data-testid="button-delete-claim"
          >
            {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4 text-destructive" />}
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              Claim Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InfoRow label="Claim Number" value={claim.claimNumber} testId="detail-claim-number" />
            <InfoRow label="Insured Name" value={claim.insuredName} testId="detail-insured-name" />
            <InfoRow label="Loss Type" value={claim.lossType || "—"} testId="detail-loss-type" />
            <InfoRow label="Status" value={claim.status.replace("_", " ")} testId="detail-status" />
            {claim.frictionScore !== null && claim.frictionScore !== undefined && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Friction Score</span>
                <div className="flex items-center gap-2">
                  <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full"
                      style={{ width: `${Math.min(claim.frictionScore, 100)}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium" data-testid="detail-friction-score">{claim.frictionScore}/100</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              Location
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InfoRow label="Address" value={claim.address} testId="detail-address" />
            <InfoRow label="City" value={claim.city} testId="detail-city" />
            <InfoRow label="State" value={claim.state} testId="detail-state" />
            <InfoRow label="ZIP Code" value={claim.zipCode || "—"} testId="detail-zip" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-primary" />
              Financials
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InfoRow
              label="Claim Amount"
              value={claim.claimAmount ? `$${claim.claimAmount.toLocaleString()}` : "—"}
              testId="detail-claim-amount"
            />
            <InfoRow
              label="Approved Amount"
              value={claim.approvedAmount ? `$${claim.approvedAmount.toLocaleString()}` : "—"}
              testId="detail-approved-amount"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Timeline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <InfoRow
              label="Loss Date"
              value={claim.lossDate ? new Date(claim.lossDate).toLocaleDateString() : "—"}
              testId="detail-loss-date"
            />
            <InfoRow
              label="Created"
              value={claim.createdAt ? new Date(claim.createdAt).toLocaleDateString() : "—"}
              testId="detail-created"
            />
            {claim.notes && (
              <div>
                <span className="text-sm text-muted-foreground block mb-1">Notes</span>
                <p className="text-sm bg-muted/50 rounded-md p-3" data-testid="detail-notes">{claim.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function InfoRow({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium" data-testid={testId}>{value}</span>
    </div>
  );
}
