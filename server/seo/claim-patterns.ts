import { ssrShell } from "./shell";
import { CARRIERS, type CarrierProfile } from "./carriers";

export interface LossTypeProfile {
  slug: string;
  label: string;
  description: string;
}

export const LOSS_TYPES: LossTypeProfile[] = [
  { slug: "hail-damage", label: "Hail Damage", description: "Claims involving hail impact to roofing, siding, gutters, windows, and exterior components." },
  { slug: "wind-damage", label: "Wind Damage", description: "Claims involving wind-driven damage to structures, roofing, and exterior elements." },
  { slug: "water-damage", label: "Water Damage", description: "Claims involving sudden and accidental water intrusion, pipe bursts, and related structure damage." },
  { slug: "fire-damage", label: "Fire Damage", description: "Claims involving fire, smoke, and soot damage to structure and contents." },
  { slug: "tornado", label: "Tornado", description: "High-severity wind event claims involving structural damage from tornado-force winds." },
  { slug: "hurricane", label: "Hurricane", description: "Storm system claims combining wind, rain, and flooding components." },
  { slug: "wildfire", label: "Wildfire", description: "Claims involving structure loss or smoke/ash damage from wildland fire events." },
];

export function getLossTypeBySlug(slug: string): LossTypeProfile | undefined {
  return LOSS_TYPES.find((l) => l.slug === slug);
}

export function getClaimPatternsIndexHtml(): string {
  const carrierLinks = CARRIERS.map(
    (c) => `<a href="/claims/${c.slug}" class="card card-sm" style="display:block;text-decoration:none;transition:border-color .15s;" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor=''"}>
      <div style="font-weight:700;font-size:15px;margin-bottom:4px;color:var(--fg);">${c.name}</div>
      <div style="font-size:12px;color:var(--fg2);margin-bottom:8px;">${c.hqState}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">
        ${c.lossTypesCommon.slice(0, 3).map((l) => `<span class="badge badge-muted">${l}</span>`).join("")}
      </div>
    </a>`
  ).join("");

  const lossTypeLinks = LOSS_TYPES.map(
    (l) => `<div class="card card-sm">
      <div style="font-weight:700;font-size:14px;margin-bottom:6px;color:var(--fg);">${l.label}</div>
      <p style="font-size:13px;color:var(--fg2);line-height:1.5;margin-bottom:12px;">${l.description}</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${CARRIERS.slice(0, 4).map((c) => `<a href="/claims/${c.slug}/${l.slug}" style="font-size:12px;color:var(--primary);">${c.shortName}</a>`).join(" · ")}
      </div>
    </div>`
  ).join("");

  const body = `
    <div class="hero">
      <span class="badge badge-blue" style="margin-bottom:16px;">Claim Patterns</span>
      <h1>Property Insurance Claim Patterns by Carrier &amp; Loss Type</h1>
      <p>Claim handling intelligence organized by carrier and loss type — covering documentation strategies, common denial reasons, supplement approaches, and escalation patterns for the most common property loss categories.</p>
    </div>
    <div class="disclaimer">
      All information on this page is <strong>educational and informational only</strong>. It is based on publicly available information and does not constitute legal advice. Claim outcomes vary by policy, region, adjuster, and specific loss circumstances.
    </div>
    <div class="section">
      <h2 class="section-title">Browse by Carrier</h2>
      <p class="section-sub">Select a carrier to view loss-type-specific claim intelligence.</p>
      <div class="grid-2">${carrierLinks}</div>
    </div>
    <div class="section">
      <h2 class="section-title">Browse by Loss Type</h2>
      <p class="section-sub">Select a loss type to see carrier-specific handling patterns.</p>
      <div class="grid-3">${lossTypeLinks}</div>
    </div>
    <div class="cta-block">
      <h2>Apply claim pattern intelligence to your portfolio</h2>
      <p>ClaimSignal tracks carrier behavior, adjuster friction, and outcome patterns in real time across your active claims.</p>
      <a href="/login" class="btn btn-primary">Access the Platform</a>
      <a href="/carriers" class="btn btn-outline">Carrier Profiles</a>
    </div>
  `;

  return ssrShell({
    title: "Property Insurance Claim Patterns by Carrier | ClaimSignal",
    description:
      "Property insurance claim handling intelligence by carrier and loss type — hail, wind, water, fire, and more. Documentation strategies, denial patterns, and escalation approaches for major U.S. carriers.",
    canonical: "https://claimsignal.com/claims",
    breadcrumbs: [{ label: "Claim Patterns" }],
    body,
  });
}

export function getCarrierClaimsIndexHtml(carrierSlug: string): string | null {
  const carrier = CARRIERS.find((c) => c.slug === carrierSlug);
  if (!carrier) return null;

  const lossCards = carrier.lossTypesCommon.map((lossLabel) => {
    const lt = LOSS_TYPES.find(
      (l) => l.label.toLowerCase() === lossLabel.toLowerCase() ||
             l.slug === lossLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")
    );
    const lossSlug = lt?.slug ?? lossLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return `<a href="/claims/${carrier.slug}/${lossSlug}" class="card card-sm" style="display:block;text-decoration:none;transition:border-color .15s;" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor=''">
      <div style="font-weight:700;font-size:15px;margin-bottom:6px;color:var(--fg);">${carrier.shortName} — ${lossLabel}</div>
      <p style="font-size:13px;color:var(--fg2);line-height:1.5;">${lt?.description ?? "Claim handling intelligence for " + lossLabel + " claims with " + carrier.shortName + "."}</p>
    </a>`;
  }).join("");

  const body = `
    <div class="hero" style="margin-bottom:40px;">
      <span class="badge badge-blue" style="margin-bottom:14px;">Claim Patterns</span>
      <h1>${carrier.name} — Claim Patterns by Loss Type</h1>
      <p>Loss-type-specific claim intelligence for ${carrier.name} — documentation strategies, denial patterns, supplement approaches, and escalation guidance.</p>
    </div>
    <div class="disclaimer">
      Educational and informational only. Not legal advice. Individual outcomes vary by policy, region, and adjuster.
    </div>
    <div class="grid-2" style="margin-bottom:48px;">${lossCards}</div>
    <div style="margin-bottom:48px;">
      <a href="/carriers/${carrier.slug}" class="badge badge-blue" style="font-size:13px;padding:8px 16px;">View full ${carrier.shortName} carrier profile →</a>
    </div>
    <div class="cta-block">
      <h2>Track your ${carrier.shortName} claims in ClaimSignal</h2>
      <a href="/login" class="btn btn-primary">Access the Platform</a>
      <a href="/claims" class="btn btn-outline">All Claim Patterns</a>
    </div>
  `;

  return ssrShell({
    title: `${carrier.name} Claim Patterns by Loss Type | ClaimSignal`,
    description: `Claim handling intelligence for ${carrier.name} by loss type — hail, wind, water, fire, and more. Documentation strategies and escalation approaches.`,
    canonical: `https://claimsignal.com/claims/${carrier.slug}`,
    breadcrumbs: [
      { label: "Claim Patterns", href: "/claims" },
      { label: carrier.name },
    ],
    body,
  });
}

export function getCarrierLossTypeHtml(carrierSlug: string, lossSlug: string): string | null {
  const carrier = CARRIERS.find((c) => c.slug === carrierSlug);
  if (!carrier) return null;

  const lt = getLossTypeBySlug(lossSlug);
  const lossLabel = lt?.label ?? lossSlug.replace(/-/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase());

  const careerLossMatch = carrier.lossTypesCommon.find((l) => {
    const ll = l.toLowerCase();
    const ls = ll.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return ll === lossLabel.toLowerCase() ||
           ls === lossSlug ||
           lossSlug.startsWith(ls) ||
           ls.startsWith(lossSlug);
  });
  if (!careerLossMatch) return null;

  const denialSubset = carrier.commonDenialReasons
    .filter((r) => {
      const rl = r.toLowerCase();
      return rl.includes(lossSlug.replace(/-/g, " ").split(" ")[0]) ||
             rl.includes("scope") || rl.includes("pre-existing") || rl.includes("code");
    })
    .slice(0, 4);
  const denialList = (denialSubset.length > 0 ? denialSubset : carrier.commonDenialReasons.slice(0, 4))
    .map((r) => `<li>${r}</li>`)
    .join("");

  const docTips = carrier.documentationTips.slice(0, 4).map((t) => `<li>${t}</li>`).join("");

  const otherLossLinks = carrier.lossTypesCommon
    .filter((l) => l.toLowerCase() !== lossLabel.toLowerCase())
    .slice(0, 4)
    .map((l) => {
      const s = l.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      return `<a href="/claims/${carrier.slug}/${s}" class="badge badge-muted" style="font-size:13px;padding:6px 14px;">${carrier.shortName} — ${l}</a>`;
    })
    .join("");

  const relatedTermSlugs = ["friction-scoring", "scope-delta", "supplement-resistance-score", "escalation-architecture"];
  const relatedTermLinks = relatedTermSlugs
    .map((s) => `<a href="/learn/${s}" class="badge badge-blue" style="font-size:13px;padding:6px 14px;">${s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</a>`)
    .join("");

  const body = `
    <div class="hero" style="margin-bottom:40px;">
      <span class="badge badge-blue" style="margin-bottom:14px;">Claim Intelligence</span>
      <h1>${carrier.name} — ${lossLabel} Claims</h1>
      <p>${lt?.description ?? ""} This page covers claim handling patterns, documentation strategies, common denial reasons, and escalation guidance specific to ${lossLabel.toLowerCase()} claims with ${carrier.name}.</p>
    </div>

    <div class="disclaimer">
      <strong>Educational and informational only.</strong> This page is based on publicly available information and does not constitute legal advice. Individual claim outcomes vary by policy, region, adjuster, and loss circumstances. ClaimSignal intelligence module metrics for this carrier and loss type will populate as sufficient anonymized platform data accumulates.
    </div>

    <div class="grid-2" style="margin-bottom:40px;">
      <div class="card">
        <h2 class="section-title" style="margin-bottom:14px;">Common Denial Reasons</h2>
        <p style="font-size:13px;color:var(--fg2);margin-bottom:12px;">Frequently cited denial and scope limitation reasons for ${lossLabel.toLowerCase()} claims with ${carrier.shortName}.</p>
        <ul style="padding-left:18px;color:var(--fg2);font-size:14px;line-height:1.8;">${denialList}</ul>
      </div>
      <div class="card">
        <h2 class="section-title" style="margin-bottom:14px;">Documentation Strategies</h2>
        <p style="font-size:13px;color:var(--fg2);margin-bottom:12px;">Key documentation practices that improve outcomes on ${carrier.shortName} ${lossLabel.toLowerCase()} claims.</p>
        <ul style="padding-left:18px;color:var(--fg2);font-size:14px;line-height:1.8;">${docTips}</ul>
      </div>
    </div>

    <div class="card" style="margin-bottom:40px;">
      <h2 class="section-title" style="margin-bottom:14px;">Escalation Approach</h2>
      <p style="font-size:14px;color:var(--fg2);line-height:1.7;">${carrier.escalationNotes}</p>
    </div>

    <div class="section" style="margin-bottom:40px;">
      <h2 class="section-title">Intelligence Modules</h2>
      <p class="section-sub">Platform-derived metrics for ${carrier.shortName} ${lossLabel.toLowerCase()} claims — populates with anonymized ClaimSignal data.</p>
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div class="intel-module"><div class="intel-module-icon"></div><div><div class="intel-module-label">Friction Score — ${carrier.shortName} ${lossLabel}</div><div class="intel-module-note">Average friction score across ${carrier.shortName} ${lossLabel.toLowerCase()} claims processed through ClaimSignal. Pending data accumulation.</div></div></div>
        <div class="intel-module"><div class="intel-module-icon"></div><div><div class="intel-module-label">Supplement Approval Rate — ${carrier.shortName} ${lossLabel}</div><div class="intel-module-note">Percentage of supplement requests receiving full or partial approval on ${carrier.shortName} ${lossLabel.toLowerCase()} claims. Pending data accumulation.</div></div></div>
        <div class="intel-module"><div class="intel-module-icon"></div><div><div class="intel-module-label">Denial Overturn Rate — ${carrier.shortName} ${lossLabel}</div><div class="intel-module-note">Percentage of denied ${carrier.shortName} ${lossLabel.toLowerCase()} claims overturned through escalation or reinspection. Pending data accumulation.</div></div></div>
      </div>
    </div>

    <div class="section" style="margin-bottom:40px;">
      <h2 class="section-title">Other ${carrier.shortName} Claim Types</h2>
      <div style="display:flex;flex-wrap:wrap;gap:10px;">${otherLossLinks}</div>
    </div>

    <div class="section" style="margin-bottom:40px;">
      <h2 class="section-title">Related Intelligence Concepts</h2>
      <div style="display:flex;flex-wrap:wrap;gap:10px;">${relatedTermLinks}</div>
    </div>

    <div class="cta-block">
      <h2>Track your ${carrier.shortName} ${lossLabel.toLowerCase()} claims</h2>
      <p>ClaimSignal monitors friction scores, supplement outcomes, and escalation intelligence across your active portfolio — updated in real time.</p>
      <a href="/login" class="btn btn-primary">Access the Platform</a>
      <a href="/carriers/${carrier.slug}" class="btn btn-outline">${carrier.shortName} Carrier Profile</a>
    </div>
  `;

  return ssrShell({
    title: `${carrier.name} ${lossLabel} Claims — Handling Patterns & Strategy | ClaimSignal`,
    description: `Claim handling patterns, documentation strategies, common denial reasons, and escalation guidance for ${lossLabel.toLowerCase()} claims with ${carrier.name}.`,
    canonical: `https://claimsignal.com/claims/${carrier.slug}/${lossSlug}`,
    breadcrumbs: [
      { label: "Claim Patterns", href: "/claims" },
      { label: carrier.name, href: `/claims/${carrier.slug}` },
      { label: lossLabel },
    ],
    schemaJson: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: `${carrier.name} ${lossLabel} Claims`,
      description: `Claim handling intelligence for ${lossLabel.toLowerCase()} claims with ${carrier.name}`,
      url: `https://claimsignal.com/claims/${carrier.slug}/${lossSlug}`,
      dateModified: new Date().toISOString().split("T")[0],
    },
    body,
  });
}
