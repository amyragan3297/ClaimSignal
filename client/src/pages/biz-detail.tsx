import { useState } from "react";
import { useRoute, Redirect, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, ArrowLeft, Edit2, Save, X, Trash2, Loader2,
} from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
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

function Field({ label, value, href }: { label: string; value?: string | null; href?: string }) {
  if (!value) return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-muted-foreground/50">—</p>
    </div>
  );
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
          {value}
        </a>
      ) : (
        <p className="text-sm">{value}</p>
      )}
    </div>
  );
}

export default function BizDetailPage() {
  const { data: authData } = useAuth();
  const isMaster = authData?.user?.role === "master_admin" || authData?.isPlatformOwner;
  const [, params] = useRoute("/biz/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editForm, setEditForm] = useState<Partial<BizCompany>>({});

  const id = params?.id;

  const { data: company, isLoading } = useQuery<BizCompany>({
    queryKey: ["/api/biz/companies", id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/biz/companies/${id}`);
      if (!res.ok) throw new Error("Company not found");
      return res.json();
    },
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<BizCompany>) => {
      const res = await apiRequest("PATCH", `/api/biz/companies/${id}`, data);
      if (!res.ok) throw new Error((await res.json()).message || "Failed to update");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Company updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/biz/companies", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/biz/companies"] });
      setEditing(false);
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/biz/companies/${id}`);
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      toast({ title: "Company deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/biz/companies"] });
      navigate("/biz");
    },
    onError: (err: Error) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  if (!isMaster) return <Redirect to="/dashboard" />;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground">Company not found.</p>
        <Button variant="ghost" className="mt-4" onClick={() => navigate("/biz")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Business Dev
        </Button>
      </div>
    );
  }

  const startEdit = () => {
    setEditForm({ ...company });
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditForm({});
    setEditing(false);
  };

  const togglePurpose = (p: string) => {
    setEditForm(f => {
      const current = f.outreachPurposes ?? [];
      return {
        ...f,
        outreachPurposes: current.includes(p)
          ? current.filter(x => x !== p)
          : [...current, p],
      };
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/biz")} className="mb-2 -ml-2" data-testid="button-back-biz">
            <ArrowLeft className="w-4 h-4 mr-1" /> Business Dev
          </Button>
          <h1 className="text-2xl font-bold flex items-center gap-2" data-testid="text-company-name">
            <Building2 className="w-6 h-6 text-primary" />
            {company.name}
          </h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span className="text-sm text-muted-foreground">{COMPANY_TYPE_LABELS[company.companyType] ?? company.companyType}</span>
            <Badge variant="outline" className={`text-xs ${RELATIONSHIP_STATUS_COLORS[company.relationshipStatus] ?? ""}`}>
              {company.relationshipStatus}
            </Badge>
            {(company.outreachPurposes ?? []).map(p => (
              <Badge key={p} variant="secondary" className="text-xs">{OUTREACH_PURPOSE_LABELS[p] ?? p}</Badge>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          {!editing && (
            <>
              <Button size="sm" variant="outline" onClick={startEdit} data-testid="button-edit-company">
                <Edit2 className="w-4 h-4 mr-1" /> Edit
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)} data-testid="button-delete-company">
                <Trash2 className="w-4 h-4" />
              </Button>
            </>
          )}
          {editing && (
            <>
              <Button size="sm" onClick={() => updateMutation.mutate(editForm)} disabled={updateMutation.isPending} data-testid="button-save-edit">
                {updateMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={cancelEdit} data-testid="button-cancel-edit">
                <X className="w-4 h-4 mr-1" /> Cancel
              </Button>
            </>
          )}
        </div>
      </div>

      {!editing ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Company Info */}
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Company Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <Field label="Company Type" value={COMPANY_TYPE_LABELS[company.companyType]} />
              <Field label="Relationship Status" value={company.relationshipStatus} />
              <Field
                label="Website"
                value={company.website}
                href={company.website ? (company.website.startsWith("http") ? company.website : `https://${company.website}`) : undefined}
              />
              <Field label="State / Region" value={company.state} />
              <Field label="Service Area" value={company.serviceArea} />
              <Field label="Main Phone" value={company.mainPhone} href={company.mainPhone ? `tel:${company.mainPhone}` : undefined} />
              <Field label="General Email" value={company.generalEmail} href={company.generalEmail ? `mailto:${company.generalEmail}` : undefined} />
            </CardContent>
          </Card>

          {/* Contact Info */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Primary Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field label="Name" value={company.contactPersonName} />
              <Field label="Title" value={company.contactTitle} />
              <Field label="Direct Phone" value={company.directPhone} href={company.directPhone ? `tel:${company.directPhone}` : undefined} />
              <Field label="Direct Email" value={company.directEmail} href={company.directEmail ? `mailto:${company.directEmail}` : undefined} />
            </CardContent>
          </Card>

          {/* Outreach Purposes */}
          {(company.outreachPurposes ?? []).length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Outreach Purpose</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {(company.outreachPurposes ?? []).map(p => (
                    <Badge key={p} variant="secondary">{OUTREACH_PURPOSE_LABELS[p] ?? p}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Notes */}
          <Card className="lg:col-span-3">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Notes & Relationship History</CardTitle>
            </CardHeader>
            <CardContent>
              {company.notes ? (
                <p className="text-sm whitespace-pre-wrap">{company.notes}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No notes yet. Click Edit to add relationship history and context.</p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2 space-y-1.5">
            <Label>Company Name *</Label>
            <Input data-testid="input-edit-name" value={editForm.name ?? ""} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Company Type</Label>
            <Select value={editForm.companyType ?? "other"} onValueChange={v => setEditForm(f => ({ ...f, companyType: v as BizCompany["companyType"] }))}>
              <SelectTrigger data-testid="select-edit-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(COMPANY_TYPE_LABELS).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Relationship Status</Label>
            <Select value={editForm.relationshipStatus ?? "prospect"} onValueChange={v => setEditForm(f => ({ ...f, relationshipStatus: v as BizCompany["relationshipStatus"] }))}>
              <SelectTrigger data-testid="select-edit-status"><SelectValue /></SelectTrigger>
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
            <Input data-testid="input-edit-website" value={editForm.website ?? ""} onChange={e => setEditForm(f => ({ ...f, website: e.target.value || null }))} />
          </div>
          <div className="space-y-1.5">
            <Label>State / Region</Label>
            <Input data-testid="input-edit-state" value={editForm.state ?? ""} onChange={e => setEditForm(f => ({ ...f, state: e.target.value || null }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Main Phone</Label>
            <Input data-testid="input-edit-main-phone" value={editForm.mainPhone ?? ""} onChange={e => setEditForm(f => ({ ...f, mainPhone: e.target.value || null }))} />
          </div>
          <div className="space-y-1.5">
            <Label>General Email</Label>
            <Input data-testid="input-edit-general-email" type="email" value={editForm.generalEmail ?? ""} onChange={e => setEditForm(f => ({ ...f, generalEmail: e.target.value || null }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Contact Person</Label>
            <Input data-testid="input-edit-contact" value={editForm.contactPersonName ?? ""} onChange={e => setEditForm(f => ({ ...f, contactPersonName: e.target.value || null }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Contact Title</Label>
            <Input data-testid="input-edit-title" value={editForm.contactTitle ?? ""} onChange={e => setEditForm(f => ({ ...f, contactTitle: e.target.value || null }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Direct Phone</Label>
            <Input data-testid="input-edit-direct-phone" value={editForm.directPhone ?? ""} onChange={e => setEditForm(f => ({ ...f, directPhone: e.target.value || null }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Direct Email</Label>
            <Input data-testid="input-edit-direct-email" type="email" value={editForm.directEmail ?? ""} onChange={e => setEditForm(f => ({ ...f, directEmail: e.target.value || null }))} />
          </div>
          <div className="md:col-span-2 space-y-1.5">
            <Label>Service Area</Label>
            <Input data-testid="input-edit-service-area" value={editForm.serviceArea ?? ""} onChange={e => setEditForm(f => ({ ...f, serviceArea: e.target.value || null }))} />
          </div>
          <div className="md:col-span-2 space-y-2">
            <Label>Outreach Purpose</Label>
            <div className="flex flex-wrap gap-2">
              {Object.entries(OUTREACH_PURPOSE_LABELS).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => togglePurpose(v)}
                  data-testid={`toggle-edit-purpose-${v}`}
                  className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                    (editForm.outreachPurposes ?? []).includes(v)
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
            <Textarea
              data-testid="textarea-edit-notes"
              value={editForm.notes ?? ""}
              onChange={e => setEditForm(f => ({ ...f, notes: e.target.value || null }))}
              rows={5}
              placeholder="Relationship history, context, key contacts..."
            />
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete Company"
        description={`Permanently delete "${company.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        isPending={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  );
}
