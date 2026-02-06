import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Users, Plus, Shield } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { authFetch } from "@/lib/api";
import { Redirect } from "wouter";

interface TeamCredential {
  id: string;
  username: string;
  accessLevel: 'admin' | 'editor' | 'viewer';
  createdAt: string;
  updatedAt: string;
}

async function fetchTeamCredentials(): Promise<TeamCredential[]> {
  const res = await authFetch('/api/admin/team-credentials');
  if (!res.ok) throw new Error('Failed to fetch team credentials');
  return res.json();
}

async function createTeamCredential(data: { username: string; password: string; accessLevel: string }) {
  const res = await authFetch('/api/admin/team-credentials', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to create team credential');
  }
  return res.json();
}

async function updateAccessLevel(id: string, accessLevel: string) {
  const res = await authFetch(`/api/admin/team-credentials/${id}/access-level`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessLevel }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to update access level');
  }
  return res.json();
}

export default function AdminTeamPage() {
  const { accessLevel } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [newAccessLevel, setNewAccessLevel] = useState<string>("viewer");

  if (accessLevel !== 'admin') {
    return <Redirect to="/" />;
  }

  const { data: teamCredentials = [], isLoading } = useQuery({
    queryKey: ['team-credentials'],
    queryFn: fetchTeamCredentials,
  });

  const createMutation = useMutation({
    mutationFn: createTeamCredential,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-credentials'] });
      setShowForm(false);
      setUsername("");
      setPassword("");
      setNewAccessLevel("viewer");
      toast({ title: "Team login created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, accessLevel }: { id: string; accessLevel: string }) => 
      updateAccessLevel(id, accessLevel),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-credentials'] });
      toast({ title: "Access level updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({ username, password, accessLevel: newAccessLevel });
  };

  const getAccessLevelColor = (level: string) => {
    switch (level) {
      case 'admin': return 'bg-amber-500/20 text-amber-500 border-amber-500/30';
      case 'editor': return 'bg-blue-500/20 text-blue-500 border-blue-500/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Layout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="w-6 h-6" />
              Team Management
            </h1>
            <p className="text-muted-foreground mt-1">
              Create and manage team login credentials with different access levels
            </p>
          </div>
          <Button onClick={() => setShowForm(!showForm)} data-testid="button-add-team">
            <Plus className="w-4 h-4 mr-2" />
            Add Team Login
          </Button>
        </div>

        {showForm && (
          <Card>
            <CardHeader>
              <CardTitle>Create New Team Login</CardTitle>
              <CardDescription>
                Create credentials that can be shared with team members
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="team-member-1"
                      required
                      data-testid="input-new-username"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min 6 characters"
                      required
                      minLength={6}
                      data-testid="input-new-password"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="accessLevel">Access Level</Label>
                    <Select value={newAccessLevel} onValueChange={setNewAccessLevel}>
                      <SelectTrigger data-testid="select-access-level">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="viewer">Viewer (Read Only)</SelectItem>
                        <SelectItem value="editor">Editor (Add/Edit)</SelectItem>
                        <SelectItem value="admin">Admin (Full Access)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-create-team">
                    {createMutation.isPending ? "Creating..." : "Create Login"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Team Credentials
            </CardTitle>
            <CardDescription>
              All team login credentials and their access levels
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-muted-foreground">Loading...</p>
            ) : teamCredentials.length === 0 ? (
              <p className="text-muted-foreground">No team credentials found</p>
            ) : (
              <div className="space-y-3">
                {teamCredentials.map((cred) => (
                  <div 
                    key={cred.id} 
                    className="flex items-center justify-between p-4 rounded-lg border bg-card"
                    data-testid={`team-credential-${cred.id}`}
                  >
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="font-medium font-mono">{cred.username}</p>
                        <p className="text-xs text-muted-foreground">
                          Created {new Date(cred.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Select 
                        value={cred.accessLevel} 
                        onValueChange={(value) => updateMutation.mutate({ id: cred.id, accessLevel: value })}
                      >
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">Viewer</SelectItem>
                          <SelectItem value="editor">Editor</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <Badge className={getAccessLevelColor(cred.accessLevel)}>
                        {cred.accessLevel}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Access Level Guide</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="p-4 rounded-lg border">
                <Badge className={getAccessLevelColor('viewer')}>Viewer</Badge>
                <p className="mt-2 text-sm text-muted-foreground">
                  Can view all adjusters, claims, and reports. Cannot add or edit data.
                </p>
              </div>
              <div className="p-4 rounded-lg border">
                <Badge className={getAccessLevelColor('editor')}>Editor</Badge>
                <p className="mt-2 text-sm text-muted-foreground">
                  Can view, add, and edit adjusters, claims, and interactions. Cannot delete or manage team.
                </p>
              </div>
              <div className="p-4 rounded-lg border">
                <Badge className={getAccessLevelColor('admin')}>Admin</Badge>
                <p className="mt-2 text-sm text-muted-foreground">
                  Full access including team management, deleting records, and all administrative functions.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
