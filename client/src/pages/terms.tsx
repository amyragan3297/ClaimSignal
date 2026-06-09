import { useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function TermsPage() {
  useEffect(() => {
    document.title = "Terms of Service | ClaimSignal";
  }, []);
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-2xl py-12">
        <Link href="/">
          <Button variant="ghost" className="mb-6 text-sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to home
          </Button>
        </Link>
        <h1 className="text-3xl font-bold tracking-tight mb-4">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: June 9, 2026</p>

        <div className="space-y-6 text-sm text-muted-foreground leading-relaxed">
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">1. Acceptance of Terms</h2>
            <p>
              By accessing or using the ClaimSignal platform, you agree to be bound by these Terms of Service.
              If you do not agree, you may not use the platform.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">2. Description of Service</h2>
            <p>
              ClaimSignal provides operational intelligence and analytics tools for property insurance claims.
              Features include claim tracking, adjuster intelligence, evidence management, and AI-powered document analysis.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">3. User Accounts</h2>
            <p>
              You are responsible for maintaining the confidentiality of your account credentials.
              You agree to provide accurate information and to notify us immediately of any unauthorized use of your account.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">4. Subscription and Billing</h2>
            <p>
              Subscription fees are billed in advance. You may cancel your subscription at any time; cancellation takes effect at the end of the current billing period.
              Founding Partner rates are locked for the lifetime of an active subscription but are forfeited permanently upon cancellation.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">5. Data Privacy and PII</h2>
            <p>
              ClaimSignal handles sensitive personally identifiable information (PII). Access to unmasked PII is restricted to authorized users in accordance with your role and the Founding Partner Agreement.
              All access to unmasked data is logged and audited.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">6. Acceptable Use</h2>
            <p>
              You may not use ClaimSignal for any unlawful purpose, to harass or discriminate, or to process data you do not have a legal right to access.
              We reserve the right to suspend or terminate accounts that violate this policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">7. Intellectual Property</h2>
            <p>
              ClaimSignal owns all rights to the platform, brand, and software. Co-branded use of ClaimSignal assets is permitted only with written approval.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">8. Limitation of Liability</h2>
            <p>
              ClaimSignal is provided &quot;as is&quot; without warranties of any kind. We are not liable for any claim outcomes, coverage decisions, or financial losses resulting from your use of the platform.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">9. Governing Law</h2>
            <p>
              These terms are governed by the laws of the State of Texas, United States, without regard to conflict of law principles.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-2">10. Contact</h2>
            <p>
              For questions about these terms, contact us at{" "}
              <a href="mailto:claimsignal1@gmail.com" className="text-primary hover:underline">
                claimsignal1@gmail.com
              </a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
