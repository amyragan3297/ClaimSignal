import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocation } from "wouter";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/lib/auth";
import { ArrowLeft, Loader2 } from "lucide-react";
import logoImg from "@assets/claimsignal_logo_transparent.png";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { loginSchema } from "@shared/schema";

export default function LoginPage() {
  const { login } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const loginForm = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const [loginLoading, setLoginLoading] = useState(false);

  async function onLogin(data: z.infer<typeof loginSchema>) {
    try {
      setLoginLoading(true);
      await login(data.email, data.password);
      setLocation("/dashboard");
    } catch (err) {
      toast({ title: "Login failed", description: err instanceof Error ? err.message : "An error occurred", variant: "destructive" });
    } finally {
      setLoginLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-primary/3 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/3 w-80 h-80 bg-accent/3 rounded-full blur-3xl" />
      </div>
      <div className="w-full max-w-sm relative">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground mb-6 hover-elevate px-2 py-1 rounded-md">
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>
          <div className="flex items-center justify-center mb-2">
            <img src={logoImg} alt="ClaimSignal" className="h-24 w-auto object-contain" data-testid="img-login-logo" />
          </div>
          <p className="text-sm text-muted-foreground mb-4">Operational Intelligence Platform</p>
          <div className="flex items-center justify-center gap-3 text-xs flex-wrap">
            <Link href="/founding-partner-apply" className="text-amber-500 hover:underline" data-testid="link-hero-founder">
              Founder Access
            </Link>
            <span className="text-muted-foreground">|</span>
            <Link href="/investor-access" className="text-emerald-500 hover:underline" data-testid="link-hero-investor">
              Investor Access
            </Link>
            <span className="text-muted-foreground">|</span>
            <Link href="/platform-overview" className="text-muted-foreground hover:text-foreground hover:underline transition-colors" data-testid="link-hero-platform">
              View Platform
            </Link>
          </div>
        </div>

        <Card>
          <CardContent className="p-6">
            <h2 className="text-base font-semibold mb-5 text-center">Log In</h2>

            <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="you@company.com"
                  data-testid="input-login-email"
                  {...loginForm.register("email")}
                />
                {loginForm.formState.errors.email && (
                  <p className="text-xs text-destructive">{loginForm.formState.errors.email.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">Password</Label>
                <Input
                  id="login-password"
                  type="password"
                  placeholder="Enter password"
                  data-testid="input-login-password"
                  {...loginForm.register("password")}
                />
                {loginForm.formState.errors.password && (
                  <p className="text-xs text-destructive">{loginForm.formState.errors.password.message}</p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={loginLoading} data-testid="button-login-submit">
                {loginLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                Log In
              </Button>
            </form>

            <div className="mt-6 pt-4 border-t border-border">
              <p className="text-xs text-center text-muted-foreground mb-3">
                Access programs
              </p>
              <div className="flex items-center justify-center gap-4 text-xs">
                <Link href="/founding-partner-apply" className="text-amber-500 hover:underline" data-testid="link-founder-access">
                  Request Founder Access
                </Link>
                <span className="text-muted-foreground">|</span>
                <Link href="/investor-access" className="text-emerald-500 hover:underline" data-testid="link-investor-access">
                  Investor Access
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-[11px] text-muted-foreground/60 leading-relaxed px-2">
          By registering, you acknowledge that ClaimSignal is a data analysis platform and does not
          create any employment restriction or non-compete obligation. See our{" "}
          <Link href="/terms" target="_blank" className="underline hover:text-muted-foreground">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" target="_blank" className="underline hover:text-muted-foreground">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
