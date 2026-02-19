import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";
import type { Claim } from "@shared/schema";
import { Plus, Search, FileText, Eye, Loader2, X } from "lucide-react";

const createClaimSchema = z.object({
  claimNumber: z.string().min(1, "Claim number required"),
  carrier: z.string().optional(),
  propertyAddress: z.string().optional(),
  status: z.string().default("open"),
  notes: z.string().optional(),
});

const statusColors: Record<string, string> = {
  open: "default",
  in_progress: "secondary",
  approved: "default",
  denied: "destructive",
  closed: "outline",
};

export default function ClaimsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: claims, isLoading } = useQuery<Claim[]>({
    queryKey: ["/api/claims"],
  });

  const form = useForm<z.infer<typeof createClaimSchema>>({
    resolver: zodResolver(createClaimSchema),
    defaultValues: {
      claimNumber: "",
      carrier: "",
      propertyAddress: "",
      status: "open",
      notes: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof createClaimSchema>) => {
      await apiRequest("POST", "/api/claims", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/claims"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Claim created successfully" });
      setDialogOpen(false);
      form.reset();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create claim", description: err.message, variant: "destructive" });
    },
  });

  const filteredClaims = claims?.filter(
    (c) =>
      (c.claimNumber || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.carrier || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.propertyAddress || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-claims-title">Claims</h1>
          <p className="text-sm text-muted-foreground">Manage and track property claims</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-claim">
              <Plus className="w-4 h-4" />
              New Claim
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Claim</DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
              <div className="space-y-2">
                <Label>Claim Number</Label>
                <Input placeholder="CLM-00001" data-testid="input-claim-number" {...form.register("claimNumber")} />
                {form.formState.errors.claimNumber && <p className="text-xs text-destructive">{form.formState.errors.claimNumber.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Carrier</Label>
                <Input placeholder="State Farm, Allstate..." data-testid="input-carrier" {...form.register("carrier")} />
              </div>
              <div className="space-y-2">
                <Label>Property Address</Label>
                <Input placeholder="123 Main Street, Dallas TX" data-testid="input-address" {...form.register("propertyAddress")} />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea placeholder="Additional details..." data-testid="input-notes" {...form.register("notes")} className="resize-none" />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel-claim">
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-claim">
                  {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Create Claim
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search claims..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search-claims"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !filteredClaims?.length ? (
            <div className="p-12 text-center">
              <FileText className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground font-medium">No claims found</p>
              <p className="text-sm text-muted-foreground/70 mb-4">
                {searchQuery ? "Try adjusting your search" : "Create your first claim to get started"}
              </p>
              {!searchQuery && (
                <Button variant="outline" onClick={() => setDialogOpen(true)} data-testid="button-empty-new-claim">
                  <Plus className="w-4 h-4" />
                  New Claim
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Claim #</TableHead>
                    <TableHead>Carrier</TableHead>
                    <TableHead>Property</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Risk Score</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredClaims.map((claim) => (
                    <TableRow key={claim.id} className="hover-elevate cursor-pointer" onClick={() => setLocation(`/claims/${claim.id}`)} data-testid={`row-claim-${claim.id}`}>
                      <TableCell className="font-mono text-sm" data-testid={`text-claim-number-${claim.id}`}>{claim.claimNumber}</TableCell>
                      <TableCell data-testid={`text-carrier-${claim.id}`}>{claim.carrier || "\u2014"}</TableCell>
                      <TableCell className="text-muted-foreground max-w-[200px] truncate" data-testid={`text-address-${claim.id}`}>
                        {claim.propertyAddress || "\u2014"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={(statusColors[claim.status] as any) || "outline"}
                          className="text-xs capitalize"
                        >
                          {claim.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {claim.riskScore !== null ? (
                          <Badge variant={claim.riskScore > 70 ? "destructive" : claim.riskScore > 40 ? "secondary" : "outline"} className="text-xs">
                            {claim.riskScore}
                          </Badge>
                        ) : "\u2014"}
                      </TableCell>
                      <TableCell>
                        <Eye className="w-4 h-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
