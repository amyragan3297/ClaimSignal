import { useEffect } from "react";
import { Link } from "wouter";
import logoImg from "@assets/claimsignal_logo_transparent.png";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export default function Homepage() {
  useEffect(() => {
    document.title = "ClaimSignal — Property Insurance Claims Intelligence Platform";
  }, []);
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/90 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
          <Link href="/">
            <div className="flex items-center" data-testid="img-logo">
              <img src={logoImg} alt="ClaimSignal" className="h-12 w-auto object-contain" />
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm" data-testid="link-login">Log In</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex items-center justify-center relative pt-24 pb-24 px-6">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/3 w-[520px] h-[520px] bg-blue-500/5 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-blue-400/4 rounded-full blur-3xl" />
        </div>
        <div className="max-w-3xl mx-auto text-center relative">
          <h1
            className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-6 leading-tight"
            data-testid="text-hero-title"
          >
            Upload a Claim. Get Answers.
          </h1>
          <p
            className="text-base md:text-lg text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed"
            data-testid="text-hero-subtext"
          >
            ClaimSignal automatically extracts claim data, identifies risks, tracks adjuster and carrier patterns, analyzes claim activity, and recommends next actions from every document you upload.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link href="/founding-partner-apply">
              <Button size="lg" className="px-8" data-testid="button-hero-cta">
                Request Founder Access
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
            <Link href="/platform-overview">
              <Button variant="outline" size="lg" className="px-8" data-testid="button-hero-secondary">
                View Platform
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Minimal footer */}
      <footer className="border-t border-border/40 py-5 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>© {new Date().getFullYear()} ClaimSignal™. All rights reserved.</span>
          <a href="mailto:claimsignal1@gmail.com" className="hover:text-foreground transition-colors">claimsignal1@gmail.com</a>
        </div>
      </footer>
    </div>
  );
}
