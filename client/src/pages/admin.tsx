import { useAuth } from "@/lib/auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Users, Building2, CreditCard, FileText, Shield, Loader2, Eye } from "lucide-react";
import { Redirect } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { setAccessToken } from "@/lib/queryClient";

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

export default function AdminPage() {
  const { data: auth, refetch } = useAuth();
  const { toast } = useToast();

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

  if (!auth?.isPlatformOwner) {
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-admin-title">Admin Panel</h1>
        <p className="text-sm text-muted-foreground">
          Platform owner controls and user management
        </p>
      </div>

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
    </div>
  );
}
