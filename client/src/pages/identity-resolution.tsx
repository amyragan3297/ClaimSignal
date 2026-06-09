import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, XCircle, GitMerge, User } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface IdentityProfile {
  id: string;
  canonicalName: string;
  aliases?: string[] | null;
  email?: string | null;
  phone?: string | null;
  carrier?: string | null;
  role?: string | null;
}

interface IdentityMatch {
  id: string;
  sourceIdentityId: string;
  targetIdentityId: string;
  matchType: string;
  confidenceScore: number | null;
  matchReason: string | null;
  status: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string | null;
}

interface ReviewQueueItem {
  id: string;
  matchId: string;
  priority: string;
  status: string;
  createdAt: string | null;
  expiresAt: string | null;
  match?: IdentityMatch;
  source?: IdentityProfile;
  target?: IdentityProfile;
}

export default function IdentityResolutionPage() {
  const { toast } = useToast();
  const [processingId, setProcessingId] = useState<string | null>(null);

  const { data: queue, isLoading } = useQuery<ReviewQueueItem[]>({
    queryKey: ["/api/identity/review-queue"],
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/identity/matches/${id}/approve`, {});
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Approve failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Approved", description: "Identity merge approved and logged." });
      queryClient.invalidateQueries({ queryKey: ["/api/identity/review-queue"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
    onSettled: () => setProcessingId(null),
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/identity/matches/${id}/reject`, {});
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Reject failed");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Rejected", description: "Identity match rejected and logged." });
      queryClient.invalidateQueries({ queryKey: ["/api/identity/review-queue"] });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
    onSettled: () => setProcessingId(null),
  });

  function handleApprove(id: string) {
    setProcessingId(id);
    approveMutation.mutate(id);
  }

  function handleReject(id: string) {
    setProcessingId(id);
    rejectMutation.mutate(id);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-identity-title">Identity Resolution</h1>
        <p className="text-sm text-muted-foreground">Review and approve AI-detected identity matches</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm">Pending Review</CardTitle>
            <GitMerge className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-pending-count">
              {isLoading ? <Skeleton className="h-8 w-12" /> : queue?.length ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm">High Priority</CardTitle>
            <User className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-high-priority-count">
              {isLoading ? <Skeleton className="h-8 w-12" /> : queue?.filter((q) => q.priority === "high").length ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm">Expired</CardTitle>
            <User className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-expired-count">
              {isLoading ? <Skeleton className="h-8 w-12" /> : queue?.filter((q) => q.expiresAt && new Date(q.expiresAt) < new Date()).length ?? 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Review Queue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : queue && queue.length > 0 ? (
            queue.map((item) => (
              <div
                key={item.id}
                className="border rounded-lg p-4 space-y-3"
                data-testid={`card-queue-item-${item.id}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={item.priority === "high" ? "destructive" : item.priority === "medium" ? "secondary" : "outline"}
                      className="text-xs capitalize"
                    >
                      {item.priority} priority
                    </Badge>
                    <Badge variant="outline" className="text-xs capitalize">
                      {item.status}
                    </Badge>
                    {item.match?.confidenceScore !== null && item.match?.confidenceScore !== undefined && (
                      <Badge variant="outline" className="text-xs">
                        Confidence: {Math.round(item.match.confidenceScore * 100)}%
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {item.createdAt ? new Date(item.createdAt).toLocaleDateString() : "N/A"}
                  </span>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Source Identity</p>
                    <p className="text-sm font-medium">{item.source?.canonicalName ?? "Unknown"}</p>
                    {item.source?.carrier && (
                      <p className="text-xs text-muted-foreground">Carrier: {item.source.carrier}</p>
                    )}
                    {item.source?.role && (
                      <p className="text-xs text-muted-foreground">Role: {item.source.role}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Proposed Match</p>
                    <p className="text-sm font-medium">{item.target?.canonicalName ?? "Unknown"}</p>
                    {item.target?.carrier && (
                      <p className="text-xs text-muted-foreground">Carrier: {item.target.carrier}</p>
                    )}
                    {item.target?.role && (
                      <p className="text-xs text-muted-foreground">Role: {item.target.role}</p>
                    )}
                  </div>
                </div>

                {item.match?.matchReason && (
                  <p className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2">
                    <span className="font-medium">Reason: </span>
                    {item.match.matchReason}
                  </p>
                )}

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    disabled={processingId === item.match?.id}
                    onClick={() => item.match?.id && handleApprove(item.match.id)}
                    data-testid={`button-approve-${item.id}`}
                  >
                    {processingId === item.match?.id && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Approve Merge
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={processingId === item.match?.id}
                    onClick={() => item.match?.id && handleReject(item.match.id)}
                    data-testid={`button-reject-${item.id}`}
                  >
                    <XCircle className="w-3 h-3 mr-1" />
                    Reject
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <GitMerge className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No pending identity matches in the review queue.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
