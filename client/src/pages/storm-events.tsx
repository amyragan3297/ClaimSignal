/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { CloudLightning, Plus, Trash2, Cloud, Wind, Droplets, MapPin, Info } from "lucide-react";

const stormEventFormSchema = z.object({
  dateOfLoss: z.string().min(1, "Date of loss is required"),
  propertyLocation: z.string().min(2, "Property location is required"),
  eventType: z.enum(["hail", "wind", "hail_and_wind", "other"]),
  reportSource: z.enum(["noaa", "spc", "ncei", "radar_report", "contractor_observation", "homeowner_statement", "other"]),
  hailSize: z.string().optional(),
  windSpeed: z.string().optional(),
  distanceFromProperty: z.string().optional(),
  locationMatchConfidence: z.enum(["high", "medium", "low"]),
  weatherEvidenceUploaded: z.boolean().default(false),
  notes: z.string().optional(),
  claimId: z.string().optional(),
});

type StormEventForm = z.infer<typeof stormEventFormSchema>;

const EVENT_TYPE_LABELS: Record<string, string> = {
  hail: "Hail",
  wind: "Wind",
  hail_and_wind: "Hail & Wind",
  other: "Other",
};

const SOURCE_LABELS: Record<string, string> = {
  noaa: "NOAA",
  spc: "SPC",
  ncei: "NCEI",
  radar_report: "Radar Report",
  contractor_observation: "Contractor Observation",
  homeowner_statement: "Homeowner Statement",
  other: "Other",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  low: "bg-red-500/20 text-red-400 border-red-500/30",
};

function EventTypeIcon({ type }: { type: string }) {
  if (type === "hail") return <Droplets className="w-4 h-4 text-blue-400" />;
  if (type === "wind") return <Wind className="w-4 h-4 text-sky-400" />;
  if (type === "hail_and_wind") return <Cloud className="w-4 h-4 text-indigo-400" />;
  return <CloudLightning className="w-4 h-4 text-yellow-400" />;
}

export default function StormEventsPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [_editingId, _setEditingId] = useState<string | null>(null);

  const { data: events = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/storm-events"],
  });

  const form = useForm<StormEventForm>({
    resolver: zodResolver(stormEventFormSchema),
    defaultValues: {
      dateOfLoss: "",
      propertyLocation: "",
      eventType: "hail",
      reportSource: "noaa",
      hailSize: "",
      windSpeed: "",
      distanceFromProperty: "",
      locationMatchConfidence: "medium",
      weatherEvidenceUploaded: false,
      notes: "",
      claimId: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: StormEventForm) =>
      apiRequest("POST", "/api/storm-events", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/storm-events"] });
      toast({ title: "Storm event logged", description: "Event added to your documentation record." });
      setDialogOpen(false);
      form.reset();
    },
    onError: (err: any) => {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/storm-events/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/storm-events"] });
      toast({ title: "Deleted", description: "Storm event removed." });
    },
  });

  function onSubmit(data: StormEventForm) {
    const payload = {
      ...data,
      claimId: data.claimId?.trim() || undefined,
      hailSize: data.hailSize?.trim() || undefined,
      windSpeed: data.windSpeed?.trim() || undefined,
      distanceFromProperty: data.distanceFromProperty?.trim() || undefined,
      notes: data.notes?.trim() || undefined,
    };
    createMutation.mutate(payload);
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <CloudLightning className="w-6 h-6 text-blue-400" />
            <h1 className="text-2xl font-bold tracking-tight">Storm Event Lookup</h1>
            <Badge variant="outline" className="text-xs text-muted-foreground border-muted-foreground/40 ml-1">
              Roadmap MVP
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Document historical weather evidence for hail, wind, or storm activity near a claim property and date of loss.
            Manual entry now — automated NOAA / SPC / NCEI lookup planned for a future release.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-storm-event" className="gap-2">
              <Plus className="w-4 h-4" />
              Log Storm Event
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CloudLightning className="w-5 h-5 text-blue-400" />
                Log Storm Event
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="dateOfLoss">Date of Loss *</Label>
                  <Input
                    id="dateOfLoss"
                    type="date"
                    data-testid="input-date-of-loss"
                    {...form.register("dateOfLoss")}
                  />
                  {form.formState.errors.dateOfLoss && (
                    <p className="text-xs text-destructive">{form.formState.errors.dateOfLoss.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="claimId">Claim ID (optional)</Label>
                  <Input
                    id="claimId"
                    placeholder="Link to existing claim"
                    data-testid="input-claim-id"
                    {...form.register("claimId")}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="propertyLocation">Property Location *</Label>
                <Input
                  id="propertyLocation"
                  placeholder="e.g. 4521 Maple St, Dallas TX 75201"
                  data-testid="input-property-location"
                  {...form.register("propertyLocation")}
                />
                {form.formState.errors.propertyLocation && (
                  <p className="text-xs text-destructive">{form.formState.errors.propertyLocation.message}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Event Type *</Label>
                  <Select
                    defaultValue="hail"
                    onValueChange={(v) => form.setValue("eventType", v as any)}
                  >
                    <SelectTrigger data-testid="select-event-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hail">Hail</SelectItem>
                      <SelectItem value="wind">Wind</SelectItem>
                      <SelectItem value="hail_and_wind">Hail & Wind</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Report Source *</Label>
                  <Select
                    defaultValue="noaa"
                    onValueChange={(v) => form.setValue("reportSource", v as any)}
                  >
                    <SelectTrigger data-testid="select-report-source">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="noaa">NOAA</SelectItem>
                      <SelectItem value="spc">SPC (Storm Prediction Center)</SelectItem>
                      <SelectItem value="ncei">NCEI</SelectItem>
                      <SelectItem value="radar_report">Radar Report</SelectItem>
                      <SelectItem value="contractor_observation">Contractor Observation</SelectItem>
                      <SelectItem value="homeowner_statement">Homeowner Statement</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="hailSize">Hail Size</Label>
                  <Input
                    id="hailSize"
                    placeholder='e.g. 1.5"'
                    data-testid="input-hail-size"
                    {...form.register("hailSize")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="windSpeed">Wind Speed</Label>
                  <Input
                    id="windSpeed"
                    placeholder="e.g. 65 mph"
                    data-testid="input-wind-speed"
                    {...form.register("windSpeed")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="distanceFromProperty">Distance From Property</Label>
                  <Input
                    id="distanceFromProperty"
                    placeholder="e.g. 0.3 miles"
                    data-testid="input-distance"
                    {...form.register("distanceFromProperty")}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 items-start">
                <div className="space-y-1.5">
                  <Label>Location Match Confidence *</Label>
                  <Select
                    defaultValue="medium"
                    onValueChange={(v) => form.setValue("locationMatchConfidence", v as any)}
                  >
                    <SelectTrigger data-testid="select-confidence">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High — confirmed on-site</SelectItem>
                      <SelectItem value="medium">Medium — nearby record</SelectItem>
                      <SelectItem value="low">Low — general area only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Weather Evidence Uploaded</Label>
                  <div className="flex items-center gap-3 pt-2">
                    <Switch
                      data-testid="switch-evidence-uploaded"
                      checked={form.watch("weatherEvidenceUploaded")}
                      onCheckedChange={(v) => form.setValue("weatherEvidenceUploaded", v)}
                    />
                    <span className="text-sm text-muted-foreground">
                      {form.watch("weatherEvidenceUploaded") ? "Yes — supporting docs attached" : "No — not yet uploaded"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Additional context about this storm event, source credibility, or claim relevance..."
                  rows={3}
                  data-testid="textarea-notes"
                  {...form.register("notes")}
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-storm-event">
                  {createMutation.isPending ? "Saving..." : "Log Event"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Future integration callout */}
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="flex items-start gap-3 py-4">
          <Info className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-300">Future: Automated Weather Lookup</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              A planned upgrade will automatically search NOAA Storm Data, SPC Severe Reports, and NCEI hail/wind records
              by property address and date range — no manual entry required. API integration is on the product roadmap.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Events table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Storm Event Records</CardTitle>
          <CardDescription>
            {isLoading ? "Loading..." : `${events.length} event${events.length !== 1 ? "s" : ""} logged`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-12 bg-muted/30 rounded animate-pulse" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <CloudLightning className="w-10 h-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No storm events logged yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Log your first event to start building weather documentation for your claims.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date of Loss</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Evidence</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event: any) => (
                  <TableRow key={event.id} data-testid={`row-storm-event-${event.id}`}>
                    <TableCell className="font-mono text-sm">
                      {event.dateOfLoss || "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 max-w-[160px]">
                        <MapPin className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className="text-sm truncate" title={event.propertyLocation}>
                          {event.propertyLocation || "—"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <EventTypeIcon type={event.eventType} />
                        <span className="text-sm">{EVENT_TYPE_LABELS[event.eventType] || event.eventType}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {SOURCE_LABELS[event.reportSource] || event.reportSource}
                    </TableCell>
                    <TableCell>
                      <div className="text-xs text-muted-foreground space-y-0.5">
                        {event.hailSize && <div>Hail: {event.hailSize}</div>}
                        {event.windSpeed && <div>Wind: {event.windSpeed}</div>}
                        {event.distanceFromProperty && <div>Dist: {event.distanceFromProperty}</div>}
                        {!event.hailSize && !event.windSpeed && !event.distanceFromProperty && "—"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-xs capitalize ${CONFIDENCE_COLORS[event.locationMatchConfidence] || ""}`}
                        data-testid={`badge-confidence-${event.id}`}
                      >
                        {event.locationMatchConfidence}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-xs ${event.weatherEvidenceUploaded
                          ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                          : "bg-muted/40 text-muted-foreground"}`}
                        data-testid={`badge-evidence-${event.id}`}
                      >
                        {event.weatherEvidenceUploaded ? "Uploaded" : "Pending"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteMutation.mutate(event.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-storm-event-${event.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
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
