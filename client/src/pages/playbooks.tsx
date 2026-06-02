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
import { BookOpen, Plus, Loader2, Trash2, CheckCircle2, TrendingUp, Building2, FileText, Search, Sparkles } from "lucide-react";

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

interface SearchResult {
  claimId: string;
  claimIdentifier: string;
  carrier: string | null;
  lossType: string | null;
  adjusters: string[];
  initialOutcome: string | null;
  finalOutcome: string | null;
  escalationUsed: boolean;
  reinspectionRequested: boolean;
  strategySummary: {
    path: string[];
    reusableStrategy: string[];
    confidence: "high" | "medium" | "low";
  };
}

interface SearchResponse {
  method: string;
  totalResults: number;
  results: SearchResult[];
  confidenceNote?: string | null;
  message?: string | null;
  executiveAggregateOnly?: boolean;
}

export default function PlaybooksPage() {
  const { data: auth } = useAuth();
  const isMaster = auth?.user.role === "super_admin" || !!auth?.isPlatformOwner;
  const isExecutive = auth?.user.role === "carrier_analyst";
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<PlaybookEntry | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResponse | null>(null);

  const { data, isLoading } = useQuery<PlaybookEntry[]>({ queryKey: ["/api/playbooks"] });

  const searchMutation = useMutation({
    mutationFn: async (q: string) => {
      const res = await apiRequest("POST", "/api/playbook/search", { query: q });
      return res.json() as Promise<SearchResponse>;
    },
    onSuccess: (data) => setSearchResults(data),
    onError: (e: Error) => toast({ title: "Search failed", description: e.message, variant: "destructive" }),
  });

  const [form, setForm] = useState({
    title: "", scenarioType: "", claimType: "", carrier: "", denialReason: "",
    actionTaken: "", whatWorked: "", whatDidNotWork: "", timelineSummary: "",
    outcome: "", recommendedNextStep: "",
  });
  const [aiGenerated, setAiGenerated] = useState(false);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/playbooks/generate", {
        scenarioType: form.scenarioType || undefined,
        carrier: form.carrier || undefined,
        claimType: form.claimType || undefined,
        denialReason: form.denialReason || undefined,
      });
      return res.json() as Promise<{
        title: string; actionTaken: string; whatWorked: string; whatDidNotWork: string;
        timelineSummary: string; recommendedNextStep: string; outcome: string;
        missingScopeItems: string[]; documentationUsed: string[]; confidenceScore: number;
      }>;
    },
    onSuccess: (data) => {
      setForm((f) => ({
        ...f,
        title: data.title || f.title,
        actionTaken: data.actionTaken || f.actionTaken,
        whatWorked: data.whatWorked || f.whatWorked,
        whatDidNotWork: data.whatDidNotWork || f.whatDidNotWork,
        timelineSummary: data.timelineSummary || f.timelineSummary,
        recommendedNextStep: data.recommendedNextStep || f.recommendedNextStep,
        outcome: data.outcome || f.outcome,
      }));
      setAiGenerated(true);
      toast({ title: "AI generation complete", description: "Fields populated — review and save." });
    },
    onError: (e: Error) => toast({ title: "AI generation failed", description: e.message, variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: async () => { await apiRequest("POST", "/api/playbooks", form); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/playbooks"] });
      toast({ title: "Playbook created" });
      setCreateOpen(false);
      setAiGenerated(false);
      setForm({ title: "", scenarioType: "", claimType: "", carrier: "", denialReason: "", actionTaken: "", whatWorked: "", whatDidNotWork: "", timelineSummary: "", outcome: "", recommendedNextStep: "" });
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
          <Dialog open={createOpen} onOpenChange={(o) => {
            setCreateOpen(o);
            if (!o) { setAiGenerated(false); setForm({ title: "", scenarioType: "", claimType: "", carrier: "", denialReason: "", actionTaken: "", whatWorked: "", whatDidNotWork: "", timelineSummary: "", outcome: "", recommendedNextStep: "" }); }
          }}>
            <DialogTrigger asChild>
              <Button data-testid="button-new-playbook"><Plus className="w-4 h-4" /> New Playbook</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Create Playbook Entry</DialogTitle></DialogHeader>
              <div className="space-y-3">
                {/* Seed fields — used as AI context */}
                <div className="rounded-md border border-border bg-muted/30 p-3 space-y-3">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Seed inputs — provide any you know, then generate</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Scenario Type"><Input data-testid="input-playbook-scenario" placeholder="denial_overturned" value={form.scenarioType} onChange={(e) => setForm({ ...form, scenarioType: e.target.value })} /></Field>
                    <Field label="Claim Type"><Input data-testid="input-playbook-claimtype" placeholder="hail, wind, fire…" value={form.claimType} onChange={(e) => setForm({ ...form, claimType: e.target.value })} /></Field>
                    <Field label="Carrier"><Input data-testid="input-playbook-carrier" placeholder="e.g. Allstate" value={form.carrier} onChange={(e) => setForm({ ...form, carrier: e.target.value })} /></Field>
                    <Field label="Denial Reason"><Input data-testid="input-playbook-denial" placeholder="e.g. pre-existing damage" value={form.denialReason} onChange={(e) => setForm({ ...form, denialReason: e.target.value })} /></Field>
                  </div>
                  <Button
                    type="button"
                    className="w-full"
                    variant="secondary"
                    disabled={generateMutation.isPending}
                    onClick={() => generateMutation.mutate()}
                    data-testid="button-generate-playbook"
                  >
                    {generateMutation.isPending
                      ? <><Loader2 className="w-4 h-4 animate-spin mr-1.5" />Generating…</>
                      : <><Sparkles className="w-4 h-4 mr-1.5" />Generate with AI</>}
                  </Button>
                </div>

                {/* AI-generated / editable fields */}
                {aiGenerated && (
                  <div className="flex items-center gap-1.5 text-xs text-primary">
                    <Sparkles className="w-3 h-3" />
                    <span>AI-generated — review and edit before saving</span>
                  </div>
                )}
                <Field label="Title"><Input data-testid="input-playbook-title" placeholder="Concise scenario + outcome" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
                <Field label="Outcome"><Input data-testid="input-playbook-outcome" placeholder="e.g. denial_overturned" value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value })} /></Field>
                <Field label="Action Taken"><Textarea data-testid="input-playbook-action" className="resize-none min-h-[80px]" placeholder="What actions were taken on this type of claim?" value={form.actionTaken} onChange={(e) => setForm({ ...form, actionTaken: e.target.value })} /></Field>
                <Field label="What Worked"><Textarea data-testid="input-playbook-worked" className="resize-none min-h-[72px]" placeholder="Tactics or documentation that produced results" value={form.whatWorked} onChange={(e) => setForm({ ...form, whatWorked: e.target.value })} /></Field>
                <Field label="What Didn't Work"><Textarea data-testid="input-playbook-notworked" className="resize-none" placeholder="Approaches that failed or stalled" value={form.whatDidNotWork} onChange={(e) => setForm({ ...form, whatDidNotWork: e.target.value })} /></Field>
                <Field label="Recommended Next Step"><Textarea data-testid="input-playbook-nextstep" className="resize-none" placeholder="Most important action right now" value={form.recommendedNextStep} onChange={(e) => setForm({ ...form, recommendedNextStep: e.target.value })} /></Field>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setCreateOpen(false); setAiGenerated(false); }} data-testid="button-cancel-playbook">Cancel</Button>
                <Button disabled={!form.title || createMutation.isPending} onClick={() => createMutation.mutate()} data-testid="button-submit-playbook">
                  {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />} Save Playbook
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* AI-powered historical search */}
      <div className="flex gap-2" data-testid="section-playbook-search">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            data-testid="input-playbook-search"
            className="pl-8"
            placeholder="Search historical patterns — e.g. Allstate hail denials that were overturned"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchQuery.trim() && searchMutation.mutate(searchQuery)}
          />
        </div>
        <Button
          data-testid="button-playbook-search"
          disabled={!searchQuery.trim() || searchMutation.isPending}
          onClick={() => searchMutation.mutate(searchQuery)}
          variant="secondary"
        >
          {searchMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          <span className="ml-1.5 hidden sm:inline">Search</span>
        </Button>
        {searchResults && (
          <Button variant="ghost" size="sm" onClick={() => { setSearchResults(null); setSearchQuery(""); }} data-testid="button-clear-search">
            Clear
          </Button>
        )}
      </div>

      {/* Search results */}
      {searchResults && (
        <div className="space-y-3" data-testid="section-search-results">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {searchResults.totalResults === 0
                ? (searchResults.message || "No matching historical patterns found.")
                : `${searchResults.totalResults} matching pattern${searchResults.totalResults === 1 ? "" : "s"}`}
              {searchResults.totalResults > 0 && (
                <span className="ml-2 text-xs opacity-60">via {searchResults.method}</span>
              )}
            </p>
            {searchResults.confidenceNote && (
              <Badge variant="outline" className="text-[10px]">{searchResults.confidenceNote}</Badge>
            )}
          </div>
          {searchResults.executiveAggregateOnly ? (
            <Card>
              <CardContent className="py-4 text-sm text-muted-foreground">
                {searchResults.message || "Aggregate data only available for Executive role."}
              </CardContent>
            </Card>
          ) : (
            searchResults.results?.map((r) => (
              <Card key={r.claimId} className="border-primary/20" data-testid={`card-search-result-${r.claimId}`}>
                <CardContent className="pt-4 pb-3 space-y-2">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex flex-wrap gap-1.5">
                      {r.carrier && <Badge variant="secondary"><Building2 className="w-3 h-3 mr-1" />{r.carrier}</Badge>}
                      {r.lossType && <Badge variant="outline">{r.lossType}</Badge>}
                      {r.initialOutcome && <Badge variant="outline">Initial: {r.initialOutcome}</Badge>}
                      {r.finalOutcome && <Badge variant="default"><CheckCircle2 className="w-3 h-3 mr-1" />{r.finalOutcome}</Badge>}
                      {r.escalationUsed && <Badge variant="outline" className="text-yellow-400 border-yellow-500/50">Escalated</Badge>}
                      {r.reinspectionRequested && <Badge variant="outline">Reinspected</Badge>}
                    </div>
                    <Badge variant="secondary" className="text-[10px] shrink-0">{r.claimIdentifier}</Badge>
                  </div>
                  {r.strategySummary?.path?.length > 0 && (
                    <p className="text-xs text-muted-foreground">{r.strategySummary.path.join(" → ")}</p>
                  )}
                  {r.strategySummary?.reusableStrategy?.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {r.strategySummary.reusableStrategy.map((s, i) => (
                        <Badge key={i} variant="outline" className="text-[10px]">{s}</Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

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
