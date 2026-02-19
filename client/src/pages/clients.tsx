import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Client } from "@shared/schema";
import { Plus, Search, Users, Loader2 } from "lucide-react";

const createClientSchema = z.object({
  firstName: z.string().min(1, "First name required"),
  lastName: z.string().min(1, "Last name required"),
  phone: z.string().optional(),
  email: z.string().email("Valid email required").optional().or(z.literal("")),
  streetAddress: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
});

export default function ClientsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: clientsList, isLoading } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const form = useForm<z.infer<typeof createClientSchema>>({
    resolver: zodResolver(createClientSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      streetAddress: "",
      city: "",
      state: "",
      zip: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof createClientSchema>) => {
      await apiRequest("POST", "/api/clients", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({ title: "Client created successfully" });
      setDialogOpen(false);
      form.reset();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create client", description: err.message, variant: "destructive" });
    },
  });

  const filteredClients = clientsList?.filter(
    (c) =>
      `${c.firstName} ${c.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.email || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.phone || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.streetAddress || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-clients-title">Clients</h1>
          <p className="text-sm text-muted-foreground">Manage homeowner records</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-client">
              <Plus className="w-4 h-4" />
              New Client
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Client</DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>First Name</Label>
                  <Input placeholder="John" data-testid="input-first-name" {...form.register("firstName")} />
                  {form.formState.errors.firstName && <p className="text-xs text-destructive">{form.formState.errors.firstName.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Last Name</Label>
                  <Input placeholder="Doe" data-testid="input-last-name" {...form.register("lastName")} />
                  {form.formState.errors.lastName && <p className="text-xs text-destructive">{form.formState.errors.lastName.message}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input placeholder="555-0100" data-testid="input-client-phone" {...form.register("phone")} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input placeholder="john@example.com" data-testid="input-client-email" {...form.register("email")} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Street Address</Label>
                <Input placeholder="123 Main St" data-testid="input-street-address" {...form.register("streetAddress")} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input placeholder="Dallas" data-testid="input-client-city" {...form.register("city")} />
                </div>
                <div className="space-y-2">
                  <Label>State</Label>
                  <Input placeholder="TX" data-testid="input-client-state" {...form.register("state")} />
                </div>
                <div className="space-y-2">
                  <Label>Zip</Label>
                  <Input placeholder="75201" data-testid="input-client-zip" {...form.register("zip")} />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={createMutation.isPending} data-testid="button-submit-client">
                {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Add Client"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search clients..."
          className="pl-9"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          data-testid="input-search-clients"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !filteredClients?.length ? (
            <div className="text-center py-12">
              <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">No clients found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((client) => (
                  <TableRow key={client.id} data-testid={`row-client-${client.id}`}>
                    <TableCell className="font-medium" data-testid={`text-client-name-${client.id}`}>
                      {client.firstName} {client.lastName}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{client.email || "\u2014"}</TableCell>
                    <TableCell className="text-muted-foreground">{client.phone || "\u2014"}</TableCell>
                    <TableCell className="text-muted-foreground max-w-[200px] truncate">
                      {client.streetAddress ? `${client.streetAddress}, ${client.city || ""} ${client.state || ""}` : "\u2014"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {client.createdAt ? new Date(client.createdAt).toLocaleDateString() : "\u2014"}
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