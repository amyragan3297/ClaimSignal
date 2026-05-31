import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Mic, Clock, CheckCircle, FileAudio,
  MessageSquare, Plus, ChevronDown, ChevronUp, MoreHorizontal, Archive, Trash2,
} from "lucide-react";

interface AudioRecording {
  id: string;
  claimId?: string;
  fileUrl?: string;
  durationSeconds?: number;
  transcriptText?: string;
  transcriptConfidence?: number;
  hostilityScore?: number;
  delayLanguageDetected?: boolean;
  denialPreLanguageDetected?: boolean;
  processedAt?: string;
  createdAt: string;
}

function formatDuration(seconds?: number) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function TranscriptToggle({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        className="flex items-center gap-1 text-xs text-primary hover:underline"
        onClick={() => setOpen(v => !v)}
        data-testid="button-toggle-transcript"
      >
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {open ? "Hide transcript" : "View transcript"}
      </button>
      {open && (
        <div className="mt-2 p-3 rounded-md bg-muted/50 text-xs leading-relaxed text-muted-foreground border border-border/50" data-testid="text-transcript">
          {text}
        </div>
      )}
    </div>
  );
}

export default function AudioPage() {
  const { toast } = useToast();
  const { data: authData } = useAuth();
  const userRole = authData?.user?.role || "standard";
  const isMaster = userRole === "super_admin";
  const canArchive = !["carrier_analyst"].includes(userRole);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedClaimId, setSelectedClaimId] = useState("");
  const [fileName, setFileName] = useState("");
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ type: "archive" | "delete"; rec: AudioRecording } | null>(null);

  const { data: recordings, isLoading } = useQuery<AudioRecording[]>({
    queryKey: ["/api/audio"],
  });

  const { data: claims } = useQuery<{ id: string; claimNumber: string }[]>({
    queryKey: ["/api/claims"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/audio", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/audio"] });
      toast({ title: "Audio recording logged" });
      setDialogOpen(false);
      setFileName("");
      setDuration("");
      setNotes("");
      setSelectedClaimId("");
    },
    onError: (err: Error) => {
      toast({ title: "Failed to log recording", description: err.message, variant: "destructive" });
    },
  });

  const transcribeMutation = useMutation({
    mutationFn: async (data: { audioBase64: string; fileName: string; claimId?: string; durationSeconds?: number }) => {
      const res = await apiRequest("POST", "/api/audio/transcribe", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/audio"] });
      toast({ title: "Audio transcribed", description: "AI transcription complete." });
      setDialogOpen(false);
      setFileName("");
      setDuration("");
      setNotes("");
      setSelectedClaimId("");
      setAudioFile(null);
    },
    onError: (err: Error) => {
      toast({ title: "Transcription failed", description: err.message, variant: "destructive" });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("PATCH", `/api/audio/${id}/archive`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/audio"] }); toast({ title: "Recording archived" }); setConfirmDialog(null); },
    onError: (err: Error) => { toast({ title: "Archive failed", description: err.message, variant: "destructive" }); },
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/audio/${id}/permanent`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/audio"] }); toast({ title: "Recording permanently deleted" }); setConfirmDialog(null); },
    onError: (err: Error) => { toast({ title: "Delete failed", description: err.message, variant: "destructive" }); },
  });

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // If an audio file is attached, run AI transcription.
    if (audioFile) {
      try {
        const audioBase64 = await fileToBase64(audioFile);
        transcribeMutation.mutate({
          audioBase64,
          fileName: audioFile.name,
          claimId: selectedClaimId || undefined,
          durationSeconds: duration ? parseInt(duration) * 60 : undefined,
        });
      } catch {
        toast({ title: "Could not read audio file", variant: "destructive" });
      }
      return;
    }
    // Otherwise log a recording with a manually-entered transcript/notes.
    if (!fileName) {
      toast({ title: "Attach an audio file or enter a file name", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      claimId: selectedClaimId || undefined,
      fileUrl: `#manual/${fileName}`,
      durationSeconds: duration ? parseInt(duration) * 60 : undefined,
      transcriptText: notes || undefined,
    });
  };

  const getBehaviorBadge = (rec: AudioRecording) => {
    if (rec.denialPreLanguageDetected) return <Badge variant="destructive" className="text-xs">Denial Pre-Language</Badge>;
    if (rec.delayLanguageDetected) return <Badge variant="secondary" className="text-xs">Delay Language</Badge>;
    if ((rec.hostilityScore ?? 0) > 0.6) return <Badge variant="secondary" className="text-xs">Elevated Tone</Badge>;
    return null;
  };

  return (
    <div className="space-y-6" data-testid="page-audio">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-audio-title">Audio & Transcriptions</h1>
          <p className="text-sm text-muted-foreground">Upload, attach, and transcribe adjuster call recordings and voicemails</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-audio">
              <Plus className="w-4 h-4" />
              Log Recording
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Log Audio Recording</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Audio File (for AI transcription)</Label>
                <Input
                  type="file"
                  accept="audio/*,.mp3,.m4a,.wav,.webm,.ogg,.mp4"
                  onChange={e => {
                    const f = e.target.files?.[0] || null;
                    setAudioFile(f);
                    if (f) setFileName(f.name);
                  }}
                  data-testid="input-audio-file"
                />
                <p className="text-xs text-muted-foreground">Upload a recording to auto-transcribe with AI, or skip and paste a transcript below.</p>
              </div>
              <div className="space-y-2">
                <Label>File Name / Recording Label</Label>
                <Input
                  placeholder="adjuster-call-2026-04-18.mp3"
                  value={fileName}
                  onChange={e => setFileName(e.target.value)}
                  data-testid="input-audio-filename"
                />
              </div>
              <div className="space-y-2">
                <Label>Link to Claim (optional)</Label>
                <Select value={selectedClaimId} onValueChange={setSelectedClaimId}>
                  <SelectTrigger data-testid="select-audio-claim">
                    <SelectValue placeholder="Select claim..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">No claim linked</SelectItem>
                    {claims?.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.claimNumber}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Duration (minutes, optional)</Label>
                <Input
                  type="number"
                  placeholder="12"
                  value={duration}
                  onChange={e => setDuration(e.target.value)}
                  data-testid="input-audio-duration"
                />
              </div>
              <div className="space-y-2">
                <Label>Transcript / Notes (optional)</Label>
                <Textarea
                  placeholder="Paste transcript or add notes about the call..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={4}
                  data-testid="input-audio-notes"
                />
              </div>
              <div className="p-3 rounded-md bg-muted/50 border border-border/50">
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Mic className="w-3 h-3" />
                  Attach an audio file to transcribe it automatically with AI, or paste a transcript manually above.
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending || transcribeMutation.isPending} data-testid="button-submit-audio">
                {transcribeMutation.isPending
                  ? "Transcribing..."
                  : createMutation.isPending
                    ? "Saving..."
                    : audioFile
                      ? "Transcribe with AI"
                      : "Log Recording"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Status banner */}
      <Card className="border-border/50 bg-muted/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
              <Mic className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Transcription Engine</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                AI-powered transcription is live — upload an adjuster call or voicemail and ClaimSignal generates the transcript automatically. Manual transcript entry is also available.
              </p>
            </div>
            <Badge variant="outline" className="text-xs shrink-0 text-green-500 border-green-500/30">AI Live</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Recording list */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
      ) : !recordings?.length ? (
        <Card>
          <CardContent className="p-10 text-center">
            <FileAudio className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium mb-1">No recordings yet</p>
            <p className="text-xs text-muted-foreground mb-4">Log adjuster calls, voicemails, and inspection audio to track behavioral signals.</p>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(true)} data-testid="button-add-first-audio">
              <Plus className="w-3 h-3" />
              Log First Recording
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {recordings.map(rec => (
            <Card key={rec.id} data-testid={`card-audio-${rec.id}`}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                      <FileAudio className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium" data-testid={`audio-filename-${rec.id}`}>
                        {rec.fileUrl?.replace(/^#(demo|manual|upload)\//, "") ?? "Recording"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {rec.claimId ? `Claim linked` : "No claim linked"} · {formatDuration(rec.durationSeconds)} · {new Date(rec.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {getBehaviorBadge(rec)}
                    {rec.transcriptText ? (
                      <Badge variant="outline" className="text-xs text-green-500 border-green-500/30" data-testid={`badge-transcript-status-${rec.id}`}>
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Transcript Available
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs" data-testid={`badge-transcript-status-${rec.id}`}>
                        <Clock className="w-3 h-3 mr-1" />
                        Transcription Pending
                      </Badge>
                    )}
                    {canArchive && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-7 w-7 ml-1" data-testid={`button-audio-menu-${rec.id}`}>
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setConfirmDialog({ type: "archive", rec })} data-testid={`menu-archive-audio-${rec.id}`}>
                            <Archive className="w-4 h-4 mr-2" />Archive
                          </DropdownMenuItem>
                          {isMaster && (
                            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setConfirmDialog({ type: "delete", rec })} data-testid={`menu-delete-audio-${rec.id}`}>
                              <Trash2 className="w-4 h-4 mr-2" />Delete Permanently
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>

                {rec.transcriptText && (
                  <div className="mt-2">
                    <TranscriptToggle text={rec.transcriptText} />
                  </div>
                )}

                {(rec.hostilityScore != null || rec.delayLanguageDetected || rec.denialPreLanguageDetected) && (
                  <div className="mt-3 grid grid-cols-3 gap-3 pt-3 border-t border-border/30">
                    <div>
                      <p className="text-xs text-muted-foreground">Hostility Score</p>
                      <p className="text-sm font-medium" data-testid={`audio-hostility-${rec.id}`}>
                        {rec.hostilityScore != null ? (rec.hostilityScore * 10).toFixed(1) : "—"}/10
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Delay Language</p>
                      <p className="text-sm font-medium" data-testid={`audio-delay-${rec.id}`}>
                        {rec.delayLanguageDetected ? "Detected" : "Not detected"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Denial Pre-Language</p>
                      <p className="text-sm font-medium" data-testid={`audio-denial-pre-${rec.id}`}>
                        {rec.denialPreLanguageDetected ? "Detected" : "Not detected"}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {confirmDialog && (
        <ConfirmDialog
          open={!!confirmDialog}
          onOpenChange={(o) => { if (!o) setConfirmDialog(null); }}
          title={confirmDialog.type === "archive" ? "Archive Recording" : "Permanently Delete Recording"}
          description={
            confirmDialog.type === "archive"
              ? `Archive this recording? It will be hidden and can be restored from the Admin Governance Hub.`
              : `Permanently delete this recording? This cannot be undone.`
          }
          confirmLabel={confirmDialog.type === "archive" ? "Archive" : "Delete Permanently"}
          variant={confirmDialog.type === "delete" ? "destructive" : "default"}
          isPending={archiveMutation.isPending || permanentDeleteMutation.isPending}
          onConfirm={() => {
            if (!confirmDialog) return;
            if (confirmDialog.type === "archive") archiveMutation.mutate(confirmDialog.rec.id);
            else permanentDeleteMutation.mutate(confirmDialog.rec.id);
          }}
        />
      )}
    </div>
  );
}
