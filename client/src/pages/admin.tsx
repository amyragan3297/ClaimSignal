import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Building2, CreditCard, FileText, Shield, Loader2, Eye,
  Archive, Trash2, RotateCcw, AlertTriangle, BarChart3,
} from "lucide-react";
import { Redirect } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { setAccessToken } from "@/lib/queryClient";
import { ConfirmDialog } from "@/components/confirm-dialog";

interface AdminOverview {
  totalUsers: number;
  totalOrgs: number;
  totalBillingAccounts: number;
  totalClaims: number;
  trialingCount: number;
  activeCount: number;
  canceledCount: number;
}

interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  isPlatformOwner: boolean | null;
  createdAt: string | null;
  organizationId: string;
  orgName: string | null;
  role: string;
  subscriptionStatus: string | null;
  trialEndDate: string | null;
  planType: string | null;
}

interface GovernanceOverview {
  claims: { active: number; archived: number };
  adjusters: { active: number; archived: number };
  clients: { active: number; archived: number };
  evidenceFiles: { active: number; archived: number };
  audioRecordings: { active: number; archived: number };
  emails: { active: number; archived: number };
}

interface ArchivedRecord {
  id: string;
  [key: string]: any;
}

const ENTITY_LABELS: Record<string, string> = {
  claims: "Claims",
  adjusters: "Adjusters",
  clients: "Clients",
  evidence: "Evidence Files",
  audio: "Audio Recordings",
  emails: "Communications",
};

function getRecordLabel(entity: string, record: ArchivedRecord): string {
  switch (entity) {
    case "claims": return record.claimNumber || record.id;
    case "adjusters": return record.adjusterName || record.id;
    case "clients": return `${record.firstName || ""} ${record.lastName || ""}`.trim() || record.id;
    case "evidence": return record.fileName || record.id;
    case "audio": return `Audio ${record.id.slice(0, 8)}`;
    case "emails": return record.subject || `Email ${record.id.slice(0, 8)}`;
    default: return record.id;
  }
}

function getRestoreEndpoint(entity: string, id: string) {
  switch (entity) {
    case "claims": return `/api/claims/${id}/restore`;
    case "adjusters": return `/api/adjusters/${id}/restore`;
    case "clients": return `/api/clients/${id}/restore`;
    case "evidence": return `/api/evidence/files/${id}/restore`;
    case "audio": return `/api/audio/${id}/restore`;
    case "emails": return `/api/communications/${id}/restore`;
    default: return "";
  }
}

function getDeleteEndpoint(entity: string, id: string) {
  switch (entity) {
    case "claims": return `/api/claims/${id}/permanent`;
    case "adjusters": return `/api/adjusters/${id}/permanent`;
    case "clients": return `/api/clients/${id}/permanent`;
    case "evidence": return `/api/evidence/files/${id}/permanent`;
    case "audio": return `/api/audio/${id}/permanent`;
    case "emails": return `/api/communications/${id}/permanent`;
    default: return "";
  }
}

function GovernanceHub() {
  const { toast } = useToast();
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: "restore" | "delete"; id: string; label: string } | null>(null);

  const { data: overview, isLoading: overviewLoading } = useQuery<GovernanceOverview>({
    queryKey: ["/api/admin/governance"],
  });

  const { data: archivedRecords, isLoading: archivedLoading } = useQuery<ArchivedRecord[]>({
    queryKey: ["/api/admin/archived", selectedEntity],
    queryFn: async () => {
      if (!selectedEntity) return [];
      const res = await apiRequest("GET", `/api/admin/archived/${selectedEntity}`);
      return res.json();
    },
    enabled: !!selectedEntity,
  });

  const restoreMutation = useMutation({
    mutationFn: async ({ entity, id }: { entity: string; id: string }) => {
      await apiRequest("PATCH", getRestoreEndpoint(entity, id));
    },
    onSuccess: () => {
      toast({ title: "Record restored successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/archived", selectedEntity] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/governance"] });
      setConfirmAction(null);
    },
    onError: (err: Error) => {
      toast({ title: "Restore failed", description: err.message, variant: "destructive" });
    },
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: async ({ entity, id }: { entity: string; id: string }) => {
      await apiRequest("DELETE", getDeleteEndpoint(entity, id));
    },
    onSuccess: () => {
      toast({ title: "Record permanently deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/archived", selectedEntity] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/governance"] });
      setConfirmAction(null);
    },
    onError: (err: Error) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  const entities = ["claims", "adjusters", "clients", "evidence", "audio", "emails"] as const;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold" data-testid="text-governance-title">Governance Hub</h2>
        <p className="text-sm text-muted-foreground">Manage archived records and perform permanent deletions across all record types.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {overviewLoading ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)
        ) : (
          entities.map((entity) => {
            const key = entity === "evidence" ? "evidenceFiles" : entity === "audio" ? "audioRecordings" : entity;
            const data = overview?.[key as keyof GovernanceOverview];
            return (
              <Card
                key={entity}
                className={`cursor-pointer transition-colors ${selectedEntity === entity ? "border-primary bg-primary/5" : "hover:border-muted-foreground/30"}`}
                onClick={() => setSelectedEntity(selectedEntity === entity ? null : entity)}
                data-testid={`card-governance-${entity}`}
              >
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">{ENTITY_LABELS[entity]}</p>
                  <p className="text-xl font-bold">{data?.active ?? 0}</p>
                  <p className="text-xs text-muted-foreground">active</p>
                  {(data?.archived ?? 0) > 0 && (
                    <Badge variant="secondary" className="mt-1 text-xs">
                      {data?.archived} archived
                    </Badge>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {selectedEntity && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Archive className="w-4 h-4 text-muted-foreground" />
              Archived {ENTITY_LABELS[selectedEntity]}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {archivedLoading ? (
              <div className="p-6 space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : !archivedRecords?.length ? (
              <p className="text-sm text-muted-foreground py-8 text-center">No archived {ENTITY_LABELS[selectedEntity].toLowerCase()}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Record</TableHead>
                    <TableHead>Archived</TableHead>
                    <TableHead className="w-24 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {archivedRecords.map((record) => (
                    <TableRow key={record.id} data-testid={`row-archived-${record.id}`}>
                      <TableCell className="font-medium text-sm">
                        {getRecordLabel(selectedEntity, record)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {record.archivedAt ? new Date(record.archivedAt).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Restore"
                            onClick={() => setConfirmAction({ type: "restore", id: record.id, label: getRecordLabel(selectedEntity, record) })}
                            data-testid={`button-restore-${record.id}`}
                          >
                            <RotateCcw className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            title="Permanently delete"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setConfirmAction({ type: "delete", id: record.id, label: getRecordLabel(selectedEntity, record) })}
                            data-testid={`button-perm-delete-${record.id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {confirmAction && selectedEntity && (
        <ConfirmDialog
          open={!!confirmAction}
          onOpenChange={(o) => { if (!o) setConfirmAction(null); }}
          title={confirmAction.type === "restore" ? "Restore Record" : "Permanently Delete Record"}
          description={
            confirmAction.type === "restore"
              ? `Restore "${confirmAction.label}" so it appears in normal views again?`
              : `Permanently delete "${confirmAction.label}"? This cannot be undone.`
          }
          confirmLabel={confirmAction.type === "restore" ? "Restore" : "Delete Permanently"}
          variant={confirmAction.type === "delete" ? "destructive" : "default"}
          isPending={restoreMutation.isPending || permanentDeleteMutation.isPending}
          onConfirm={() => {
            if (!confirmAction || !selectedEntity) return;
            if (confirmAction.type === "restore") {
              restoreMutation.mutate({ entity: selectedEntity, id: confirmAction.id });
            } else {
              permanentDeleteMutation.mutate({ entity: selectedEntity, id: confirmAction.id });
            }
          }}
        />
      )}
    </div>
  );
}

export default function AdminPage() {
  const { data: auth, refetch } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"overview" | "governance">("overview");

  const { data: overview, isLoading: overviewLoading } = useQuery<AdminOverview>({
    queryKey: ["/api/admin/overview"],
  });

  const { data: users, isLoading: usersLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
  });

  const impersonateMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("POST", `/api/admin/impersonate/${userId}`);
      const data = await res.json();
      setAccessToken(data.accessToken);
      await refetch();
    },
    onSuccess: () => {
      toast({ title: "Now impersonating user" });
      window.location.href = "/dashboard";
    },
    onError: (err: Error) => {
      toast({ title: "Impersonation failed", description: err.message, variant: "destructive" });
    },
  });

  if (!auth?.isPlatformOwner && auth?.user?.role !== "super_admin") {
    return <Redirect to="/dashboard" />;
  }

  const statCards = [
    { label: "Total Users", value: overview?.totalUsers, icon: Users },
    { label: "Organizations", value: overview?.totalOrgs, icon: Building2 },
    { label: "Active", value: overview?.activeCount, icon: CreditCard },
    { label: "Total Claims", value: overview?.totalClaims, icon: FileText },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-admin-title">Admin Panel</h1>
          <p className="text-sm text-muted-foreground">Platform owner controls and user management</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={activeTab === "overview" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("overview")}
            data-testid="button-tab-overview"
          >
            <BarChart3 className="w-4 h-4" />
            Overview
          </Button>
          <Button
            variant={activeTab === "governance" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("governance")}
            data-testid="button-tab-governance"
          >
            <Shield className="w-4 h-4" />
            Governance
          </Button>
        </div>
      </div>

      {activeTab === "governance" ? (
        <GovernanceHub />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {statCards.map((stat) => (
              <Card key={stat.label}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <stat.icon className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{stat.label}</span>
                  </div>
                  {overviewLoading ? (
                    <Skeleton className="h-7 w-16" />
                  ) : (
                    <span className="text-2xl font-bold" data-testid={`text-admin-stat-${stat.label.toLowerCase().replace(/\s+/g, "-")}`}>
                      {stat.value ?? 0}
                    </span>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-base font-semibold">Subscription Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Trialing</span>
                <Badge variant="secondary">{overview?.trialingCount ?? 0}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Active</span>
                <Badge variant="default">{overview?.activeCount ?? 0}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Canceled</span>
                <Badge variant="destructive">{overview?.canceledCount ?? 0}</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">All Users</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {usersLoading ? (
                <div className="p-6 space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : !users?.length ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No users yet</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Organization</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Joined</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((u) => (
                        <TableRow key={u.id} data-testid={`row-admin-user-${u.id}`}>
                          <TableCell>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{u.fullName}</span>
                              {u.isPlatformOwner && (
                                <Badge variant="outline" className="text-xs">
                                  <Shield className="w-3 h-3" />
                                  Owner
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{u.email}</TableCell>
                          <TableCell>{u.orgName || "\u2014"}</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`capitalize text-xs ${
                                u.subscriptionStatus === "active" ? "text-green-400 border-green-400/30" :
                                u.subscriptionStatus === "trialing" ? "text-blue-400 border-blue-400/30" :
                                u.subscriptionStatus === "canceled" ? "text-red-400 border-red-400/30" :
                                ""
                              }`}
                            >
                              {u.subscriptionStatus || "\u2014"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-xs">
                            {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "\u2014"}
                          </TableCell>
                          <TableCell>
                            {!u.isPlatformOwner && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => impersonateMutation.mutate(u.id)}
                                disabled={impersonateMutation.isPending}
                                data-testid={`button-impersonate-${u.id}`}
                              >
                                {impersonateMutation.isPending && impersonateMutation.variables === u.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Eye className="w-4 h-4" />
                                )}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
