import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  Mail, Phone, MessageSquare, FileText, Plus, Building2,
  User, Mic, ChevronDown, ChevronUp, Search, MoreHorizontal, Archive, Trash2,
} from "lucide-react";

const COMM_TYPES = [
  { value: "email", label: "Email", icon: Mail },
  { value: "phone_call", label: "Phone Call", icon: Phone },
  { value: "text_message", label: "Text Message", icon: MessageSquare },
  { value: "carrier_portal", label: "Carrier Portal", icon: Building2 },
  { value: "internal_note", label: "Internal Note", icon: FileText },
  { value: "voicemail", label: "Voicemail", icon: Mic },
  { value: "in_person", label: "In Person", icon: User },
  { value: "other", label: "Other", icon: MessageSquare },
];

function commIcon(type: string) {
  const found = COMM_TYPES.find(t => t.value === type);
  return found?.icon ?? MessageSquare;
}

function commLabel(type: string) {
  return COMM_TYPES.find(t => t.value === type)?.label ?? type;
}

interface CommInput {
  claimId: string;
  direction: string;
  subject: string;
  body: string;
}

interface Communication {
  id: string;
  claimId: string;
  subject?: string;
  body?: string;
  direction?: string;
  createdAt: string;
}

export default function CommunicationsPage() {
  const { toast } = useToast();
  const { data: authData } = useAuth();
  const userRole = authData?.user?.role || 'individual';
  const isMaster = userRole === 'master_admin';
  const canArchive = !['executive_admin'].includes(userRole);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState({ claimId: "", type: "phone_call", direction: "incoming", subject: "", body: "" });
  const [confirmDialog, setConfirmDialog] = useState<{ type: "archive" | "delete"; comm: Communication } | null>(null);

  const { data: comms, isLoading } = useQuery<Communication[]>({
    queryKey: ["/api/communications"],
  });

  const { data: claims } = useQuery<{ id: string; claimNumber: string; carrier?: string }[]>({
    queryKey: ["/api/claims"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: CommInput) => {
      const res = await apiRequest("POST", "/api/communications", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/communications"] });
      toast({ title: "Communication logged" });
      setDialogOpen(false);
      setForm({ claimId: "", type: "phone_call", direction: "incoming", subject: "", body: "" });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to log communication", description: err.message, variant: "destructive" });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("PATCH", `/api/communications/${id}/archive`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/communications"] }); toast({ title: "Communication archived" }); setConfirmDialog(null); },
    onError: (err: Error) => { toast({ title: "Archive failed", description: err.message, variant: "destructive" }); },
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/communications/${id}/permanent`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/communications"] }); toast({ title: "Communication permanently deleted" }); setConfirmDialog(null); },
    onError: (err: Error) => { toast({ title: "Delete failed", description: err.message, variant: "destructive" }); },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.claimId) { toast({ title: "Please select a claim", variant: "destructive" }); return; }
    if (!form.body) { toast({ title: "Content is required", variant: "destructive" }); return; }
    createMutation.mutate({
      claimId: form.claimId,
      subject: form.type,
      body: form.body,
      direction: form.direction,
    });
  };

  const filtered = comms?.filter(c =>
    !searchQuery ||
    (c.subject ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (c.body ?? "").toLowerCase().includes(searchQuery.toLowerCase())
  ) ?? [];

  const claimMap = Object.fromEntries((claims ?? []).map(c => [c.id, c]));

  return (
    <div className="space-y-6" data-testid="page-communications">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-communications-title">Communications</h1>
          <p className="text-sm text-muted-foreground">Track all claim-linked communications — calls, emails, notes, carrier interactions</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-communication">
              <Plus className="w-4 h-4" />
              Log Communication
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Log Communication</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Claim</Label>
                <Select value={form.claimId} onValueChange={v => setForm(f => ({ ...f, claimId: v }))}>
                  <SelectTrigger data-testid="select-comm-claim">
                    <SelectValue placeholder="Select claim..." />
                  </SelectTrigger>
                  <SelectContent>
                    {claims?.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.claimNumber}{c.carrier ? ` — ${c.carrier}` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
                    <SelectTrigger data-testid="select-comm-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMM_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Direction</Label>
                  <Select value={form.direction} onValueChange={v => setForm(f => ({ ...f, direction: v }))}>
                    <SelectTrigger data-testid="select-comm-direction">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="incoming">Incoming</SelectItem>
                      <SelectItem value="outgoing">Outgoing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Content / Notes</Label>
                <Textarea
                  placeholder="Describe the communication, key points discussed, or paste transcript..."
                  value={form.body}
                  onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                  rows={4}
                  data-testid="input-comm-body"
                />
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-communication">
                {createMutation.isPending ? "Saving..." : "Log Communication"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search communications..."
          className="pl-9"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          data-testid="input-search-communications"
        />
      </div>

      {/* Communications list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : !filtered.length ? (
        <Card>
          <CardContent className="p-10 text-center">
            <MessageSquare className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium mb-1">{searchQuery ? "No results found" : "No communications yet"}</p>
            <p className="text-xs text-muted-foreground mb-4">
              {searchQuery ? "Try a different search term." : "Log calls, emails, and carrier interactions to maintain a full communication history."}
            </p>
            {!searchQuery && (
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)} data-testid="button-add-first-comm">
                <Plus className="w-3 h-3" />
                Log First Communication
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(comm => {
            const Icon = commIcon(comm.subject ?? "other");
            const claim = claimMap[comm.claimId];
            const isExpanded = expandedId === comm.id;
            return (
              <Card key={comm.id} data-testid={`card-comm-${comm.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="text-sm font-medium" data-testid={`comm-type-${comm.id}`}>{commLabel(comm.subject ?? "other")}</span>
                        <Badge variant={comm.direction === "incoming" ? "secondary" : "outline"} className="text-xs">
                          {comm.direction === "incoming" ? "Incoming" : "Outgoing"}
                        </Badge>
                        {claim && (
                          <Badge variant="outline" className="text-xs" data-testid={`comm-claim-${comm.id}`}>
                            {claim.claimNumber}
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground ml-auto">
                          {new Date(comm.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                        {canArchive && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-6 w-6" data-testid={`button-comm-menu-${comm.id}`}>
                                <MoreHorizontal className="w-3 h-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setConfirmDialog({ type: "archive", comm })} data-testid={`menu-archive-comm-${comm.id}`}>
                                <Archive className="w-4 h-4 mr-2" />Archive
                              </DropdownMenuItem>
                              {isMaster && (
                                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setConfirmDialog({ type: "delete", comm })} data-testid={`menu-delete-comm-${comm.id}`}>
                                  <Trash2 className="w-4 h-4 mr-2" />Delete Permanently
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                      {comm.body && (
                        <div>
                          <p className={`text-xs text-muted-foreground leading-relaxed ${!isExpanded ? "line-clamp-2" : ""}`} data-testid={`comm-body-${comm.id}`}>
                            {comm.body}
                          </p>
                          {comm.body.length > 120 && (
                            <button
                              className="flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                              onClick={() => setExpandedId(isExpanded ? null : comm.id)}
                              data-testid={`button-toggle-comm-${comm.id}`}
                            >
                              {isExpanded ? <><ChevronUp className="w-3 h-3" />Show less</> : <><ChevronDown className="w-3 h-3" />Show more</>}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      {confirmDialog && (
        <ConfirmDialog
          open={!!confirmDialog}
          onOpenChange={(o) => { if (!o) setConfirmDialog(null); }}
          title={confirmDialog.type === "archive" ? "Archive Communication" : "Permanently Delete Communication"}
          description={
            confirmDialog.type === "archive"
              ? `Archive this ${commLabel(confirmDialog.comm.subject ?? "communication")}? It will be hidden and can be restored from the Admin Governance Hub.`
              : `Permanently delete this communication? This cannot be undone.`
          }
          confirmLabel={confirmDialog.type === "archive" ? "Archive" : "Delete Permanently"}
          variant={confirmDialog.type === "delete" ? "destructive" : "default"}
          isPending={archiveMutation.isPending || permanentDeleteMutation.isPending}
          onConfirm={() => {
            if (!confirmDialog) return;
            if (confirmDialog.type === "archive") archiveMutation.mutate(confirmDialog.comm.id);
            else permanentDeleteMutation.mutate(confirmDialog.comm.id);
          }}
        />
      )}
    </div>
  );
}
