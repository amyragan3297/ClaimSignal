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
import { ArrowLeft, Loader2, Check, BarChart3, Eye, Lock } from "lucide-react";
import logoImg from "@assets/claimsignal_logo_transparent.png";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";

const requestSchema = z.object({
  fullName: z.string().min(2, "Full name required"),
  email: z.string().email("Valid email required"),
  companyName: z.string().min(2, "Company name required"),
  phone: z.string().optional(),
  investmentInterest: z.string().optional(),
  reasonForAccess: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(1, "Password required"),
});

export default function InvestorAccessPage() {
  const { toast } = useToast();
  const { login } = useAuth();
  const [loading, setLoading] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [mode, setMode] = useState<"info" | "login" | "request">("info");

  const requestForm = useForm<z.infer<typeof requestSchema>>({
    resolver: zodResolver(requestSchema),
    defaultValues: { fullName: "", email: "", companyName: "", phone: "", investmentInterest: "", reasonForAccess: "" },
  });

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onRequestSubmit(data: z.infer<typeof requestSchema>) {
    try {
      setLoading(true);
      const res = await apiRequest("POST", "/api/investor-access/request", data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Request failed");
      }
      setSubmitted(true);
      toast({ title: "Request submitted", description: "Your investor access request is pending review." });
    } catch (err) {
      toast({ title: "Submission failed", description: err instanceof Error ? err.message : "An error occurred", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function onLogin(data: z.infer<typeof loginSchema>) {
    try {
      setLoginLoading(true);
      await login(data.email, data.password);
      toast({ title: "Welcome back", description: "Redirecting to Investor dashboard..." });
    } catch (err) {
      toast({ title: "Login failed", description: err instanceof Error ? err.message : "Invalid credentials", variant: "destructive" });
    } finally {
      setLoginLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 right-1/3 w-96 h-96 bg-emerald-500/3 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 left-1/4 w-80 h-80 bg-primary/3 rounded-full blur-3xl" />
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
          <div className="flex items-center justify-center gap-2 mb-1">
            <BarChart3 className="w-5 h-5 text-emerald-500" />
            <h1 className="text-2xl font-bold tracking-tight">Investor Access</h1>
          </div>
          <p className="text-sm text-muted-foreground">Read-Only · Aggregate Intelligence · Approval Required</p>
        </div>

        {mode === "info" && (
          <Card>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-emerald-500">
                  <Eye className="w-4 h-4" />
                  <span className="font-semibold text-sm">Investor Portal</span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  The Investor Portal provides read-only access to aggregate platform metrics,
                  growth trends, and operational intelligence. No homeowner PII, claim documents,
                  or private notes are ever exposed.
                </p>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Eye className="w-3 h-3 text-emerald-500" /> Aggregate KPIs and trends
                  </li>
                  <li className="flex items-center gap-2">
                    <Eye className="w-3 h-3 text-emerald-500" /> Platform growth metrics
                  </li>
                  <li className="flex items-center gap-2">
                    <Eye className="w-3 h-3 text-emerald-500" /> No PII, no claim details
                  </li>
                  <li className="flex items-center gap-2">
                    <Lock className="w-3 h-3 text-emerald-500" /> Master Admin approval required
                  </li>
                </ul>
              </div>
              <div className="space-y-3">
                <Button className="w-full" onClick={() => setMode("login")} data-testid="button-investor-login">
                  Investor Login
                </Button>
                <Button variant="outline" className="w-full" onClick={() => setMode("request")} data-testid="button-investor-request">
                  Request Investor Access
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {mode === "login" && (
          <Card>
            <CardContent className="p-6 space-y-4">
              <h2 className="text-lg font-semibold">Investor Login</h2>
              <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="inv-email">Email</Label>
                  <Input id="inv-email" type="email" placeholder="you@company.com" data-testid="input-investor-email" {...loginForm.register("email")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inv-password">Password</Label>
                  <Input id="inv-password" type="password" placeholder="Enter password" data-testid="input-investor-password" {...loginForm.register("password")} />
                </div>
                <Button type="submit" className="w-full" disabled={loginLoading} data-testid="button-investor-submit">
                  {loginLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Log In
                </Button>
              </form>
              <Button variant="ghost" className="w-full text-sm" onClick={() => setMode("info")}>
                Back to Investor Access
              </Button>
            </CardContent>
          </Card>
        )}

        {mode === "request" && !submitted && (
          <Card>
            <CardContent className="p-6 space-y-4">
              <h2 className="text-lg font-semibold">Request Investor Access</h2>
              <p className="text-sm text-muted-foreground">
                Submit your details. Master Admin approval is required before access is granted.
              </p>
              <form onSubmit={requestForm.handleSubmit(onRequestSubmit)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="inv-req-name">Full Name</Label>
                  <Input id="inv-req-name" placeholder="John Smith" {...requestForm.register("fullName")} />
                  {requestForm.formState.errors.fullName && <p className="text-xs text-destructive">{requestForm.formState.errors.fullName.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inv-req-email">Email</Label>
                  <Input id="inv-req-email" type="email" placeholder="you@company.com" {...requestForm.register("email")} />
                  {requestForm.formState.errors.email && <p className="text-xs text-destructive">{requestForm.formState.errors.email.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inv-req-company">Company / Firm Name</Label>
                  <Input id="inv-req-company" placeholder="Acme Capital" {...requestForm.register("companyName")} />
                  {requestForm.formState.errors.companyName && <p className="text-xs text-destructive">{requestForm.formState.errors.companyName.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inv-req-phone">Phone (optional)</Label>
                  <Input id="inv-req-phone" placeholder="(555) 123-4567" {...requestForm.register("phone")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inv-req-interest">Investment Interest (optional)</Label>
                  <Input id="inv-req-interest" placeholder="e.g., Seed, Series A, Strategic" {...requestForm.register("investmentInterest")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inv-req-reason">Reason for Access (optional)</Label>
                  <Textarea id="inv-req-reason" placeholder="Describe your interest in ClaimSignal..." {...requestForm.register("reasonForAccess")} />
                </div>
                <Button type="submit" className="w-full" disabled={loading} data-testid="button-investor-request-submit">
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Submit Request
                </Button>
              </form>
              <Button variant="ghost" className="w-full text-sm" onClick={() => setMode("info")}>
                Back to Investor Access
              </Button>
            </CardContent>
          </Card>
        )}

        {mode === "request" && submitted && (
          <Card>
            <CardContent className="p-6 text-center space-y-6">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Check className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-bold">Request Received</h2>
              <p className="text-muted-foreground">
                Your investor access request is pending Master Admin approval. You will be notified via email once reviewed.
              </p>
              <Button variant="outline" onClick={() => setMode("info")}>
                Back to Investor Access
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
