import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Redirect } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, Plus, Search, Copy, Mail, Phone, MapPin,
  ExternalLink, Loader2, Filter,
} from "lucide-react";
import type { BizCompany } from "@shared/schema";

const COMPANY_TYPE_LABELS: Record<string, string> = {
  insurance_carrier: "Insurance Carrier",
  adjusting_firm: "Adjusting Firm",
  restoration_contractor: "Restoration Contractor",
  roofing_contractor: "Roofing Contractor",
  public_adjuster: "Public Adjuster",
  engineering_firm: "Engineering Firm",
  law_firm: "Law Firm",
  vendor: "Vendor",
  tpa: "TPA",
  other: "Other",
};

const RELATIONSHIP_STATUS_COLORS: Record<string, string> = {
  prospect: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  active: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  partner: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  inactive: "bg-muted text-muted-foreground",
};

const OUTREACH_PURPOSE_LABELS: Record<string, string> = {
  sales: "Sales",
  partnership: "Partnership",
  founder_recruitment: "Founder Recruitment",
  investor_outreach: "Investor Outreach",
  enterprise_prospect: "Enterprise Prospect",
};

interface OutreachItem {
  id: string;
  name: string;
  companyType: string;
  contactPersonName: string | null;
  email: string | null;
  directPhone: string | null;
  relationshipStatus: string;
  outreachPurposes: string[] | null;
  state: string | null;
}

function AddCompanyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: "",
    companyType: "other",
    website: "",
    mainPhone: "",
    generalEmail: "",
    contactPersonName: "",
    contactTitle: "",
    directPhone: "",
    directEmail: "",
    state: "",
    serviceArea: "",
    relationshipStatus: "prospect",
    outreachPurposes: [] as string[],
    notes: "",
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const payload = {
        ...data,
        website: data.website || null,
        mainPhone: data.mainPhone || null,
        generalEmail: data.generalEmail || null,
        contactPersonName: data.contactPersonName || null,
        contactTitle: data.contactTitle || null,
        directPhone: data.directPhone || null,
        directEmail: data.directEmail || null,
        state: data.state || null,
        serviceArea: data.serviceArea || null,
        notes: data.notes || null,
        outreachPurposes: data.outreachPurposes.length ? data.outreachPurposes : null,
      };
      const res = await apiRequest("POST", "/api/biz/companies", payload);
      if (!res.ok) throw new Error((await res.json()).message || "Failed to create company");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Company added" });
      queryClient.invalidateQueries({ queryKey: ["/api/biz/companies"] });
      onOpenChange(false);
      setForm({
        name: "", companyType: "other", website: "", mainPhone: "", generalEmail: "",
        contactPersonName: "", contactTitle: "", directPhone: "", directEmail: "",
        state: "", serviceArea: "", relationshipStatus: "prospect", outreachPurposes: [], notes: "",
      });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add company", description: err.message, variant: "destructive" });
    },
  });

  const togglePurpose = (p: string) => {
    setForm(f => ({
      ...f,
      outreachPurposes: f.outreachPurposes.includes(p)
        ? f.outreachPurposes.filter(x => x !== p)
        : [...f.outreachPurposes, p],
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Company</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
          <div className="md:col-span-2 space-y-1.5">
            <Label>Company Name *</Label>
            <Input data-testid="input-company-name" placeholder="Acme Insurance" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Company Type</Label>
            <Select value={form.companyType} onValueChange={v => setForm(f => ({ ...f, companyType: v }))}>
              <SelectTrigger data-testid="select-company-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(COMPANY_TYPE_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Relationship Status</Label>
            <Select value={form.relationshipStatus} onValueChange={v => setForm(f => ({ ...f, relationshipStatus: v }))}>
              <SelectTrigger data-testid="select-relationship-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="prospect">Prospect</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="partner">Partner</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Website</Label>
            <Input data-testid="input-website" placeholder="https://..." value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>State / Region</Label>
            <Input data-testid="input-state" placeholder="TX" value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Main Phone</Label>
            <Input data-testid="input-main-phone" placeholder="(555) 000-0000" value={form.mainPhone} onChange={e => setForm(f => ({ ...f, mainPhone: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>General Email</Label>
            <Input data-testid="input-general-email" type="email" placeholder="info@company.com" value={form.generalEmail} onChange={e => setForm(f => ({ ...f, generalEmail: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Contact Person</Label>
            <Input data-testid="input-contact-person" placeholder="Jane Smith" value={form.contactPersonName} onChange={e => setForm(f => ({ ...f, contactPersonName: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Contact Title</Label>
            <Input data-testid="input-contact-title" placeholder="VP Claims" value={form.contactTitle} onChange={e => setForm(f => ({ ...f, contactTitle: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Direct Phone</Label>
            <Input data-testid="input-direct-phone" placeholder="(555) 000-0001" value={form.directPhone} onChange={e => setForm(f => ({ ...f, directPhone: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Direct Email</Label>
            <Input data-testid="input-direct-email" type="email" placeholder="jane@company.com" value={form.directEmail} onChange={e => setForm(f => ({ ...f, directEmail: e.target.value }))} />
          </div>
          <div className="md:col-span-2 space-y-1.5">
            <Label>Service Area</Label>
            <Input data-testid="input-service-area" placeholder="Southeast US, DFW Metro..." value={form.serviceArea} onChange={e => setForm(f => ({ ...f, serviceArea: e.target.value }))} />
          </div>
          <div className="md:col-span-2 space-y-2">
            <Label>Outreach Purpose</Label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(OUTREACH_PURPOSE_LABELS).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => togglePurpose(v)}
                  data-testid={`toggle-purpose-${v}`}
                  className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                    form.outreachPurposes.includes(v)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-transparent border-border text-muted-foreground hover:border-primary/50"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="md:col-span-2 space-y-1.5">
            <Label>Notes</Label>
            <Textarea data-testid="textarea-notes" placeholder="Relationship history, context, key contacts..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            data-testid="button-save-company"
            onClick={() => createMutation.mutate(form)}
            disabled={!form.name || createMutation.isPending}
          >
            {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
            Add Company
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompanyListTab() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);

  const params = new URLSearchParams();
  if (typeFilter !== "all") params.set("companyType", typeFilter);
  if (statusFilter !== "all") params.set("relationshipStatus", statusFilter);

  const { data: companies, isLoading } = useQuery<BizCompany[]>({
    queryKey: ["/api/biz/companies", typeFilter, statusFilter],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/biz/companies?${params.toString()}`);
      return res.json();
    },
  });

  const filtered = (companies ?? []).filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.contactPersonName ?? "").toLowerCase().includes(q) ||
      (c.state ?? "").toLowerCase().includes(q) ||
      (c.generalEmail ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            data-testid="input-company-search"
            className="pl-9"
            placeholder="Search companies, contacts, states..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44" data-testid="select-filter-type">
            <Filter className="w-3.5 h-3.5 mr-1 text-muted-foreground" />
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(COMPANY_TYPE_LABELS).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36" data-testid="select-filter-status">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="prospect">Prospect</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="partner">Partner</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => setShowAdd(true)} data-testid="button-add-company">
          <Plus className="w-4 h-4 mr-1" />
          Add Company
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Building2 className="w-8 h-8 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                {companies?.length === 0 ? "No companies added yet. Click \u201cAdd Company\u201d to start building your database." : "No companies match the current filters."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(c => (
                  <TableRow
                    key={c.id}
                    className="cursor-pointer hover:bg-muted/30"
                    onClick={() => navigate(`/biz/${c.id}`)}
                    data-testid={`row-company-${c.id}`}
                  >
                    <TableCell className="font-medium">
                      <div>
                        <span>{c.name}</span>
                        {c.website && (
                          <a
                            href={c.website.startsWith("http") ? c.website : `https://${c.website}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-2 text-muted-foreground hover:text-primary"
                            onClick={e => e.stopPropagation()}
                          >
                            <ExternalLink className="w-3 h-3 inline" />
                          </a>
                        )}
                      </div>
                      {c.serviceArea && <p className="text-xs text-muted-foreground">{c.serviceArea}</p>}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {COMPANY_TYPE_LABELS[c.companyType] ?? c.companyType}
                      </span>
                    </TableCell>
                    <TableCell>
                      {c.contactPersonName ? (
                        <div>
                          <p className="text-sm">{c.contactPersonName}</p>
                          {c.contactTitle && <p className="text-xs text-muted-foreground">{c.contactTitle}</p>}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.directEmail || c.generalEmail || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.state || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${RELATIONSHIP_STATUS_COLORS[c.relationshipStatus] ?? ""}`}>
                        {c.relationshipStatus}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AddCompanyDialog open={showAdd} onOpenChange={setShowAdd} />
    </div>
  );
}

function OutreachListTab() {
  const [typeFilter, setTypeFilter] = useState("all");
  const [purposeFilter, setPurposeFilter] = useState("all");
  const { toast } = useToast();

  const params = new URLSearchParams();
  if (typeFilter !== "all") params.set("companyType", typeFilter);
  if (purposeFilter !== "all") params.set("outreachPurpose", purposeFilter);

  const { data: outreachList, isLoading } = useQuery<OutreachItem[]>({
    queryKey: ["/api/biz/outreach-list", typeFilter, purposeFilter],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/biz/outreach-list?${params.toString()}`);
      return res.json();
    },
  });

  const copyAll = () => {
    if (!outreachList?.length) return;
    const text = outreachList
      .map(item => {
        const name = item.contactPersonName ? `${item.contactPersonName} (${item.name})` : item.name;
        return `${name} <${item.email}>`;
      })
      .join("\n");
    navigator.clipboard.writeText(text);
    toast({ title: `Copied ${outreachList.length} contacts to clipboard` });
  };

  const copyEmails = () => {
    if (!outreachList?.length) return;
    const text = outreachList.map(item => item.email).join(", ");
    navigator.clipboard.writeText(text);
    toast({ title: `Copied ${outreachList.length} email addresses` });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44" data-testid="select-outreach-type">
            <SelectValue placeholder="All Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(COMPANY_TYPE_LABELS).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={purposeFilter} onValueChange={setPurposeFilter}>
          <SelectTrigger className="w-48" data-testid="select-outreach-purpose">
            <SelectValue placeholder="All Purposes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Purposes</SelectItem>
            {Object.entries(OUTREACH_PURPOSE_LABELS).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={copyEmails} disabled={!outreachList?.length} data-testid="button-copy-emails">
            <Mail className="w-4 h-4 mr-1" />
            Copy Emails
          </Button>
          <Button size="sm" variant="outline" onClick={copyAll} disabled={!outreachList?.length} data-testid="button-copy-all">
            <Copy className="w-4 h-4 mr-1" />
            Copy All
          </Button>
        </div>
      </div>

      {outreachList && (
        <p className="text-xs text-muted-foreground">
          {outreachList.length} contact{outreachList.length !== 1 ? "s" : ""} with email addresses
        </p>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : !outreachList?.length ? (
            <div className="py-16 text-center">
              <Mail className="w-8 h-8 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">No contacts with email addresses match the current filters.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contact</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Purposes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {outreachList.map(item => (
                  <TableRow key={item.id} data-testid={`row-outreach-${item.id}`}>
                    <TableCell className="font-medium text-sm">
                      {item.contactPersonName || "—"}
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm">{item.name}</p>
                        {item.state && <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />{item.state}</p>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <a
                        href={`mailto:${item.email}`}
                        className="text-sm text-primary hover:underline flex items-center gap-1"
                        data-testid={`link-email-${item.id}`}
                      >
                        <Mail className="w-3 h-3" />
                        {item.email}
                      </a>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {item.directPhone ? (
                        <a href={`tel:${item.directPhone}`} className="flex items-center gap-1 hover:text-foreground">
                          <Phone className="w-3 h-3" />{item.directPhone}
                        </a>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${RELATIONSHIP_STATUS_COLORS[item.relationshipStatus] ?? ""}`}>
                        {item.relationshipStatus}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(item.outreachPurposes ?? []).map(p => (
                          <Badge key={p} variant="secondary" className="text-xs">
                            {OUTREACH_PURPOSE_LABELS[p] ?? p}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function BizPage() {
  const { data } = useAuth();
  const isMaster = data?.user?.role === "master_admin" || data?.isPlatformOwner;

  if (!isMaster) return <Redirect to="/dashboard" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-biz-title">
          <Building2 className="w-6 h-6 text-primary" />
          Business Dev
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Internal CRM for business development — carriers, contractors, partners, and prospects.
        </p>
      </div>

      <Tabs defaultValue="companies">
        <TabsList>
          <TabsTrigger value="companies" data-testid="tab-companies">Companies</TabsTrigger>
          <TabsTrigger value="outreach" data-testid="tab-outreach">Outreach Lists</TabsTrigger>
        </TabsList>
        <TabsContent value="companies" className="mt-4">
          <CompanyListTab />
        </TabsContent>
        <TabsContent value="outreach" className="mt-4">
          <OutreachListTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
