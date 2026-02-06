import { Layout } from "@/components/layout";
import { useParams, useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { User, Plus, MapPin, Calendar, FileText, ClipboardList, Phone, Mail, Camera, AlertCircle, Trash2, Paperclip, Upload, File, Image, Mic, TrendingUp, BarChart3, Clock, Tag, CheckCircle, XCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchAdjuster, createInteraction, updateAdjuster, fetchClaims, fetchAdjusterIntelligence, authFetch } from "@/lib/api";
import { useUpload } from "@/hooks/use-upload";
import { useToast } from "@/hooks/use-toast";
import { AudioTranscribe } from "@/components/audio-transcribe";
import { useAuth } from "@/lib/auth";

export default function AdjusterProfile() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { userType, authenticated } = useAuth();
  const isTeamUser = authenticated && userType === 'team';
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [isEditingRisk, setIsEditingRisk] = useState(false);
  
  const { data: adjuster, isLoading } = useQuery({
    queryKey: ['adjuster', id],
    queryFn: () => fetchAdjuster(id!),
    enabled: !!id,
  });

  const { data: allClaims = [] } = useQuery({
    queryKey: ['claims'],
    queryFn: fetchClaims,
  });

  const { data: intelligence, isLoading: intelLoading } = useQuery({
    queryKey: ['adjuster-intelligence', id],
    queryFn: () => fetchAdjusterIntelligence(id!),
    enabled: !!id,
  });

  const createInteractionMutation = useMutation({
    mutationFn: ({ adjusterId, interaction }: { adjusterId: string; interaction: any }) =>
      createInteraction(adjusterId, interaction),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adjuster', id] });
      toast({
        title: "Success",
        description: "Interaction logged successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to log interaction",
        variant: "destructive",
      });
    },
  });

  const updateAdjusterMutation = useMutation({
    mutationFn: ({ adjusterId, data }: { adjusterId: string; data: any }) =>
      updateAdjuster(adjusterId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adjuster', id] });
      toast({
        title: "Saved",
        description: "Changes saved successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save changes",
        variant: "destructive",
      });
    },
  });

  const [newLog, setNewLog] = useState<{
    type: 'Call' | 'Email' | 'Inspection' | 'Reinspection' | 'Escalation' | 'Other';
    description: string;
    date: string;
    claimRef: string;
  }>({
    type: 'Call',
    description: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    claimRef: ''
  });

  const [editNotes, setEditNotes] = useState('');
  const [editRisk, setEditRisk] = useState('');
  const [editWhatWorked, setEditWhatWorked] = useState('');
  const [isEditingWhatWorked, setIsEditingWhatWorked] = useState(false);

  const deleteAdjusterMutation = useMutation({
    mutationFn: (adjusterId: string) =>
      authFetch(`/api/adjusters/${adjusterId}`, { method: 'DELETE' }).then(res => {
        if (!res.ok) throw new Error('Failed to delete');
        return res.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adjusters'] });
      toast({
        title: "Deleted",
        description: "Adjuster profile removed",
      });
      setLocation('/');
    },
  });

  const { uploadFile, isUploading } = useUpload({
    onSuccess: async (response) => {
      if (adjuster) {
        await authFetch(`/api/adjusters/${adjuster.id}/documents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: response.metadata.name,
            objectPath: response.objectPath,
            contentType: response.metadata.contentType,
            size: response.metadata.size,
          }),
        });
        queryClient.invalidateQueries({ queryKey: ['adjuster', id] });
        toast({ title: "Uploaded", description: "Document added successfully" });
      }
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to upload document", variant: "destructive" });
    }
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: (docId: string) =>
      authFetch(`/api/documents/${docId}`, { method: 'DELETE' }).then(res => res.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adjuster', id] });
      toast({ title: "Deleted", description: "Document removed" });
    },
  });

  const [analyzingDocId, setAnalyzingDocId] = useState<string | null>(null);

  const analyzeDocumentMutation = useMutation({
    mutationFn: async ({ documentUrl, documentName, adjusterId }: { documentUrl: string; documentName: string; adjusterId: string }) => {
      const res = await authFetch('/api/analyze-and-save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentUrl, documentName, adjusterId }),
      });
      if (!res.ok) throw new Error('Analysis failed');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['adjuster', id] });
      queryClient.invalidateQueries({ queryKey: ['adjuster-intelligence', id] });
      toast({ 
        title: "Document Analyzed", 
        description: data.message || "Information extracted and saved",
      });
      setAnalyzingDocId(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to analyze document", variant: "destructive" });
      setAnalyzingDocId(null);
    },
  });

  const handleAnalyzeDocument = (doc: any) => {
    if (!adjuster) return;
    setAnalyzingDocId(doc.id);
    analyzeDocumentMutation.mutate({
      documentUrl: doc.objectPath,
      documentName: doc.name,
      adjusterId: adjuster.id,
    });
  };

  const getDocumentIcon = (contentType: string) => {
    if (contentType.startsWith('image/')) return <Image className="w-5 h-5" />;
    if (contentType.startsWith('audio/')) return <Mic className="w-5 h-5" />;
    return <File className="w-5 h-5" />;
  };

  const getInteractionIcon = (type: string) => {
    switch (type) {
      case 'Call': return <Phone className="w-4 h-4" />;
      case 'Email': return <Mail className="w-4 h-4" />;
      case 'Inspection':
      case 'Reinspection': return <Camera className="w-4 h-4" />;
      case 'Escalation': return <AlertCircle className="w-4 h-4 text-destructive" />;
      default: return <ClipboardList className="w-4 h-4" />;
    }
  };

  const handleAddLog = () => {
    if (adjuster && newLog.description) {
      createInteractionMutation.mutate({
        adjusterId: adjuster.id,
        interaction: {
          date: newLog.date,
          type: newLog.type,
          description: newLog.description,
          claimId: newLog.claimRef && newLog.claimRef !== 'none' ? newLog.claimRef : undefined,
        }
      });
      setNewLog({ type: 'Call', description: '', date: format(new Date(), 'yyyy-MM-dd'), claimRef: '' });
      setIsLogOpen(false);
    }
  };

  const handleSaveNotes = () => {
    if (adjuster) {
      updateAdjusterMutation.mutate({
        adjusterId: adjuster.id,
        data: { internalNotes: editNotes }
      });
      setIsEditingNotes(false);
    }
  };

  const handleSaveRisk = () => {
    if (adjuster) {
      updateAdjusterMutation.mutate({
        adjusterId: adjuster.id,
        data: { riskImpression: editRisk }
      });
      setIsEditingRisk(false);
    }
  };

  const handleSaveWhatWorked = () => {
    if (adjuster) {
      updateAdjusterMutation.mutate({
        adjusterId: adjuster.id,
        data: { whatWorked: editWhatWorked }
      });
      setIsEditingWhatWorked(false);
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="p-8 text-center text-muted-foreground">Loading...</div>
      </Layout>
    );
  }

  if (!adjuster) {
    return (
      <Layout>
        <div className="p-8 text-center text-muted-foreground">Adjuster not found</div>
      </Layout>
    );
  }

  const firstInteractionDate = adjuster.interactions.length > 0 
    ? adjuster.interactions.reduce((earliest, int) => 
        int.date < earliest ? int.date : earliest, adjuster.interactions[0].date)
    : null;

  const totalClaims = adjuster.claims.length;

  return (
    <Layout>
      <div className="p-6 md:p-8 space-y-8 animate-in fade-in duration-500">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center border-2 border-border">
              <User className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight" data-testid="text-adjuster-name">{adjuster.name}</h1>
              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <a 
                  href={`/carriers/${encodeURIComponent(adjuster.carrier)}`}
                  className="text-lg text-primary hover:underline cursor-pointer"
                  data-testid="text-adjuster-carrier"
                >
                  {adjuster.carrier}
                </a>
                {adjuster.region && (
                  <Badge variant="outline" className="gap-1">
                    <MapPin className="w-3 h-3" />
                    {adjuster.region}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex gap-3">
             {isTeamUser && (
               <Button 
                 variant="outline" 
                 size="icon" 
                 className="text-muted-foreground hover:text-destructive transition-colors"
                 onClick={() => {
                   if (confirm('Are you sure you want to delete this adjuster profile? This cannot be undone.')) {
                     deleteAdjusterMutation.mutate(adjuster.id);
                   }
                 }}
                 data-testid="button-delete-adjuster"
               >
                 <Trash2 className="w-4 h-4" />
               </Button>
             )}
             <Dialog open={isLogOpen} onOpenChange={setIsLogOpen}>
               <DialogTrigger asChild>
                 <Button className="bg-primary hover:bg-primary/90 text-primary-foreground" data-testid="button-log-interaction">
                   <Plus className="w-4 h-4 mr-2" />
                   Log Interaction
                 </Button>
               </DialogTrigger>
               <DialogContent>
                 <DialogHeader>
                   <DialogTitle>Log New Interaction</DialogTitle>
                   <DialogDescription>
                     Record details of your communication with the adjuster.
                   </DialogDescription>
                 </DialogHeader>
                 <div className="space-y-4 py-4">
                   <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-2">
                       <Label>Type</Label>
                       <Select 
                        value={newLog.type} 
                        onValueChange={(v: any) => setNewLog({...newLog, type: v})}
                       >
                         <SelectTrigger data-testid="select-interaction-type">
                           <SelectValue />
                         </SelectTrigger>
                         <SelectContent>
                           <SelectItem value="Call">Call</SelectItem>
                           <SelectItem value="Email">Email</SelectItem>
                           <SelectItem value="Inspection">Inspection</SelectItem>
                           <SelectItem value="Reinspection">Reinspection</SelectItem>
                           <SelectItem value="Escalation">Escalation</SelectItem>
                           <SelectItem value="Other">Other</SelectItem>
                         </SelectContent>
                       </Select>
                     </div>
                     <div className="space-y-2">
                       <Label>Date</Label>
                       <Input 
                        type="date" 
                        value={newLog.date} 
                        onChange={(e) => setNewLog({...newLog, date: e.target.value})}
                        data-testid="input-interaction-date"
                       />
                     </div>
                   </div>
                   <div className="space-y-2">
                     <Label>Link to Claim (optional)</Label>
                     <Select 
                      value={newLog.claimRef} 
                      onValueChange={(v) => setNewLog({...newLog, claimRef: v})}
                     >
                       <SelectTrigger data-testid="select-claim-ref">
                         <SelectValue placeholder="Select a claim" />
                       </SelectTrigger>
                       <SelectContent>
                         <SelectItem value="none">None</SelectItem>
                         {allClaims.map((claim) => (
                           <SelectItem key={claim.id} value={claim.id}>
                             #{claim.maskedId} - {claim.carrier}
                           </SelectItem>
                         ))}
                       </SelectContent>
                     </Select>
                   </div>
                   <div className="space-y-2">
                     <div className="flex items-center justify-between">
                       <Label>Notes</Label>
                       <AudioTranscribe 
                         onTranscript={(text) => setNewLog({...newLog, description: newLog.description ? newLog.description + '\n\n' + text : text})}
                       />
                     </div>
                     <Textarea 
                      placeholder="What happened?" 
                      value={newLog.description}
                      onChange={(e) => setNewLog({...newLog, description: e.target.value})}
                      data-testid="input-interaction-description"
                     />
                   </div>
                   <Button 
                     className="w-full" 
                     onClick={handleAddLog}
                     disabled={!newLog.description || createInteractionMutation.isPending}
                     data-testid="button-save-interaction"
                   >
                     {createInteractionMutation.isPending ? 'Saving...' : 'Save Log'}
                   </Button>
                 </div>
               </DialogContent>
             </Dialog>
          </div>
        </div>

        {/* Internal Notes - Always visible */}
        <Card className="bg-muted/20 border-border/50">
          <CardContent className="pt-5">
            <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-3">Internal Notes</p>
            {isEditingNotes ? (
              <div className="space-y-3">
                <Textarea 
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="min-h-[150px] bg-background"
                  placeholder="Add internal notes about this adjuster... Email chains, behavior patterns, contact info, etc."
                  data-testid="textarea-internal-notes"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSaveNotes} disabled={updateAdjusterMutation.isPending}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setIsEditingNotes(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
            ) : (
              <div 
                className="cursor-pointer hover:bg-muted/30 p-3 -m-2 rounded transition-colors min-h-[80px]"
                onClick={() => { setEditNotes(adjuster.internalNotes || ''); setIsEditingNotes(true); }}
                data-testid="notes-display"
              >
                {adjuster.internalNotes ? (
                  <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{adjuster.internalNotes}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">Click to add notes about this adjuster...</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="interactions" data-testid="tab-interactions">Interaction Log</TabsTrigger>
            <TabsTrigger value="claims" data-testid="tab-claims">
              <ClipboardList className="w-4 h-4 mr-1" />
              Claims
            </TabsTrigger>
            <TabsTrigger value="documents" data-testid="tab-documents">
              <Paperclip className="w-4 h-4 mr-1" />
              Documents
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            {/* Contact Info Section */}
            <Card className="bg-card/50 border-border/60 mb-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Contact Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 p-2 rounded-md">
                      <Phone className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Phone</p>
                      <p className="text-sm font-medium" data-testid="text-adjuster-phone">
                        {adjuster.phone || <span className="text-muted-foreground italic">Not set</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 p-2 rounded-md">
                      <Mail className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Email</p>
                      <p className="text-sm font-medium" data-testid="text-adjuster-email">
                        {adjuster.email || <span className="text-muted-foreground italic">Not set</span>}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              
              {/* First Interaction Date */}
              <Card className="bg-card/50 border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    First Contact
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-first-interaction">
                    {firstInteractionDate || 'None'}
                  </div>
                </CardContent>
              </Card>

              {/* Total Interactions */}
              <Card className="bg-card/50 border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Phone className="w-4 h-4" />
                    Interactions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-total-interactions">
                    {adjuster.interactions.length}
                  </div>
                </CardContent>
              </Card>
              
              {/* Total Claims */}
              <Card className="bg-card/50 border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <ClipboardList className="w-4 h-4" />
                    Claims
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-total-claims">{totalClaims}</div>
                </CardContent>
              </Card>

              {/* Documents */}
              <Card className="bg-card/50 border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Paperclip className="w-4 h-4" />
                    Documents
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold" data-testid="text-total-documents">{adjuster.documents?.length || 0}</div>
                </CardContent>
              </Card>
            </div>

            {/* Risk & Strategy Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              {/* Risk Impression */}
              <Card className="bg-card/50 border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Your Risk Impression
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isEditingRisk ? (
                    <div className="space-y-3">
                      <Textarea 
                        value={editRisk}
                        onChange={(e) => setEditRisk(e.target.value)}
                        placeholder="Your personal assessment of working with this adjuster..."
                        className="min-h-[80px]"
                        data-testid="textarea-risk-impression"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleSaveRisk} disabled={updateAdjusterMutation.isPending}>
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setIsEditingRisk(false)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div 
                      className="cursor-pointer hover:bg-muted/30 p-2 -m-2 rounded transition-colors min-h-[60px]"
                      onClick={() => { setEditRisk(adjuster.riskImpression || ''); setIsEditingRisk(true); }}
                      data-testid="text-risk-impression"
                    >
                      {adjuster.riskImpression ? (
                        <p className="text-sm">{adjuster.riskImpression}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">Click to add your risk impression...</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* What Worked - Your Playbook */}
              <Card className="bg-card/50 border-border/60">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    What Worked (Your Playbook)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {isEditingWhatWorked ? (
                    <div className="space-y-3">
                      <Textarea 
                        value={editWhatWorked}
                        onChange={(e) => setEditWhatWorked(e.target.value)}
                        placeholder="Arguments that worked, code citations, tone that got results, escalation paths..."
                        className="min-h-[120px]"
                        data-testid="input-what-worked"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleSaveWhatWorked} data-testid="button-save-what-worked">Save</Button>
                        <Button size="sm" variant="outline" onClick={() => setIsEditingWhatWorked(false)}>Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <div 
                      className="cursor-pointer hover:bg-muted/30 p-2 -m-2 rounded transition-colors min-h-[80px]"
                      onClick={() => { setEditWhatWorked(adjuster.whatWorked || ''); setIsEditingWhatWorked(true); }}
                      data-testid="text-what-worked"
                    >
                      {adjuster.whatWorked ? (
                        <p className="text-sm whitespace-pre-wrap">{adjuster.whatWorked}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">Click to add what worked with this adjuster... Arguments, code citations, tone, escalation paths that got results.</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Intelligence Panel */}
            <Card className="mt-6 bg-card/50 border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="w-5 h-5 text-primary" />
                  Intelligence Panel
                </CardTitle>
                <p className="text-sm text-muted-foreground">Derived from your interaction and claim history</p>
              </CardHeader>
              <CardContent>
                {intelLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : intelligence ? (
                  <div className="space-y-6">
                    {/* Pattern Tags */}
                    {intelligence.patternTags.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                          <Tag className="w-4 h-4" />
                          Behavioral Patterns
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {intelligence.patternTags.map((tag) => (
                            <Badge 
                              key={tag} 
                              variant="secondary" 
                              className="text-xs"
                              data-testid={`tag-${tag.toLowerCase().replace(/\s+/g, '-')}`}
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Stats Grid - Auto-calculated, read-only */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      <div className="p-4 bg-muted/30 rounded-lg border border-border/50">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                          <Phone className="w-4 h-4" />
                          Total Interactions
                        </div>
                        <div className="text-2xl font-bold" data-testid="stat-total-interactions">
                          {intelligence.totalInteractions}
                        </div>
                      </div>

                      <div className="p-4 bg-muted/30 rounded-lg border border-border/50">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                          <ClipboardList className="w-4 h-4" />
                          Claims Linked
                        </div>
                        <div className="text-2xl font-bold" data-testid="stat-total-claims">
                          {intelligence.totalClaims}
                        </div>
                      </div>

                      <div className="p-4 bg-muted/30 rounded-lg border border-border/50">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                          <Clock className="w-4 h-4" />
                          Avg Days to Resolution
                        </div>
                        <div className="text-2xl font-bold" data-testid="stat-avg-resolution">
                          {intelligence.avgDaysToResolution !== null 
                            ? `${intelligence.avgDaysToResolution}` 
                            : '—'}
                        </div>
                      </div>

                      <div className="p-4 bg-muted/30 rounded-lg border border-border/50">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                          <TrendingUp className="w-4 h-4" />
                          Escalations Used
                        </div>
                        <div className="text-2xl font-bold" data-testid="stat-escalations">
                          {intelligence.escalationCount}
                        </div>
                      </div>

                      <div className="p-4 bg-muted/30 rounded-lg border border-border/50">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                          <CheckCircle className="w-4 h-4" />
                          Resolution Rate
                        </div>
                        <div className="text-2xl font-bold" data-testid="stat-resolution-rate">
                          {(intelligence.outcomesResolved + intelligence.outcomesStalled) > 0
                            ? `${Math.round((intelligence.outcomesResolved / (intelligence.outcomesResolved + intelligence.outcomesStalled)) * 100)}%`
                            : '—'}
                        </div>
                      </div>
                    </div>

                    {/* Behavioral Performance Metrics */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <TrendingUp className="w-4 h-4" />
                        Behavioral Performance
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div className="p-4 bg-muted/30 rounded-lg border border-border/50">
                          <div className="text-sm text-muted-foreground mb-1">Risk Score</div>
                          <div className={`text-2xl font-bold ${intelligence.riskScore >= 70 ? 'text-red-500' : intelligence.riskScore >= 50 ? 'text-amber-500' : 'text-green-500'}`} data-testid="stat-risk-score">
                            {intelligence.riskScore}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {intelligence.riskScore >= 70 ? 'High' : intelligence.riskScore >= 50 ? 'Elevated' : 'Low'}
                          </div>
                        </div>

                        <div className="p-4 bg-muted/30 rounded-lg border border-border/50">
                          <div className="text-sm text-muted-foreground mb-1">Responsiveness</div>
                          <div className="text-2xl font-bold" data-testid="stat-responsiveness">
                            {intelligence.responsivenessScore !== null ? intelligence.responsivenessScore : '—'}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {intelligence.responsivenessScore !== null ? (
                              intelligence.responsivenessScore >= 75 ? 'Quick' : intelligence.responsivenessScore >= 50 ? 'Moderate' : 'Slow'
                            ) : 'N/A'}
                          </div>
                        </div>

                        <div className="p-4 bg-muted/30 rounded-lg border border-border/50">
                          <div className="text-sm text-muted-foreground mb-1">Cooperation</div>
                          <div className={`text-2xl font-bold ${intelligence.cooperationLevel === 'High' ? 'text-green-500' : intelligence.cooperationLevel === 'Moderate' ? 'text-amber-500' : intelligence.cooperationLevel === 'Low' ? 'text-red-500' : ''}`} data-testid="stat-cooperation">
                            {intelligence.cooperationLevel || '—'}
                          </div>
                        </div>

                        <div className="p-4 bg-muted/30 rounded-lg border border-border/50">
                          <div className="text-sm text-muted-foreground mb-1">Supplement Approval</div>
                          <div className="text-2xl font-bold" data-testid="stat-supplement-approval">
                            {intelligence.supplementApprovalRate !== null ? `${intelligence.supplementApprovalRate}%` : '—'}
                          </div>
                        </div>

                        <div className="p-4 bg-muted/30 rounded-lg border border-border/50">
                          <div className="text-sm text-muted-foreground mb-1">Avg Interactions/Claim</div>
                          <div className="text-2xl font-bold" data-testid="stat-avg-interactions-claim">
                            {intelligence.avgInteractionsPerClaim !== null ? intelligence.avgInteractionsPerClaim : '—'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <BarChart3 className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p>No intelligence data available yet.</p>
                    <p className="text-sm">Log more interactions and claims to see patterns emerge.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tactical Advisor - Stage 3 */}
            {intelligence && (intelligence.totalInteractions >= 3 || intelligence.totalClaims >= 2) && (
              <Card className="mt-6 bg-card/50 border-border/60 border-l-4 border-l-primary">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Tactical Advisor
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">Based on your history with this adjuster</p>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {intelligence.patternTags.includes("Escalation-responsive") && (
                      <p className="text-sm" data-testid="advice-escalation">
                        • Escalation earlier has worked here
                      </p>
                    )}
                    {intelligence.patternTags.includes("Documentation-sensitive") && (
                      <p className="text-sm" data-testid="advice-documentation">
                        • Documentation density correlates with approval
                      </p>
                    )}
                    {intelligence.patternTags.includes("Reinspection-heavy") && (
                      <p className="text-sm" data-testid="advice-reinspection">
                        • Expect reinspection cycle
                      </p>
                    )}
                    {intelligence.patternTags.includes("Slow resolution") && (
                      <p className="text-sm" data-testid="advice-slow">
                        • Plan for extended timeline
                      </p>
                    )}
                    {intelligence.patternTags.includes("Fast resolution") && (
                      <p className="text-sm" data-testid="advice-fast">
                        • Typically resolves quickly with proper documentation
                      </p>
                    )}
                    {intelligence.patternTags.includes("High friction") && (
                      <p className="text-sm" data-testid="advice-friction">
                        • Higher friction expected — prepare escalation path early
                      </p>
                    )}
                    {intelligence.patternTags.includes("Low friction") && (
                      <p className="text-sm" data-testid="advice-low-friction">
                        • Generally cooperative — standard approach works
                      </p>
                    )}
                    {intelligence.escalationCount > 0 && intelligence.outcomesResolved > intelligence.outcomesStalled && (
                      <p className="text-sm" data-testid="advice-escalation-effective">
                        • Escalations have been effective ({intelligence.escalationCount} used, majority resolved)
                      </p>
                    )}
                    {intelligence.avgDaysToResolution !== null && intelligence.avgDaysToResolution > 45 && (
                      <p className="text-sm" data-testid="advice-timeline">
                        • Typical resolution: {intelligence.avgDaysToResolution}+ days
                      </p>
                    )}
                    {intelligence.patternTags.length === 0 && intelligence.totalClaims < 3 && (
                      <p className="text-sm text-muted-foreground italic">
                        More data needed to generate tactical guidance.
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="interactions">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Interaction Log</CardTitle>
                <Button size="sm" variant="outline" onClick={() => setIsLogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Add
                </Button>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px] pr-4">
                  <div className="space-y-4">
                    {adjuster.interactions.length > 0 ? (
                      adjuster.interactions.map((interaction) => (
                        <div 
                          key={interaction.id} 
                          className="flex items-start gap-4 p-4 bg-muted/30 rounded-lg border border-border/50"
                          data-testid={`interaction-${interaction.id}`}
                        >
                          <div className="bg-primary/10 p-2 rounded-md shrink-0">
                            {getInteractionIcon(interaction.type)}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2 flex-wrap">
                              <Badge variant="secondary" className="text-xs" data-testid={`badge-type-${interaction.id}`}>
                                {interaction.type}
                              </Badge>
                              <span className="text-sm font-mono text-muted-foreground" data-testid={`text-date-${interaction.id}`}>
                                {interaction.date}
                              </span>
                              {interaction.claimId && (
                                <Badge variant="outline" className="text-xs font-mono" data-testid={`badge-claim-${interaction.id}`}>
                                  Claim #{interaction.claimId}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm" data-testid={`text-description-${interaction.id}`}>
                              {interaction.description}
                            </p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-12 text-muted-foreground">
                        <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>No interactions logged yet.</p>
                        <p className="text-sm mt-1">Click "Log Interaction" to record your first contact.</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="claims">
            <Card>
              <CardHeader>
                <CardTitle>Claims Timeline</CardTitle>
                <p className="text-sm text-muted-foreground">Claims where this adjuster was involved</p>
              </CardHeader>
              <CardContent>
                {adjuster.claims.length > 0 ? (
                  <div className="relative">
                    <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
                    <div className="space-y-4 pl-10">
                      {adjuster.claims.map((claim: any) => (
                        <div key={claim.id} className="relative" data-testid={`claim-${claim.id}`}>
                          <div className="absolute -left-[26px] top-3 w-3 h-3 rounded-full bg-primary border-2 border-background" />
                          <div className="bg-muted/30 rounded-lg p-4 border border-border/50">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <span className="font-mono text-sm font-medium" data-testid={`text-claim-id-${claim.id}`}>
                                  Claim #{claim.maskedId}
                                </span>
                                <span className="text-muted-foreground text-sm ml-2">• {claim.carrier}</span>
                              </div>
                              <Badge variant="outline" className="text-xs">
                                {claim.status?.replace('_', ' ') || 'open'}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                DOL: {claim.dateOfLoss}
                              </div>
                            </div>
                            {claim.notes && (
                              <p className="text-sm mt-2 text-muted-foreground">{claim.notes}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p>No claims linked to this adjuster yet.</p>
                    <p className="text-sm mt-1">Claims will appear here when you link them via interactions.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="documents">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Documents & Files</CardTitle>
                <label htmlFor="file-upload">
                  <Button size="sm" variant="outline" disabled={isUploading} asChild>
                    <span>
                      <Upload className="w-4 h-4 mr-2" />
                      {isUploading ? 'Uploading...' : 'Upload File'}
                    </span>
                  </Button>
                  <input
                    id="file-upload"
                    type="file"
                    className="hidden"
                    accept="image/*,application/pdf,audio/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadFile(file);
                      e.target.value = '';
                    }}
                    data-testid="input-file-upload"
                  />
                </label>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[400px] pr-4">
                  <div className="space-y-3">
                    {adjuster.documents && adjuster.documents.length > 0 ? (
                      adjuster.documents.map((doc: any) => (
                        <div 
                          key={doc.id} 
                          className="flex items-center gap-4 p-4 bg-muted/30 rounded-lg border border-border/50 group"
                          data-testid={`document-${doc.id}`}
                        >
                          <div className="bg-primary/10 p-2 rounded-md shrink-0">
                            {getDocumentIcon(doc.contentType)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate" data-testid={`text-doc-name-${doc.id}`}>
                              {doc.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {doc.size ? `${Math.round(doc.size / 1024)} KB` : ''} 
                              {doc.createdAt && ` • ${format(new Date(doc.createdAt), 'MMM d, yyyy')}`}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => window.open(doc.objectPath, '_blank')}
                              data-testid={`button-view-${doc.id}`}
                            >
                              View
                            </Button>
                            <Button 
                              size="sm" 
                              variant="default"
                              onClick={() => handleAnalyzeDocument(doc)}
                              disabled={analyzingDocId === doc.id}
                              data-testid={`button-analyze-${doc.id}`}
                            >
                              {analyzingDocId === doc.id ? (
                                <>
                                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                  Analyzing...
                                </>
                              ) : (
                                'Analyze'
                              )}
                            </Button>
                            {isTeamUser && (
                              <Button 
                                size="sm" 
                                variant="ghost"
                                className="text-muted-foreground hover:text-destructive"
                                onClick={() => {
                                  if (confirm('Delete this document?')) {
                                    deleteDocumentMutation.mutate(doc.id);
                                  }
                                }}
                                data-testid={`button-delete-doc-${doc.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-12 text-muted-foreground">
                        <Paperclip className="w-12 h-12 mx-auto mb-3 opacity-20" />
                        <p>No documents attached yet.</p>
                        <p className="text-sm mt-1">Upload PDFs, photos, or voice recordings.</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
