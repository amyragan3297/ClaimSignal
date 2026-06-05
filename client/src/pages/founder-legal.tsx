import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Shield, Check, Loader2, Image } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { PLANS } from "@/lib/pricing";

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
    } catch (err) {
      toast({ title: "Failed to sign agreement", description: err instanceof Error ? err.message : "An error occurred", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-founder-title">Founding Partner Agreement</h1>
        <p className="text-sm text-muted-foreground">Review and sign the Founding Partner data access and co-branding agreement</p>
      </div>

      {agreement ? (
        <Card>
          <CardContent className="p-6 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <Check className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold">Agreement Signed</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              You signed the Founding Partner Agreement on {agreement.signedAt ? new Date(agreement.signedAt).toLocaleDateString() : "N/A"}.
              You have full unmasked data access.
            </p>
            <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
              <span>Version: {agreement.version}</span>
              <span>IP: {agreement.ip}</span>
            </div>
            <div className="pt-2">
              <Link href="/brand-assets">
                <Button variant="outline" size="sm" data-testid="link-founder-brand-assets">
                  <Image className="w-4 h-4 mr-2" />
                  Download Brand Assets
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Founding Partner Agreement</CardTitle>
              <Badge variant="outline">Version 1.0</Badge>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground leading-relaxed">
              <p>
                By signing this Founding Partner Agreement, you acknowledge and agree to the following terms
                as a Founding Partner of the ClaimSignal™ platform:
              </p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Shield className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <p><strong className="text-foreground">Founding Partner Pricing:</strong> Your subscription rate of {PLANS.founder.priceLabel} is permanently locked for the lifetime of your active subscription — locked for life while your subscription remains active and in good standing. This rate will never increase as long as your subscription remains active.</p>
                </div>
                <div className="flex items-start gap-3">
                  <Shield className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <p><strong className="text-foreground">Cancellation Policy:</strong> If you cancel your Founding Partner subscription for any reason, the {PLANS.founder.priceLabel} founding rate is forfeited permanently upon cancellation. Resubscription will be at the then-current public pricing. This pricing cannot be reinstated once lost.</p>
                </div>
                <div className="flex items-start gap-3">
                  <Shield className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <p><strong className="text-foreground">Data Access:</strong> You will receive full unmasked access to claim data, adjuster records, and organizational intelligence within your tenant boundary.</p>
                </div>
                <div className="flex items-start gap-3">
                  <Shield className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <p><strong className="text-foreground">Roadmap Collaboration:</strong> As a Founding Partner, you are eligible for product roadmap collaboration, including advisory input on feature direction, early access to new capabilities, and priority consideration for feature requests.</p>
                </div>
                <div className="flex items-start gap-3">
                  <Shield className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <p><strong className="text-foreground">Co-Branding &amp; Logo Usage:</strong> Both parties grant written permission for mutual logo use in co-branded materials, case studies, and marketing collateral. Either party may revoke this permission with 30 days written notice. Brand assets are available for download at <Link href="/brand-assets" className="text-primary hover:underline">Brand Assets</Link>.</p>
                </div>
                <div className="flex items-start gap-3">
                  <Shield className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <p><strong className="text-foreground">Confidentiality:</strong> All data accessed through the platform is confidential and shall not be disclosed to unauthorized parties. Both parties agree to maintain confidentiality of shared business information.</p>
                </div>
                <div className="flex items-start gap-3">
                  <Shield className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <p><strong className="text-foreground">Compliance &amp; Audit:</strong> You agree to use the platform in compliance with all applicable laws and insurance regulations. All actions taken on the platform are logged and may be audited.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="text-center space-y-3">
            <Button onClick={handleSign} disabled={loading} data-testid="button-sign-agreement">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Sign Founding Partner Agreement
            </Button>
            <p className="text-xs text-muted-foreground">
              Signing is binding and will be recorded with your IP address and timestamp.
            </p>
            <div className="pt-1">
              <Link href="/brand-assets">
                <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" data-testid="link-founder-brand-assets-pre">
                  <Image className="w-3 h-3 mr-1" />
                  Download Brand Assets
                </Button>
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
