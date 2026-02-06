import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bot, Lightbulb, AlertTriangle, CheckCircle, Loader2, Zap, Target, Shield, MessageSquare, Plus, Trash2, Save, Users } from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchAdjusters, fetchClaims, authFetch } from "@/lib/api";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth";

interface TacticalAdvice {
  strategy: string;
  keyPoints: string[];
  riskLevel: 'low' | 'medium' | 'high';
  suggestedActions: string[];
}

interface TacticalNote {
  id: string;
  claimId: string | null;
  adjusterId: string | null;
  content: string;
  author: string | null;
  isAiGenerated: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function TacticalAdvisor() {
  const [selectedAdjuster, setSelectedAdjuster] = useState<string>("");
  const [selectedClaim, setSelectedClaim] = useState<string>("");
  const [situation, setSituation] = useState("");
  const [advice, setAdvice] = useState<TacticalAdvice | null>(null);
  const [newNote, setNewNote] = useState("");
  const [activeTab, setActiveTab] = useState("ai-advice");
  const queryClient = useQueryClient();
  const { userType, authenticated } = useAuth();
  const isTeamUser = authenticated && userType === 'team';
  const isTrialUser = authenticated && userType === 'trial';

  const { data: adjusters = [] } = useQuery({
    queryKey: ['adjusters'],
    queryFn: fetchAdjusters,
  });

  const { data: claims = [] } = useQuery({
    queryKey: ['claims'],
    queryFn: fetchClaims,
  });

  const claimId = selectedClaim && selectedClaim !== 'none' ? selectedClaim : undefined;
  const adjusterId = selectedAdjuster && selectedAdjuster !== 'none' ? selectedAdjuster : undefined;

  const { data: notes = [], isLoading: notesLoading } = useQuery({
    queryKey: ['tactical-notes', claimId, adjusterId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (claimId) params.append('claimId', claimId);
      if (adjusterId) params.append('adjusterId', adjusterId);
      const res = await authFetch(`/api/tactical-notes?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch notes');
      return res.json();
    },
    enabled: !!(claimId || adjusterId),
  });

  const getAdviceMutation = useMutation({
    mutationFn: async ({ adjusterId, claimId, situation, autoGenerate }: { adjusterId?: string; claimId?: string; situation?: string; autoGenerate?: boolean }) => {
      const res = await authFetch('/api/tactical-advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adjusterId, claimId, situation, autoGenerate }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to get advice');
      }
      return res.json();
    },
    onSuccess: (data) => {
      setAdvice(data.advice);
    },
  });

  const createNoteMutation = useMutation({
    mutationFn: async (noteData: { claimId?: string; adjusterId?: string; content: string; author?: string; isAiGenerated?: boolean }) => {
      const res = await authFetch('/api/tactical-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(noteData),
      });
      if (!res.ok) throw new Error('Failed to create note');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tactical-notes'] });
      setNewNote("");
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      const res = await authFetch(`/api/tactical-notes/${noteId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete note');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tactical-notes'] });
    },
  });

  const handleGetAdvice = () => {
    if (!situation.trim()) return;
    getAdviceMutation.mutate({
      adjusterId,
      claimId,
      situation,
    });
  };

  const handleAutoGenerate = () => {
    if (!adjusterId && !claimId) return;
    getAdviceMutation.mutate({
      adjusterId,
      claimId,
      autoGenerate: true,
    });
  };

  const handleSaveAdviceAsNote = () => {
    if (!advice || (!claimId && !adjusterId)) return;
    
    const noteContent = `AI Tactical Advice:\n\nStrategy: ${advice.strategy}\n\nKey Points:\n${advice.keyPoints.map(p => `• ${p}`).join('\n')}\n\nSuggested Actions:\n${advice.suggestedActions.map((a, i) => `${i + 1}. ${a}`).join('\n')}\n\nRisk Level: ${advice.riskLevel.toUpperCase()}`;
    
    createNoteMutation.mutate({
      claimId,
      adjusterId,
      content: noteContent,
      isAiGenerated: true,
    });
  };

  const handleAddNote = () => {
    if (!newNote.trim() || (!claimId && !adjusterId)) return;
    createNoteMutation.mutate({
      claimId,
      adjusterId,
      content: newNote.trim(),
      isAiGenerated: false,
    });
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low': return 'bg-emerald-500/20 text-emerald-400';
      case 'medium': return 'bg-yellow-500/20 text-yellow-400';
      case 'high': return 'bg-red-500/20 text-red-400';
      default: return 'bg-muted';
    }
  };

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-lg">
            <Bot className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Tactical Advisor</h1>
            <p className="text-muted-foreground">AI-powered claim strategy recommendations & team notes</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5" />
                Situation Analysis
              </CardTitle>
              <CardDescription>
                Describe your current situation for strategic advice
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">Adjuster (Optional)</label>
                  <Select value={selectedAdjuster} onValueChange={setSelectedAdjuster}>
                    <SelectTrigger data-testid="select-adjuster">
                      <SelectValue placeholder="Select adjuster..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {adjusters.map((adj: any) => (
                        <SelectItem key={adj.id} value={adj.id}>{adj.name} - {adj.carrier}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm text-muted-foreground mb-2 block">Claim (Optional)</label>
                  <Select value={selectedClaim} onValueChange={setSelectedClaim}>
                    <SelectTrigger data-testid="select-claim">
                      <SelectValue placeholder="Select claim..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {claims.map((claim: any) => (
                        <SelectItem key={claim.id} value={claim.id}>{claim.maskedId} - {claim.carrier}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="text-sm text-muted-foreground mb-2 block">Describe Your Situation</label>
                <Textarea
                  placeholder="Example: The adjuster denied my roof claim citing pre-existing damage, but I have photos from before the storm..."
                  value={situation}
                  onChange={(e) => setSituation(e.target.value)}
                  className="min-h-[150px]"
                  data-testid="input-situation"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button 
                  onClick={handleGetAdvice} 
                  disabled={isTrialUser || !situation.trim() || getAdviceMutation.isPending}
                  className="w-full"
                  data-testid="button-get-advice"
                >
                  {getAdviceMutation.isPending && situation.trim() ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 mr-2" />
                      Get Tactical Advice
                    </>
                  )}
                </Button>
                <Button 
                  onClick={handleAutoGenerate}
                  disabled={isTrialUser || (!adjusterId && !claimId) || getAdviceMutation.isPending}
                  variant="secondary"
                  className="w-full"
                  data-testid="button-auto-generate"
                >
                  {getAdviceMutation.isPending && !situation.trim() ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Bot className="w-4 h-4 mr-2" />
                      Auto-Generate
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="ai-advice" className="flex items-center gap-2" data-testid="tab-ai-advice">
                    <Lightbulb className="w-4 h-4" />
                    AI Advice
                  </TabsTrigger>
                  <TabsTrigger value="team-notes" className="flex items-center gap-2" data-testid="tab-team-notes">
                    <Users className="w-4 h-4" />
                    Team Notes
                    {notes.length > 0 && (
                      <Badge variant="secondary" className="ml-1">{notes.length}</Badge>
                    )}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent>
              {activeTab === "ai-advice" ? (
                <>
                  {isTrialUser ? (
                    <div className="h-[380px] flex items-center justify-center text-muted-foreground">
                      <div className="text-center max-w-md">
                        <Bot className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <h4 className="font-semibold text-foreground mb-2">AI Advice Not Available</h4>
                        <p className="text-sm mb-4">
                          AI-powered tactical advice is a premium feature not included in the free trial.
                          Upgrade to access personalized claim strategies and adjuster insights.
                        </p>
                        <Button 
                          variant="default" 
                          onClick={() => window.location.href = '/pricing'}
                          data-testid="button-upgrade-trial"
                        >
                          View Pricing
                        </Button>
                      </div>
                    </div>
                  ) : advice ? (
                    <ScrollArea className="h-[380px] pr-4">
                      <div className="space-y-6">
                        <div className="flex items-center justify-between">
                          {advice.riskLevel && (
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-muted-foreground">Risk Assessment:</span>
                              <Badge className={getRiskColor(advice.riskLevel)}>
                                {advice.riskLevel === 'high' && <AlertTriangle className="w-3 h-3 mr-1" />}
                                {advice.riskLevel === 'low' && <CheckCircle className="w-3 h-3 mr-1" />}
                                {advice.riskLevel.toUpperCase()} RISK
                              </Badge>
                            </div>
                          )}
                          {(claimId || adjusterId) && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleSaveAdviceAsNote}
                              disabled={createNoteMutation.isPending}
                              data-testid="button-save-advice"
                            >
                              <Save className="w-4 h-4 mr-1" />
                              Save to Notes
                            </Button>
                          )}
                        </div>

                        {advice.strategy && (
                          <div>
                            <h4 className="font-semibold mb-2 flex items-center gap-2">
                              <Shield className="w-4 h-4" />
                              Strategy Overview
                            </h4>
                            <p className="text-muted-foreground text-sm leading-relaxed">{advice.strategy}</p>
                          </div>
                        )}

                        {advice.keyPoints && advice.keyPoints.length > 0 && (
                          <div>
                            <h4 className="font-semibold mb-2">Key Points</h4>
                            <ul className="space-y-2">
                              {advice.keyPoints.map((point: string, i: number) => (
                                <li key={i} className="flex items-start gap-2 text-sm">
                                  <CheckCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                                  <span className="text-muted-foreground">{point}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {advice.suggestedActions && advice.suggestedActions.length > 0 && (
                          <div>
                            <h4 className="font-semibold mb-2">Suggested Actions</h4>
                            <div className="space-y-2">
                              {advice.suggestedActions.map((action: string, i: number) => (
                                <div key={i} className="flex items-start gap-2 bg-primary/5 p-3 rounded-lg text-sm">
                                  <span className="bg-primary text-primary-foreground w-5 h-5 rounded-full flex items-center justify-center text-xs shrink-0">
                                    {i + 1}
                                  </span>
                                  <span>{action}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="h-[380px] flex items-center justify-center text-muted-foreground">
                      <div className="text-center">
                        <Bot className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>Describe your situation to get AI-powered tactical advice</p>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  {!claimId && !adjusterId ? (
                    <div className="h-[380px] flex items-center justify-center text-muted-foreground">
                      <div className="text-center">
                        <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>Select an adjuster or claim to view and add team notes</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Textarea
                          placeholder="Add your tactical insights, notes, or advice for the team..."
                          value={newNote}
                          onChange={(e) => setNewNote(e.target.value)}
                          className="min-h-[80px]"
                          data-testid="input-team-note"
                        />
                        <Button
                          onClick={handleAddNote}
                          disabled={!newNote.trim() || createNoteMutation.isPending}
                          size="sm"
                          className="w-full"
                          data-testid="button-add-note"
                        >
                          {createNoteMutation.isPending ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <Plus className="w-4 h-4 mr-2" />
                          )}
                          Add Note
                        </Button>
                      </div>

                      <ScrollArea className="h-[260px]">
                        {notesLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                          </div>
                        ) : notes.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground">
                            <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-20" />
                            <p className="text-sm">No team notes yet. Add the first one!</p>
                          </div>
                        ) : (
                          <div className="space-y-3 pr-4">
                            {notes.map((note: TacticalNote) => (
                              <div 
                                key={note.id} 
                                className={`p-3 rounded-lg border ${note.isAiGenerated ? 'bg-primary/5 border-primary/20' : 'bg-muted/30 border-border/50'}`}
                                data-testid={`note-${note.id}`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                      {note.isAiGenerated && (
                                        <Badge variant="secondary" className="text-xs">
                                          <Bot className="w-3 h-3 mr-1" />
                                          AI Generated
                                        </Badge>
                                      )}
                                      <span className="text-xs text-muted-foreground">
                                        {format(new Date(note.createdAt), 'MMM d, yyyy h:mm a')}
                                      </span>
                                    </div>
                                    <p className="text-sm whitespace-pre-wrap">{note.content}</p>
                                  </div>
                                  {isTeamUser && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                                      onClick={() => deleteNoteMutation.mutate(note.id)}
                                      data-testid={`delete-note-${note.id}`}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </ScrollArea>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Quick Scenarios</CardTitle>
            <CardDescription>Common situations - click to get instant advice</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[
                "Adjuster denied claim, how do I appeal?",
                "Low initial estimate, need supplement strategy",
                "Adjuster not responding to communications",
                "Preparing for re-inspection",
                "Carrier offering unfair settlement",
                "Need to escalate to supervisor",
              ].map((scenario, i) => (
                <Button
                  key={i}
                  variant="outline"
                  className="h-auto py-3 text-left justify-start"
                  onClick={() => {
                    setSituation(scenario);
                  }}
                  data-testid={`button-scenario-${i}`}
                >
                  {scenario}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
