import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { BookOpen, Plus, Loader2, Trash2, CheckCircle2, TrendingUp, Building2, FileText } from "lucide-react";

interface PlaybookEntry {
  id: string;
  title: string;
  scenarioType?: string | null;
  claimType?: string | null;
  carrier?: string | null;
  adjuster?: string | null;
  iaFirm?: string | null;
  vendor?: string | null;
  denialReason?: string | null;
  missingScopeItems?: string[] | null;
  documentationUsed?: string[] | null;
  actionTaken?: string | null;
  whatWorked?: string | null;
  whatDidNotWork?: string | null;
  timelineSummary?: string | null;
  escalationUsed?: boolean | null;
  outcome?: string | null;
  supplementDelta?: number | null;
  confidenceScore?: number | null;
  sourceClaimCount?: number | null;
  region?: string | null;
  recommendedNextStep?: string | null;
  isSample?: boolean | null;
}

const money = (v?: number | null) => (v == null ? "—" : `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`);

export default function PlaybooksPage() {
  const { data: auth } = useAuth();
  const isMaster = auth?.user.role === "super_admin" || !!auth?.isPlatformOwner;
  const isExecutive = auth?.user.role === "carrier_analyst";
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<PlaybookEntry | null>(null);

  const { data, isLoading } = useQuery<PlaybookEntry[]>({ queryKey: ["/api/playbooks"] });

  const [form, setForm] = useState({
    title: "", scenarioType: "", claimType: "", carrier: "", denialReason: "",
    actionTaken: "", whatWorked: "", outcome: "", recommendedNextStep: "",
  });

  const createMutation = useMutation({
    mutationFn: async () => { await apiRequest("POST", "/api/playbooks", form); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playbooks"] });
      toast({ title: "Playbook created" });
      setCreateOpen(false);
      setForm({ title: "", scenarioType: "", claimType: "", carrier: "", denialReason: "", actionTaken: "", whatWorked: "", outcome: "", recommendedNextStep: "" });
    },
    onError: (e: Error) => toast({ title: "Create failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/playbooks/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playbooks"] });
      toast({ title: "Playbook deleted" });
      setDetail(null);
    },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2" data-testid="text-playbooks-title">
            <BookOpen className="w-6 h-6 text-primary" />
            Playbook Engine
          </h1>
          <p className="text-sm text-muted-foreground">
            Historical patterns of what worked before — by carrier, claim type, and outcome.
            <span className="ml-1 text-xs">(MVP)</span>
          </p>
        </div>
        {isMaster && (
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-new-playbook"><Plus className="w-4 h-4" /> New Playbook</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Create Playbook Entry</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Field label="Title"><Input data-testid="input-playbook-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Scenario Type"><Input data-testid="input-playbook-scenario" placeholder="denial_overturned" value={form.scenarioType} onChange={(e) => setForm({ ...form, scenarioType: e.target.value })} /></Field>
                  <Field label="Claim Type"><Input data-testid="input-playbook-claimtype" value={form.claimType} onChange={(e) => setForm({ ...form, claimType: e.target.value })} /></Field>
                  <Field label="Carrier"><Input data-testid="input-playbook-carrier" value={form.carrier} onChange={(e) => setForm({ ...form, carrier: e.target.value })} /></Field>
                  <Field label="Outcome"><Input data-testid="input-playbook-outcome" value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value })} /></Field>
                </div>
                <Field label="Denial Reason"><Input data-testid="input-playbook-denial" value={form.denialReason} onChange={(e) => setForm({ ...form, denialReason: e.target.value })} /></Field>
                <Field label="Action Taken"><Textarea data-testid="input-playbook-action" className="resize-none" value={form.actionTaken} onChange={(e) => setForm({ ...form, actionTaken: e.target.value })} /></Field>
                <Field label="What Worked"><Textarea data-testid="input-playbook-worked" className="resize-none" value={form.whatWorked} onChange={(e) => setForm({ ...form, whatWorked: e.target.value })} /></Field>
                <Field label="Recommended Next Step"><Textarea data-testid="input-playbook-nextstep" className="resize-none" value={form.recommendedNextStep} onChange={(e) => setForm({ ...form, recommendedNextStep: e.target.value })} /></Field>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)} data-testid="button-cancel-playbook">Cancel</Button>
                <Button disabled={!form.title || createMutation.isPending} onClick={() => createMutation.mutate()} data-testid="button-submit-playbook">
                  {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isExecutive && (
        <p className="text-xs text-muted-foreground border border-border rounded-md p-3">
          Executive view shows aggregate playbook metrics only. Narrative strategy detail is restricted.
        </p>
      )}

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-48 w-full" />)}
        </div>
      ) : !data || data.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground" data-testid="text-playbooks-empty">
          <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-40" />No playbook entries yet.
        </CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {data.map((p) => (
            <Card
              key={p.id}
              className="cursor-pointer hover-elevate active-elevate-2"
              onClick={() => !isExecutive && setDetail(p)}
              data-testid={`card-playbook-${p.id}`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-base leading-snug" data-testid={`text-playbook-title-${p.id}`}>{p.title}</CardTitle>
                  {p.isSample && <Badge variant="outline" className="shrink-0">Sample</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex flex-wrap gap-1.5">
                  {p.carrier && <Badge variant="secondary"><Building2 className="w-3 h-3 mr-1" />{p.carrier}</Badge>}
                  {p.claimType && <Badge variant="outline">{p.claimType}</Badge>}
                  {p.outcome && <Badge variant="default"><CheckCircle2 className="w-3 h-3 mr-1" />{p.outcome}</Badge>}
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                  <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Suppl Δ {money(p.supplementDelta)}</span>
                  {p.confidenceScore != null && <span>Conf {Math.round(p.confidenceScore * 100)}%</span>}
                </div>
                {p.recommendedNextStep && !isExecutive && (
                  <p className="text-xs text-muted-foreground line-clamp-2 pt-1">{p.recommendedNextStep}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2" data-testid="text-playbook-detail-title">
                  <FileText className="w-5 h-5" />{detail.title}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 text-sm">
                <div className="flex flex-wrap gap-1.5">
                  {detail.carrier && <Badge variant="secondary">{detail.carrier}</Badge>}
                  {detail.claimType && <Badge variant="outline">{detail.claimType}</Badge>}
                  {detail.adjuster && <Badge variant="outline">{detail.adjuster}</Badge>}
                  {detail.iaFirm && <Badge variant="outline">{detail.iaFirm}</Badge>}
                  {detail.vendor && <Badge variant="outline">{detail.vendor}</Badge>}
                  {detail.outcome && <Badge variant="default">{detail.outcome}</Badge>}
                </div>
                <DetailRow label="Scenario" value={detail.scenarioType} />
                <DetailRow label="Denial Reason" value={detail.denialReason} />
                <DetailList label="Missing Scope Items" items={detail.missingScopeItems} />
                <DetailList label="Documentation Used" items={detail.documentationUsed} />
                <DetailRow label="Action Taken" value={detail.actionTaken} />
                <DetailRow label="What Worked" value={detail.whatWorked} />
                <DetailRow label="What Didn't Work" value={detail.whatDidNotWork} />
                <DetailRow label="Timeline" value={detail.timelineSummary} />
                <DetailRow label="Recommended Next Step" value={detail.recommendedNextStep} />
                <div className="grid grid-cols-3 gap-3 pt-2">
                  <div><div className="text-xs text-muted-foreground">Supplement Δ</div><div className="font-medium">{money(detail.supplementDelta)}</div></div>
                  <div><div className="text-xs text-muted-foreground">Confidence</div><div className="font-medium">{detail.confidenceScore != null ? `${Math.round(detail.confidenceScore * 100)}%` : "—"}</div></div>
                  <div><div className="text-xs text-muted-foreground">Source Claims</div><div className="font-medium">{detail.sourceClaimCount ?? "—"}</div></div>
                </div>
              </div>
              {isMaster && (
                <DialogFooter>
                  <Button variant="destructive" disabled={deleteMutation.isPending} onClick={() => deleteMutation.mutate(detail.id)} data-testid="button-delete-playbook">
                    {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Delete
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
function DetailRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return <div><div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</div><p className="mt-0.5">{value}</p></div>;
}
function DetailList({ label, items }: { label: string; items?: string[] | null }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{label}</div>
      <div className="flex flex-wrap gap-1.5">{items.map((it, i) => <Badge key={i} variant="secondary">{it}</Badge>)}</div>
    </div>
  );
}
