import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Shield, Check, Loader2 } from "lucide-react";
import { useState } from "react";

export default function FounderLegalPage() {
  const { data: auth, refetch } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const agreement = auth?.founderAgreement;

  async function handleSign() {
    try {
      setLoading(true);
      await apiRequest("POST", "/api/legal/founder/sign", { version: "1.0" });
      toast({ title: "Founder agreement signed", description: "You now have full unmasked data access." });
      await refetch();
    } catch (err: any) {
      toast({ title: "Failed to sign agreement", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-founder-title">Founder Agreement</h1>
        <p className="text-sm text-muted-foreground">Review and sign the founder data access agreement</p>
      </div>

      {agreement ? (
        <Card>
          <CardContent className="p-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">Agreement Signed</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              You signed the Founder Agreement on {new Date(agreement.signedAt).toLocaleDateString()}.
              You have full unmasked data access.
            </p>
            <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
              <span>Version: {agreement.version}</span>
              <span>IP: {agreement.ip}</span>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Founder Data Access Agreement</CardTitle>
              <Badge variant="outline">Version 1.0</Badge>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground leading-relaxed">
              <p>
                By signing this Founder Agreement, you acknowledge and agree to the following terms
                as a Founder-tier user of the ClaimSignal platform:
              </p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Shield className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <p><strong className="text-foreground">Data Access:</strong> You will receive full unmasked access to claim data, adjuster records, and organizational intelligence within your tenant boundary.</p>
                </div>
                <div className="flex items-start gap-3">
                  <Shield className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <p><strong className="text-foreground">Confidentiality:</strong> All data accessed through the platform is confidential and shall not be disclosed to unauthorized parties.</p>
                </div>
                <div className="flex items-start gap-3">
                  <Shield className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <p><strong className="text-foreground">Compliance:</strong> You agree to use the platform in compliance with all applicable laws and insurance regulations.</p>
                </div>
                <div className="flex items-start gap-3">
                  <Shield className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <p><strong className="text-foreground">Audit Trail:</strong> All actions taken on the platform are logged and may be audited. You consent to this monitoring.</p>
                </div>
                <div className="flex items-start gap-3">
                  <Shield className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <p><strong className="text-foreground">Founder Benefits:</strong> As a Founder, you receive permanently locked pricing, early access to new features, and advisory input on product direction.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="text-center">
            <Button onClick={handleSign} disabled={loading} data-testid="button-sign-agreement">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Sign Founder Agreement
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Signing is binding and will be recorded with your IP address and timestamp.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
