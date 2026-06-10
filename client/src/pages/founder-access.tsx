import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Loader2, Check, Lock, Crown, Sparkles } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import logoImg from "@assets/claimsignal_logo_transparent.png";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";

const redeemSchema = z.object({
  fullName: z.string().min(2, "Full name required"),
  email: z.string().email("Valid email required"),
  companyName: z.string().min(2, "Organization name required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  agreeToTerms: z.boolean().refine((v) => v === true, "You must agree to the terms and conditions"),
});

const loginSchema = z.object({
  email: z.string().email("Valid email required"),
  password: z.string().min(1, "Password required"),
});

export default function FounderAccessPage() {
  const { toast } = useToast();
  const { login } = useAuth();
  const [loginLoading, setLoginLoading] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemed, setRedeemed] = useState(false);
  const [mode, setMode] = useState<"info" | "login" | "setup">("info");
  const [setupToken, setSetupToken] = useState<string | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  const redeemForm = useForm<z.infer<typeof redeemSchema>>({
    resolver: zodResolver(redeemSchema),
    defaultValues: { fullName: "", email: "", companyName: "", password: "", agreeToTerms: false },
  });

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  // Check for setup token in URL on mount
  useEffect(() => {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("token");
    if (token) {
      setSetupToken(token);
      setSetupLoading(true);
      fetch(`/api/founder-access/setup?token=${encodeURIComponent(token)}`)
        .then(async (res) => {
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.message || "Invalid setup link");
          }
          return res.json();
        })
        .then((json) => {
          const inv = json.invitation;
          redeemForm.reset({
            fullName: inv.fullName || "",
            email: inv.email || "",
            companyName: inv.companyName || "",
            password: "",
            agreeToTerms: false,
          });
          setMode("setup");
        })
        .catch((err) => {
          setSetupError(err instanceof Error ? err.message : "Invalid setup link");
        })
        .finally(() => setSetupLoading(false));
    }
  }, []);

  async function onRedeem(data: z.infer<typeof redeemSchema>) {
    try {
      setRedeeming(true);
      const res = await apiRequest("POST", "/api/founder-access/redeem", {
        token: setupToken,
        email: data.email,
        password: data.password,
        fullName: data.fullName,
        companyName: data.companyName,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Account creation failed");
      }
      const json = await res.json();
      setRedeemed(true);
      toast({ title: "Welcome, Founder", description: "Your account is ready. Redirecting to dashboard..." });
      window.location.href = json.redirect || "/founder";
    } catch (err) {
      toast({
        title: "Setup failed",
        description: err instanceof Error ? err.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setRedeeming(false);
    }
  }

  async function onLogin(data: z.infer<typeof loginSchema>) {
    try {
      setLoginLoading(true);
      await login(data.email, data.password);
      toast({ title: "Welcome back", description: "Redirecting to Founder dashboard..." });
    } catch (err) {
      toast({
        title: "Login failed",
        description: err instanceof Error ? err.message : "Invalid credentials",
        variant: "destructive",
      });
    } finally {
      setLoginLoading(false);
    }
  }

  // If a token is in the URL but loading or errored
  if (setupToken && setupLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Verifying your setup link...</p>
        </div>
      </div>
    );
  }

  if (setupToken && setupError) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
              <Lock className="w-8 h-8 text-destructive" />
            </div>
            <h2 className="text-xl font-bold">Link Invalid</h2>
            <p className="text-muted-foreground">{setupError}</p>
            <Button variant="outline" onClick={() => { setSetupError(null); setMode("info"); }}>
              Back to Founder Access
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-primary/3 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-amber-500/3 rounded-full blur-3xl" />
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
            <Crown className="w-5 h-5 text-amber-500" />
            <h1 className="text-2xl font-bold tracking-tight">Founder Access</h1>
          </div>
          <p className="text-sm text-muted-foreground">Invitation Only · $79/month locked pricing</p>
        </div>

        {mode === "info" && (
          <Card>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-amber-500">
                  <Sparkles className="w-4 h-4" />
                  <span className="font-semibold text-sm">Founding Partner Program</span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  The Founder tier is a limited, invitation-only program for early adopters
                  who want to shape the future of ClaimSignal. Lock in $79/month for life
                  while the subscription remains active.
                </p>
                <ul className="text-sm space-y-1 text-muted-foreground">
                  <li className="flex items-center gap-2">
                    <Lock className="w-3 h-3 text-amber-500" /> $79/month locked forever
                  </li>
                  <li className="flex items-center gap-2">
                    <Lock className="w-3 h-3 text-amber-500" /> 14-day trial included
                  </li>
                  <li className="flex items-center gap-2">
                    <Lock className="w-3 h-3 text-amber-500" /> Full platform access
                  </li>
                  <li className="flex items-center gap-2">
                    <Lock className="w-3 h-3 text-amber-500" /> Founder-only features
                  </li>
                </ul>
              </div>
              <div className="space-y-3">
                <Button variant="outline" className="w-full" onClick={() => setMode("login")} data-testid="button-founder-login">
                  Founder Login
                </Button>
              </div>
              <p className="text-xs text-center text-muted-foreground">
                Don&apos;t have an invitation? Founder access is invitation-only.
              </p>
            </CardContent>
          </Card>
        )}

        {mode === "login" && (
          <Card>
            <CardContent className="p-6 space-y-4">
              <h2 className="text-lg font-semibold">Founder Login</h2>
              <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <Input id="login-email" type="email" placeholder="you@company.com" data-testid="input-founder-email" {...loginForm.register("email")} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <Input id="login-password" type="password" placeholder="Enter password" data-testid="input-founder-password" {...loginForm.register("password")} />
                </div>
                <Button type="submit" className="w-full" disabled={loginLoading} data-testid="button-founder-submit">
                  {loginLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Log In
                </Button>
              </form>
              <Button variant="ghost" className="w-full text-sm" onClick={() => setMode("info")}>
                Back to Founder Access
              </Button>
            </CardContent>
          </Card>
        )}

        {mode === "setup" && !redeemed && (
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-2 text-amber-500">
                <Sparkles className="w-4 h-4" />
                <h2 className="text-lg font-semibold">Set Up Your Founder Account</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Your Founding Partner application has been approved. Review your details below and create a password to activate your account.
              </p>
              <form onSubmit={redeemForm.handleSubmit(onRedeem)} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="redeem-name">Full Name</Label>
                  <Input id="redeem-name" data-testid="input-redeem-name" {...redeemForm.register("fullName")} />
                  {redeemForm.formState.errors.fullName && <p className="text-xs text-destructive">{redeemForm.formState.errors.fullName.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="redeem-email">Email</Label>
                  <Input id="redeem-email" type="email" data-testid="input-redeem-email" {...redeemForm.register("email")} />
                  {redeemForm.formState.errors.email && <p className="text-xs text-destructive">{redeemForm.formState.errors.email.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="redeem-company">Organization Name</Label>
                  <Input id="redeem-company" data-testid="input-redeem-company" {...redeemForm.register("companyName")} />
                  {redeemForm.formState.errors.companyName && <p className="text-xs text-destructive">{redeemForm.formState.errors.companyName.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="redeem-password">Create Password</Label>
                  <Input id="redeem-password" type="password" placeholder="Min 8 characters" data-testid="input-redeem-password" {...redeemForm.register("password")} />
                  {redeemForm.formState.errors.password && <p className="text-xs text-destructive">{redeemForm.formState.errors.password.message}</p>}
                </div>
                <div className="flex items-start gap-2 pt-2">
                  <Checkbox
                    id="redeem-terms"
                    data-testid="checkbox-redeem-terms"
                    checked={redeemForm.watch("agreeToTerms")}
                    onCheckedChange={(checked) => redeemForm.setValue("agreeToTerms", checked === true, { shouldValidate: true })}
                  />
                  <label htmlFor="redeem-terms" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
                    I acknowledge that ClaimSignal is a data analysis platform and does not create any employment
                    restriction or non-compete obligation. I agree to the{" "}
                    <Link href="/terms" target="_blank" className="text-primary hover:underline">
                      Terms of Service
                    </Link>
                    ,{" "}
                    <Link href="/privacy" target="_blank" className="text-primary hover:underline">
                      Privacy Policy
                    </Link>
                    , and the{" "}
                    <Link href="/legal/founder" target="_blank" className="text-primary hover:underline">
                      Founding Partner Agreement
                    </Link>
                    .
                  </label>
                </div>
                {redeemForm.formState.errors.agreeToTerms && <p className="text-xs text-destructive">{redeemForm.formState.errors.agreeToTerms.message}</p>}
                <Button type="submit" className="w-full" disabled={redeeming} data-testid="button-redeem-submit">
                  {redeeming && <Loader2 className="w-4 h-4 animate-spin" />}
                  Activate Account
                </Button>
              </form>
            </CardContent>
          </Card>
        )}

        {mode === "setup" && redeemed && (
          <Card>
            <CardContent className="p-6 text-center space-y-6">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Check className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-bold">Welcome, Founder</h2>
              <p className="text-muted-foreground">
                Your Founder account is ready. You will be redirected to your dashboard.
              </p>
              <Button variant="outline" onClick={() => window.location.href = "/founder"}>
                Go to Dashboard
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
