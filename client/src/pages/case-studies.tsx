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
import { Plus, BookOpen, Loader2, AlertTriangle, CheckCircle, TrendingUp, Lightbulb, Trash2, Pencil, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { CaseStudy, Claim } from "@shared/schema";
import { useAuth } from "@/lib/auth";
import { authFetch } from "@/lib/api";

function formatCurrency(cents: number | null | undefined): string {
  if (!cents) return "$0";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
}

function getOutcomeBadge(outcome: string) {
  const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
    approved: { variant: "default", label: "Approved" },
    partial: { variant: "secondary", label: "Partial" },
    denied: { variant: "destructive", label: "Denied" },
  };
  const config = variants[outcome] || { variant: "secondary", label: outcome };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export default function CaseStudiesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { userType, authenticated } = useAuth();
  const isTeamUser = authenticated && userType === 'team';
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedStudy, setSelectedStudy] = useState<CaseStudy | null>(null);
  const [newStudy, setNewStudy] = useState({
    title: "",
    carrier: "",
    region: "",
    claimType: "roof",
    outcome: "approved",
    summary: "",
    turningPoint: "",
    keySignal: "",
    denialsOvercome: 0,
    frictionSignals: [] as string[],
    actionsTaken: [] as string[],
  });
  const [frictionInput, setFrictionInput] = useState("");
  const [actionInput, setActionInput] = useState("");

  const { data: studiesData, isLoading } = useQuery({
    queryKey: ["/api/case-studies"],
    queryFn: async () => {
      const res = await authFetch("/api/case-studies");
      if (!res.ok) throw new Error("Failed to load case studies");
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
    mutationFn: async (data: typeof newStudy) => {
      const res = await authFetch("/api/case-studies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create case study");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/case-studies"] });
      setIsCreateOpen(false);
      setNewStudy({ title: "", carrier: "", region: "", claimType: "roof", outcome: "approved", summary: "", turningPoint: "", keySignal: "", denialsOvercome: 0, frictionSignals: [], actionsTaken: [] });
      setFrictionInput("");
      setActionInput("");
      toast({ title: "Case Study Created", description: "Your case study has been saved." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create case study", variant: "destructive" });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (claimId: string) => {
      const res = await authFetch(`/api/case-studies/generate-from-claim/${claimId}`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to generate case study");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/case-studies"] });
      toast({ title: "Case Study Generated", description: "AI has created a case study from your claim data." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to generate case study", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await authFetch(`/api/case-studies/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/case-studies"] });
      toast({ title: "Deleted", description: "Case study removed." });
    },
  });

  const studies: CaseStudy[] = studiesData?.caseStudies || [];
  const claims: Claim[] = claimsData?.claims || [];
  const resolvedClaims = claims.filter(c => c.status === 'resolved' || c.status === 'closed');

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6" data-testid="case-studies-page">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <BookOpen className="h-8 w-8" />
              Case Studies
            </h1>
            <p className="text-muted-foreground">Training-grade templates from successful claims</p>
          </div>
          <div className="flex gap-2">
            {resolvedClaims.length > 0 && (
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" data-testid="generate-from-claim-btn">
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate from Claim
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Generate Case Study from Claim</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Select a resolved claim to automatically generate a case study from its history.
                    </p>
                    <div className="grid gap-2">
                      {resolvedClaims.map((claim) => (
                        <Button
                          key={claim.id}
                          variant="outline"
                          className="justify-start"
                          onClick={() => generateMutation.mutate(claim.id)}
                          disabled={generateMutation.isPending}
                        >
                          {claim.maskedId} - {claim.carrier} - {claim.propertyAddress?.substring(0, 30)}
                        </Button>
                      ))}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
              <DialogTrigger asChild>
                <Button data-testid="create-case-study-btn">
                  <Plus className="h-4 w-4 mr-2" />
                  New Case Study
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create Case Study</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Title</Label>
                      <Input
                        placeholder="Initial denial reversed after..."
                        value={newStudy.title}
                        onChange={(e) => setNewStudy(prev => ({ ...prev, title: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Carrier</Label>
                      <Input
                        placeholder="State Farm, Allstate, etc."
                        value={newStudy.carrier}
                        onChange={(e) => setNewStudy(prev => ({ ...prev, carrier: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Region</Label>
                      <Input
                        placeholder="Alabama, Southeast, etc."
                        value={newStudy.region}
                        onChange={(e) => setNewStudy(prev => ({ ...prev, region: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Claim Type</Label>
                      <Select value={newStudy.claimType} onValueChange={(v) => setNewStudy(prev => ({ ...prev, claimType: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="roof">Roof</SelectItem>
                          <SelectItem value="water">Water</SelectItem>
                          <SelectItem value="fire">Fire</SelectItem>
                          <SelectItem value="wind">Wind</SelectItem>
                          <SelectItem value="hail">Hail</SelectItem>
                          <SelectItem value="general">General</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Outcome</Label>
                      <Select value={newStudy.outcome} onValueChange={(v) => setNewStudy(prev => ({ ...prev, outcome: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="approved">Approved</SelectItem>
                          <SelectItem value="partial">Partial</SelectItem>
                          <SelectItem value="denied">Denied</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Summary</Label>
                    <Textarea
                      placeholder="Describe what happened with this claim..."
                      value={newStudy.summary}
                      onChange={(e) => setNewStudy(prev => ({ ...prev, summary: e.target.value }))}
                      rows={3}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Friction Signals (barriers encountered)</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="e.g., Delayed response, Scope dispute..."
                        value={frictionInput}
                        onChange={(e) => setFrictionInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && frictionInput.trim()) {
                            e.preventDefault();
                            setNewStudy(prev => ({ ...prev, frictionSignals: [...prev.frictionSignals, frictionInput.trim()] }));
                            setFrictionInput("");
                          }
                        }}
                      />
                      <Button 
                        type="button" 
                        variant="secondary" 
                        size="sm"
                        onClick={() => {
                          if (frictionInput.trim()) {
                            setNewStudy(prev => ({ ...prev, frictionSignals: [...prev.frictionSignals, frictionInput.trim()] }));
                            setFrictionInput("");
                          }
                        }}
                      >
                        Add
                      </Button>
                    </div>
                    {newStudy.frictionSignals.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {newStudy.frictionSignals.map((signal, idx) => (
                          <Badge key={idx} variant="secondary" className="cursor-pointer" onClick={() => setNewStudy(prev => ({ ...prev, frictionSignals: prev.frictionSignals.filter((_, i) => i !== idx) }))}>
                            {signal} ×
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Actions Taken (how you responded)</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="e.g., Requested re-inspection, Filed supplement..."
                        value={actionInput}
                        onChange={(e) => setActionInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && actionInput.trim()) {
                            e.preventDefault();
                            setNewStudy(prev => ({ ...prev, actionsTaken: [...prev.actionsTaken, actionInput.trim()] }));
                            setActionInput("");
                          }
                        }}
                      />
                      <Button 
                        type="button" 
                        variant="secondary" 
                        size="sm"
                        onClick={() => {
                          if (actionInput.trim()) {
                            setNewStudy(prev => ({ ...prev, actionsTaken: [...prev.actionsTaken, actionInput.trim()] }));
                            setActionInput("");
                          }
                        }}
                      >
                        Add
                      </Button>
                    </div>
                    {newStudy.actionsTaken.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {newStudy.actionsTaken.map((action, idx) => (
                          <Badge key={idx} variant="outline" className="cursor-pointer" onClick={() => setNewStudy(prev => ({ ...prev, actionsTaken: prev.actionsTaken.filter((_, i) => i !== idx) }))}>
                            {action} ×
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Turning Point</Label>
                    <Textarea
                      placeholder="What was the key moment that changed the outcome?"
                      value={newStudy.turningPoint}
                      onChange={(e) => setNewStudy(prev => ({ ...prev, turningPoint: e.target.value }))}
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Key Signal / Takeaway</Label>
                    <Input
                      placeholder="The main learning from this case..."
                      value={newStudy.keySignal}
                      onChange={(e) => setNewStudy(prev => ({ ...prev, keySignal: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Denials Overcome</Label>
                    <Input
                      type="number"
                      min="0"
                      value={newStudy.denialsOvercome}
                      onChange={(e) => setNewStudy(prev => ({ ...prev, denialsOvercome: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                  <Button 
                    onClick={() => createMutation.mutate(newStudy)} 
                    disabled={createMutation.isPending || !newStudy.title || !newStudy.carrier}
                    className="w-full"
                  >
                    {createMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Create Case Study
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {studies.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <BookOpen className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">No Case Studies Yet</h3>
              <p className="text-muted-foreground text-center max-w-md mt-2">
                Document your successful claims to build a library of training templates. 
                These show the friction you faced and how you overcame it.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {studies.map((study) => (
              <Card key={study.id} className="hover:border-primary/50 transition-colors" data-testid={`case-study-${study.id}`}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-primary font-mono text-sm">{study.caseId}</span>
                        <Badge variant="outline">{study.carrier}</Badge>
                        {getOutcomeBadge(study.outcome)}
                      </div>
                      <CardTitle className="text-lg">{study.title}</CardTitle>
                      {study.region && (
                        <CardDescription>{study.region}</CardDescription>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setSelectedStudy(study)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {isTeamUser && (
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => {
                            if (confirm("Delete this case study?")) {
                              deleteMutation.mutate(study.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {study.summary && (
                    <p className="text-sm text-muted-foreground">{study.summary}</p>
                  )}
                  
                  {study.frictionSignals && study.frictionSignals.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold flex items-center gap-1 text-amber-500 mb-2">
                        <AlertTriangle className="h-4 w-4" />
                        Friction Signals
                      </h4>
                      <ul className="text-sm space-y-1">
                        {study.frictionSignals.map((signal, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-muted-foreground">•</span>
                            {signal}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {study.actionsTaken && study.actionsTaken.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold flex items-center gap-1 text-blue-500 mb-2">
                        <CheckCircle className="h-4 w-4" />
                        Actions Taken
                      </h4>
                      <ul className="text-sm space-y-1">
                        {study.actionsTaken.map((action, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-muted-foreground">•</span>
                            {action}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {study.turningPoint && (
                    <div>
                      <h4 className="text-sm font-semibold flex items-center gap-1 text-green-500 mb-1">
                        <TrendingUp className="h-4 w-4" />
                        Turning Point
                      </h4>
                      <p className="text-sm">{study.turningPoint}</p>
                    </div>
                  )}
                  
                  {study.keySignal && (
                    <div className="bg-primary/5 p-3 rounded-lg">
                      <h4 className="text-sm font-semibold flex items-center gap-1 text-primary mb-1">
                        <Lightbulb className="h-4 w-4" />
                        Key Signal
                      </h4>
                      <p className="text-sm">{study.keySignal}</p>
                    </div>
                  )}
                  
                  <div className="flex gap-4 pt-2 border-t text-sm text-muted-foreground">
                    {study.denialsOvercome !== null && study.denialsOvercome > 0 && (
                      <span>{study.denialsOvercome} denial{study.denialsOvercome > 1 ? 's' : ''} overcome</span>
                    )}
                    {study.amountRecovered && (
                      <span className="text-green-500 font-medium">{formatCurrency(study.amountRecovered)} recovered</span>
                    )}
                    {study.daysToResolution && (
                      <span>{study.daysToResolution} days to resolution</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
