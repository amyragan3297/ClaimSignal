import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Loader2, Check } from "lucide-react";
import logoImg from "@assets/claimsignal_logo_transparent.png";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const applySchema = z.object({
  fullName: z.string().min(2, "Full name required"),
  email: z.string().email("Valid email required"),
  companyName: z.string().min(2, "Company name required"),
  phone: z.string().optional(),
  estimatedMonthlyClaimVolume: z.string().optional(),
  reasonForJoining: z.string().optional(),
});

export default function FoundingPartnerApplyPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const form = useForm<z.infer<typeof applySchema>>({
    resolver: zodResolver(applySchema),
    defaultValues: {
      fullName: "",
      email: "",
      companyName: "",
      phone: "",
      estimatedMonthlyClaimVolume: "",
      reasonForJoining: "",
    },
  });

  async function onSubmit(data: z.infer<typeof applySchema>) {
    try {
      setLoading(true);
      const res = await apiRequest("POST", "/api/founding-partner/request", data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Request failed");
      }
      setSubmitted(true);
      toast({ title: "Application submitted", description: "We'll review your application and contact you soon." });
    } catch (err) {
      toast({ title: "Submission failed", description: err instanceof Error ? err.message : "An error occurred", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center space-y-6">
          <div className="flex items-center justify-center mb-2">
            <img src={logoImg} alt="ClaimSignal" className="h-16 w-auto object-contain" />
          </div>
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Check className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Application Received</h1>
          <p className="text-muted-foreground">
            Thank you for applying for the Founding Partner tier. Our team will review your application and contact you within 1-2 business days.
          </p>
          <Link href="/">
            <Button variant="outline">Back to Home</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-primary/3 rounded-full blur-3xl" />
      </div>
      <div className="w-full max-w-md relative">
        <div className="mb-6 text-center">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground mb-4 hover-elevate px-2 py-1 rounded-md">
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>
          <div className="flex items-center justify-center mb-2">
            <img src={logoImg} alt="ClaimSignal" className="h-20 w-auto object-contain" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Founding Partner Application</h1>
          <p className="text-sm text-muted-foreground">$79/mo · Limited availability</p>
        </div>

        <Card>
          <CardContent className="p-6">
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input id="fullName" placeholder="John Smith" {...form.register("fullName")} />
                {form.formState.errors.fullName && (
                  <p className="text-xs text-destructive">{form.formState.errors.fullName.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@company.com" {...form.register("email")} />
                {form.formState.errors.email && (
                  <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="companyName">Company Name</Label>
                <Input id="companyName" placeholder="Acme Restoration" {...form.register("companyName")} />
                {form.formState.errors.companyName && (
                  <p className="text-xs text-destructive">{form.formState.errors.companyName.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone (optional)</Label>
                <Input id="phone" placeholder="(555) 123-4567" {...form.register("phone")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="estimatedMonthlyClaimVolume">Estimated Monthly Claims (optional)</Label>
                <Input id="estimatedMonthlyClaimVolume" placeholder="e.g., 10-20" {...form.register("estimatedMonthlyClaimVolume")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reasonForJoining">Why are you interested? (optional)</Label>
                <Textarea id="reasonForJoining" placeholder="Tell us about your claim workflow and what you hope to achieve..." {...form.register("reasonForJoining")} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Submit Application
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Application review typically takes 1-2 business days.
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
