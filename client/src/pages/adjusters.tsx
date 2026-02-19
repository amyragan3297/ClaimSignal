import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Adjuster } from "@shared/schema";
import { Plus, Users, Loader2, Search, X } from "lucide-react";

const createAdjusterSchema = z.object({
  fullName: z.string().min(1, "Name required"),
  carrier: z.string().optional(),
  licenseNumber: z.string().optional(),
  region: z.string().optional(),
});

export default function AdjustersPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: adjustersList, isLoading } = useQuery<Adjuster[]>({
    queryKey: ["/api/adjusters"],
  });

  const form = useForm<z.infer<typeof createAdjusterSchema>>({
    resolver: zodResolver(createAdjusterSchema),
    defaultValues: { fullName: "", carrier: "", licenseNumber: "", region: "" },
  });

  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof createAdjusterSchema>) => {
      await apiRequest("POST", "/api/adjusters", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/adjusters"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      toast({ title: "Adjuster added successfully" });
      setDialogOpen(false);
      form.reset();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to add adjuster", description: err.message, variant: "destructive" });
    },
  });

  const filteredAdjusters = adjustersList?.filter(
    (a) =>
      (a.fullName || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.carrier || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.region || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-adjusters-title">Adjusters</h1>
          <p className="text-sm text-muted-foreground">Track and manage insurance adjusters</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-adjuster">
              <Plus className="w-4 h-4" />
              Add Adjuster
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Adjuster</DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input placeholder="John Smith" data-testid="input-adjuster-name" {...form.register("fullName")} />
                {form.formState.errors.fullName && <p className="text-xs text-destructive">{form.formState.errors.fullName.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Carrier</Label>
                <Input placeholder="State Farm, Allstate..." data-testid="input-adjuster-carrier" {...form.register("carrier")} />
              </div>
              <div className="space-y-2">
                <Label>License Number</Label>
                <Input placeholder="ADJ-12345" data-testid="input-adjuster-license" {...form.register("licenseNumber")} />
              </div>
              <div className="space-y-2">
                <Label>Region</Label>
                <Input placeholder="Southeast, Texas..." data-testid="input-adjuster-region" {...form.register("region")} />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-adjuster">
                  {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Add Adjuster
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
            placeholder="Search adjusters..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search-adjusters"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !filteredAdjusters?.length ? (
            <div className="p-12 text-center">
              <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground font-medium">No adjusters found</p>
              <p className="text-sm text-muted-foreground/70 mb-4">
                {searchQuery ? "Try adjusting your search" : "Add your first adjuster to start tracking"}
              </p>
              {!searchQuery && (
                <Button variant="outline" onClick={() => setDialogOpen(true)} data-testid="button-empty-new-adjuster">
                  <Plus className="w-4 h-4" />
                  Add Adjuster
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Carrier</TableHead>
                    <TableHead>License</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAdjusters.map((adj) => (
                    <TableRow key={adj.id} data-testid={`row-adjuster-${adj.id}`}>
                      <TableCell className="font-medium" data-testid={`text-adjuster-name-${adj.id}`}>{adj.fullName}</TableCell>
                      <TableCell data-testid={`text-adjuster-carrier-${adj.id}`}>{adj.carrier || "\u2014"}</TableCell>
                      <TableCell className="font-mono text-sm">{adj.licenseNumber || "\u2014"}</TableCell>
                      <TableCell>{adj.region || "\u2014"}</TableCell>
                      <TableCell>
                        <Badge variant={adj.isActive ? "default" : "secondary"} className="text-xs capitalize">
                          {adj.isActive ? "Active" : "Inactive"}
                        </Badge>
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
