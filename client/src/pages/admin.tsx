import { useAuth } from "@/lib/auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Users, Building2, CreditCard, FileText, Shield, Loader2 } from "lucide-react";
import { Redirect } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";

interface AdminOverview {
  totalUsers: number;
  totalOrgs: number;
  totalSubscriptions: number;
  totalClaims: number;
  founderCount: number;
  founderMax: number;
}

interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  isAdmin: boolean;
  createdAt: string;
  orgName: string | null;
  orgId: string | null;
  role: string | null;
  tier: string | null;
  subscriptionStatus: string | null;
}

export default function AdminPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: overview, isLoading: overviewLoading } = useQuery<AdminOverview>({
    queryKey: ["/api/admin/overview"],
  });

  const { data: users, isLoading: usersLoading } = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
  });

  const tierMutation = useMutation({
    mutationFn: async ({ userId, tier }: { userId: string; tier: string }) => {
      await apiRequest("PATCH", `/api/admin/users/${userId}/tier`, { tier });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/overview"] });
      toast({ title: "Tier updated" });
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  if (!user?.isAdmin) {
    return <Redirect to="/dashboard" />;
  }

  const statCards = [
    { label: "Total Users", value: overview?.totalUsers, icon: Users },
    { label: "Organizations", value: overview?.totalOrgs, icon: Building2 },
    { label: "Subscriptions", value: overview?.totalSubscriptions, icon: CreditCard },
    { label: "Total Claims", value: overview?.totalClaims, icon: FileText },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-admin-title">Admin Panel</h1>
        <p className="text-sm text-muted-foreground">
          Manage all users, organizations, and subscriptions
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
          <CardTitle className="text-base font-semibold">Founder Slots</CardTitle>
          <Badge variant="outline" data-testid="badge-founder-slots">
            {overview?.founderCount ?? 0} / {overview?.founderMax ?? 3} used
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="w-full bg-muted rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all"
              style={{ width: `${((overview?.founderCount ?? 0) / (overview?.founderMax ?? 3)) * 100}%` }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">All Signups</CardTitle>
        </CardHeader>
        <CardContent>
          {usersLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : !users?.length ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No signups yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-2 pr-4 text-xs font-medium text-muted-foreground">Name</th>
                    <th className="text-left py-2 pr-4 text-xs font-medium text-muted-foreground">Email</th>
                    <th className="text-left py-2 pr-4 text-xs font-medium text-muted-foreground">Organization</th>
                    <th className="text-left py-2 pr-4 text-xs font-medium text-muted-foreground">Tier</th>
                    <th className="text-left py-2 pr-4 text-xs font-medium text-muted-foreground">Status</th>
                    <th className="text-left py-2 pr-4 text-xs font-medium text-muted-foreground">Signed Up</th>
                    <th className="text-left py-2 text-xs font-medium text-muted-foreground">Change Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-border/30" data-testid={`row-admin-user-${u.id}`}>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{u.fullName}</span>
                          {u.isAdmin && (
                            <Badge variant="outline" className="text-xs">
                              <Shield className="w-3 h-3 mr-1" />
                              Admin
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">{u.email}</td>
                      <td className="py-3 pr-4">{u.orgName || "—"}</td>
                      <td className="py-3 pr-4">
                        <Badge variant="outline" className="capitalize text-xs">
                          {u.tier || "none"}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4">
                        <Badge
                          variant="outline"
                          className={`capitalize text-xs ${
                            u.subscriptionStatus === "active" ? "text-green-400 border-green-400/30" :
                            u.subscriptionStatus === "trialing" ? "text-blue-400 border-blue-400/30" :
                            u.subscriptionStatus === "canceled" ? "text-red-400 border-red-400/30" :
                            ""
                          }`}
                        >
                          {u.subscriptionStatus || "—"}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground text-xs">
                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                      </td>
                      <td className="py-3">
                        {u.orgId && !u.isAdmin ? (
                          <Select
                            value={u.tier || "pro"}
                            onValueChange={(tier) => tierMutation.mutate({ userId: u.id, tier })}
                          >
                            <SelectTrigger className="w-[120px]" data-testid={`select-tier-${u.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="founder">Founder</SelectItem>
                              <SelectItem value="pro">Pro</SelectItem>
                              <SelectItem value="team">Team</SelectItem>
                              <SelectItem value="enterprise">Enterprise</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
