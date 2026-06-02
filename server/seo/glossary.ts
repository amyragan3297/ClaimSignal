import { ssrShell } from "./shell";

export interface GlossaryTerm {
  slug: string;
  term: string;
  shortDef: string;
  body: string;
  relatedTerms: string[];
  relatedCarriers?: string[];
  category: "scoring" | "lifecycle" | "claims-process" | "adjuster" | "document" | "platform";
}

export const TERMS: GlossaryTerm[] = [
  {
    slug: "friction-scoring",
    term: "Friction Scoring",
    shortDef: "A behavioral metric that quantifies how much resistance a carrier or adjuster is applying to a property insurance claim.",
    category: "scoring",
    relatedTerms: ["supplement-resistance-score", "escalation-architecture", "adjuster-friction-score"],
    relatedCarriers: ["state-farm", "allstate", "farmers-insurance"],
    body: `
      <p>Friction scoring measures the cumulative resistance introduced into a property insurance claim by carrier or adjuster behavior. Unlike a simple approval/denial flag, a friction score is a continuous metric that captures the <em>degree</em> of resistance — from minor documentation requests to systematic supplement suppression.</p>
      <h2>How friction scoring works</h2>
      <p>A claim's friction score aggregates behavioral signals across the claim lifecycle: denial patterns, supplement reduction ratios, communication delays, inspection outcome gaps, and escalation triggers. Higher scores indicate more adversarial claim handling. Lower scores indicate cooperative or straightforward resolution.</p>
      <h2>Why friction scoring matters</h2>
      <p>Claims with rising friction scores early in their lifecycle are statistically more likely to require escalation, reinspection, or legal intervention to resolve. Monitoring friction in real time allows contractors and adjusters to intervene before a claim reaches an irreversible outcome.</p>
      <h2>Components of a friction score</h2>
      <ul>
        <li><strong>Denial ratio:</strong> How frequently this adjuster or carrier has denied claims relative to their portfolio.</li>
        <li><strong>Supplement reduction ratio:</strong> The proportion of supplements that were reduced or rejected.</li>
        <li><strong>Communication signal:</strong> Delays, tone indicators, and escalation triggers in written communications.</li>
        <li><strong>Scope delta contribution:</strong> How much of the approved scope differs from the filed scope.</li>
        <li><strong>Lifecycle velocity deviation:</strong> Whether claim milestones are moving slower than the baseline pattern.</li>
      </ul>
      <h2>Friction score ranges</h2>
      <table>
        <thead><tr><th>Score range</th><th>Interpretation</th><th>Recommended response</th></tr></thead>
        <tbody>
          <tr><td>0–3</td><td>Low friction — cooperative handling</td><td>Standard documentation, monitor</td></tr>
          <tr><td>4–6</td><td>Moderate friction — early resistance signals</td><td>Strengthen documentation, prepare supplement</td></tr>
          <tr><td>7–9</td><td>High friction — active resistance pattern</td><td>Escalation plan, reinspection request</td></tr>
          <tr><td>10</td><td>Maximum friction — systematic obstruction</td><td>Formal escalation, legal review</td></tr>
        </tbody>
      </table>
    `,
  },
  {
    slug: "supplement-resistance-score",
    term: "Supplement Resistance Score",
    shortDef: "A metric tracking how aggressively a carrier or adjuster reduces, delays, or denies supplemental claim amounts.",
    category: "scoring",
    relatedTerms: ["friction-scoring", "scope-delta", "outcome-migration"],
    relatedCarriers: ["allstate", "state-farm", "liberty-mutual"],
    body: `
      <p>The supplement resistance score isolates one specific dimension of carrier behavior: the tendency to suppress, delay, or reduce supplement requests after an initial determination. It is a component of the broader friction score but valuable on its own because supplements represent the most common battleground in property insurance claims.</p>
      <h2>What constitutes supplement resistance</h2>
      <ul>
        <li>Reducing a supplement without a written explanation of excluded line items.</li>
        <li>Requiring repeated documentation submissions for the same scope items.</li>
        <li>Issuing a partial approval that does not align with documented damage evidence.</li>
        <li>Delays exceeding the state-mandated response window for supplement review.</li>
        <li>Denying supplements on code-compliance items supported by local ordinances.</li>
      </ul>
      <h2>Supplement resistance vs. legitimate scope disputes</h2>
      <p>Not all supplement reductions are resistance. Carriers legitimately dispute line items when documentation is insufficient or when scope estimates exceed market pricing. The supplement resistance score rises when reductions occur despite adequate documentation — distinguishing systematic suppression from genuine disagreement.</p>
    `,
  },
  {
    slug: "scope-delta",
    term: "Scope Delta",
    shortDef: "The numerical or percentage difference between the scope of damages filed by the contractor and the scope approved by the carrier.",
    category: "claims-process",
    relatedTerms: ["friction-scoring", "supplement-resistance-score", "lifecycle-velocity"],
    body: `
      <p>Scope delta is one of the most actionable intelligence metrics in property insurance claims. It quantifies the gap between what was filed and what was approved — expressed either as a dollar amount or a normalized 0–100 score where higher values indicate larger unresolved gaps.</p>
      <h2>Why scope delta matters</h2>
      <p>A large scope delta does not always indicate fraud or over-filing. In hail and wind claims especially, scope gaps often reflect systematic exclusion of recoverable items (gutters, drip edge, starter strip, ventilation, matching materials) that are supported by code and manufacturer documentation but require active pursuit to recover.</p>
      <h2>Using scope delta in claim strategy</h2>
      <p>When scope delta is high and friction score is low, the gap is often closeable with better documentation. When both are high, escalation architecture becomes necessary. The combination of scope delta and supplement probability score gives a clear signal about the claim's recovery potential.</p>
      <h2>Scope delta by loss type</h2>
      <table>
        <thead><tr><th>Loss type</th><th>Typical scope delta driver</th></tr></thead>
        <tbody>
          <tr><td>Hail damage</td><td>Excluded drip edge, gutter replacement, ventilation, matching</td></tr>
          <tr><td>Wind damage</td><td>Partial vs. full replacement disputes, siding matching</td></tr>
          <tr><td>Water damage</td><td>Drying protocol scope, secondary damage, finish restoration</td></tr>
          <tr><td>Fire damage</td><td>Smoke/odor treatment, contents, code upgrades</td></tr>
        </tbody>
      </table>
    `,
  },
  {
    slug: "lifecycle-velocity",
    term: "Lifecycle Velocity",
    shortDef: "A scoring model that measures how quickly a claim is progressing through its required phases relative to baseline patterns.",
    category: "lifecycle",
    relatedTerms: ["lifecycle-phase", "friction-scoring", "escalation-architecture"],
    body: `
      <p>Lifecycle velocity scores a claim's progression speed against a normalized baseline derived from similar claims. A velocity score below baseline is an early warning that the claim may be stalling — either due to documentation gaps, carrier delay tactics, or adjuster inaction.</p>
      <h2>Lifecycle phases tracked</h2>
      <p>ClaimSignal tracks nine distinct lifecycle phases: Pre-Claim, Filed, Inspected, Initial Determination, Supplement Submitted, Reinspection Requested, Escalated, Resolved, and Closed. Velocity is computed across weighted time intervals between phases.</p>
      <h2>Velocity as a risk signal</h2>
      <p>Claims that slow significantly between Filing and Initial Determination — especially without corresponding documentation activity — frequently exhibit higher friction scores and lower final approval probabilities. Velocity degradation at the Supplement Submitted phase is particularly correlated with supplement suppression behavior.</p>
    `,
  },
  {
    slug: "lifecycle-phase",
    term: "Lifecycle Phase",
    shortDef: "One of nine structured stages that define where a property insurance claim stands in its resolution journey.",
    category: "lifecycle",
    relatedTerms: ["lifecycle-velocity", "escalation-architecture", "outcome-migration"],
    body: `
      <p>Property insurance claims move through a defined sequence of phases from initial notice through final resolution. Understanding the current phase of a claim — and what actions are appropriate at each stage — is foundational to effective claim management.</p>
      <h2>The nine lifecycle phases</h2>
      <table>
        <thead><tr><th>Phase</th><th>Definition</th><th>Key actions</th></tr></thead>
        <tbody>
          <tr><td>Pre-Claim</td><td>Damage documented but claim not yet filed with carrier</td><td>Evidence gathering, scope documentation</td></tr>
          <tr><td>Filed</td><td>Claim submitted to carrier, awaiting assignment</td><td>Confirm receipt, track adjuster assignment</td></tr>
          <tr><td>Inspected</td><td>Carrier inspection completed</td><td>Obtain inspection report, compare to filed scope</td></tr>
          <tr><td>Initial Determination</td><td>Carrier has issued first coverage decision</td><td>Analyze scope delta, decide on supplement path</td></tr>
          <tr><td>Supplement Submitted</td><td>Contractor has filed additional scope items</td><td>Document supplement thoroughly, track response timeline</td></tr>
          <tr><td>Reinspection Requested</td><td>Formal request for second carrier inspection</td><td>Prepare reinspection packet, request independent estimate</td></tr>
          <tr><td>Escalated</td><td>Claim in formal dispute resolution, mediation, or legal process</td><td>Engage public adjuster or legal counsel as appropriate</td></tr>
          <tr><td>Resolved</td><td>Final determination reached, payment issued or denied</td><td>Document outcome, calculate final scope delta</td></tr>
          <tr><td>Closed</td><td>All activity complete, file archived</td><td>Capture outcome intelligence for future claim strategy</td></tr>
        </tbody>
      </table>
    `,
  },
  {
    slug: "escalation-architecture",
    term: "Escalation Architecture",
    shortDef: "A structured, evidence-based escalation strategy that sequences interventions to maximize claim recovery without unnecessary legal exposure.",
    category: "claims-process",
    relatedTerms: ["friction-scoring", "reinspection-request", "outcome-migration"],
    relatedCarriers: ["state-farm", "allstate", "usaa"],
    body: `
      <p>Escalation architecture is the disciplined sequencing of escalation moves — documentation demands, reinspection requests, appraisal invocations, and legal referrals — based on the specific friction pattern a claim is exhibiting. Undirected escalation (escalating every claim uniformly) wastes resources and dilutes the signal. Escalation architecture matches the intensity of the response to the nature of the resistance.</p>
      <h2>Escalation levels</h2>
      <table>
        <thead><tr><th>Level</th><th>Trigger</th><th>Actions</th></tr></thead>
        <tbody>
          <tr><td>Level 1</td><td>Documentation gap identified</td><td>Supplement with targeted evidence, request written basis for denial</td></tr>
          <tr><td>Level 2</td><td>Supplement reduced without explanation</td><td>Request itemized reduction rationale, demand reinspection</td></tr>
          <tr><td>Level 3</td><td>Reinspection denied or ignored</td><td>Invoke policy appraisal clause, engage public adjuster</td></tr>
          <tr><td>Level 4</td><td>Systematic bad faith pattern</td><td>State DOI complaint, legal referral, bad faith documentation</td></tr>
        </tbody>
      </table>
      <h2>Escalation vs. litigation</h2>
      <p>Escalation architecture is not synonymous with litigation. The goal is to create carrier-facing leverage through documentation and process — making litigation unnecessary by resolving disputes at the lowest effective escalation level.</p>
    `,
  },
  {
    slug: "outcome-migration",
    term: "Outcome Migration",
    shortDef: "The measurable shift in a claim's probable resolution — from denial toward approval, or vice versa — as new evidence and interventions are introduced.",
    category: "scoring",
    relatedTerms: ["friction-scoring", "scope-delta", "escalation-architecture"],
    body: `
      <p>Outcome migration tracks the directional movement of a claim's resolution probability over time. A positive outcome migration delta means the claim is trending toward a better result. A negative delta means resistance is increasing and the current strategy is not working.</p>
      <h2>What drives outcome migration</h2>
      <ul>
        <li><strong>Evidence additions:</strong> Each new piece of documentation (photos, engineer reports, ITEL reports) increases the approval probability.</li>
        <li><strong>Supplement responses:</strong> A carrier's response to a supplement is one of the strongest outcome migration signals.</li>
        <li><strong>Escalation actions:</strong> Properly timed escalation often produces positive migration in supplement-resistance cases.</li>
        <li><strong>Time decay:</strong> Claims that stall without documented activity often migrate negatively as carrier positions harden.</li>
      </ul>
      <h2>Outcome migration delta</h2>
      <p>The outcome migration delta is the change in approval probability between two points in the claim lifecycle. ClaimSignal tracks this delta across all active claims, surfacing those with the sharpest negative trends for immediate attention.</p>
    `,
  },
  {
    slug: "adjuster-friction-score",
    term: "Adjuster Friction Score",
    shortDef: "An individual-level metric tracking a specific adjuster's historical pattern of claim resistance, supplement suppression, and escalation behavior.",
    category: "adjuster",
    relatedTerms: ["friction-scoring", "supplement-resistance-score", "carrier-intelligence"],
    body: `
      <p>The adjuster friction score is the individual-level equivalent of the carrier friction score. It aggregates behavioral data from an adjuster's claim history — denial rates, supplement reduction patterns, escalation frequencies, and outcome statistics — into a single normalized score.</p>
      <h2>Why adjuster-level scoring matters</h2>
      <p>Carrier-level friction scores are useful for strategy but obscure the variance within a carrier's adjuster pool. The same carrier may have adjusters with dramatically different behavioral profiles. Knowing you are working with a high-friction adjuster before the first inspection changes the documentation and communication strategy.</p>
      <h2>Adjuster friction vs. carrier friction</h2>
      <p>In some cases, adjuster friction scores are higher than the carrier baseline — indicating that the adjuster applies more resistance than the carrier's average. In others, they are lower — indicating a more cooperative handler. Claims where adjuster friction exceeds carrier friction are the highest priority for early documentation reinforcement.</p>
      <h2>Data sources for adjuster scoring</h2>
      <p>Adjuster friction scores are computed from: outcome records linked to that adjuster's assignments, supplement approval/denial ratios on their claims, escalation frequency relative to peers, and communication pattern signals from documented interactions.</p>
    `,
  },
  {
    slug: "reinspection-request",
    term: "Reinspection Request",
    shortDef: "A formal demand for a second carrier inspection of a property, typically filed when the initial inspection produced an inadequate or disputed scope.",
    category: "claims-process",
    relatedTerms: ["escalation-architecture", "scope-delta", "friction-scoring"],
    body: `
      <p>A reinspection request is one of the most powerful tools available to a contractor or public adjuster when a carrier's initial inspection produced a scope that does not reflect documented damage. When filed with a strong supporting evidence packet, reinspections frequently produce positive scope migrations.</p>
      <h2>When to request reinspection</h2>
      <ul>
        <li>The initial scope omits line items with clear photographic support.</li>
        <li>The carrier's inspector did not access key damage areas (steep-pitch roofs, interior water damage).</li>
        <li>The approved scope conflicts with a third-party engineer or ITEL report.</li>
        <li>A supplement was denied without a written explanation of excluded items.</li>
      </ul>
      <h2>Building an effective reinspection packet</h2>
      <p>A reinspection packet that simply repeats the original filing rarely succeeds. Effective packets include: annotated photos mapped to specific line items, independent estimate comparisons, manufacturer installation requirements showing why partial replacement is insufficient, and local code documentation where applicable.</p>
      <h2>Reinspection frequency by carrier</h2>
      <p>Reinspection approval rates vary significantly by carrier. Some carriers treat reinspection requests as a standard supplement review mechanism. Others route them to specialized review teams that apply higher scrutiny. Knowing the carrier's pattern before filing changes how the packet should be framed.</p>
    `,
  },
  {
    slug: "denial-overturn",
    term: "Denial Overturn",
    shortDef: "A claim outcome where an initial carrier denial is successfully reversed through documentation, escalation, reinspection, or legal intervention.",
    category: "claims-process",
    relatedTerms: ["escalation-architecture", "reinspection-request", "outcome-migration"],
    relatedCarriers: ["allstate", "state-farm", "travelers"],
    body: `
      <p>A denial overturn occurs when a carrier's initial decision to deny a claim — or significantly limit coverage — is reversed as a result of contractor or public adjuster intervention. Overturn rates are among the strongest indicators of both claim viability and carrier behavior patterns.</p>
      <h2>Denial overturn pathways</h2>
      <ul>
        <li><strong>Documentation-driven:</strong> New evidence (photos, reports, code documentation) produces a revised determination without escalation.</li>
        <li><strong>Reinspection-driven:</strong> A second inspection with a stronger evidence packet reverses the initial scope.</li>
        <li><strong>Appraisal:</strong> Invoking the policy's appraisal clause results in an independent determination that exceeds the initial offer.</li>
        <li><strong>Mediation/litigation:</strong> Formal dispute resolution produces an outcome superior to the carrier's original determination.</li>
      </ul>
      <h2>What predicts denial overturn</h2>
      <p>The strongest predictors of successful overturn are: documentation depth at the time of reinspection, the specific denial reason cited by the carrier (pre-existing vs. coverage exclusion vs. insufficient evidence), the carrier's historical overturn rate for this loss type, and the escalation level already reached.</p>
    `,
  },
  {
    slug: "carrier-intelligence",
    term: "Carrier Intelligence",
    shortDef: "Aggregated behavioral data about an insurance carrier's claim handling patterns — including friction tendencies, supplement approval rates, and escalation responses.",
    category: "platform",
    relatedTerms: ["friction-scoring", "adjuster-friction-score", "supplement-resistance-score"],
    relatedCarriers: ["state-farm", "allstate", "travelers", "farmers-insurance"],
    body: `
      <p>Carrier intelligence transforms individual claim outcomes into a systematic behavioral profile of an insurance carrier. Rather than entering each claim blind, contractors and public adjusters equipped with carrier intelligence know in advance what documentation standards, escalation thresholds, and supplement strategies are most likely to produce a favorable outcome with a specific carrier.</p>
      <h2>What carrier intelligence includes</h2>
      <ul>
        <li><strong>Friction profile:</strong> How much resistance the carrier typically applies at each claim phase.</li>
        <li><strong>Supplement approval trends:</strong> The proportion of supplements that receive full, partial, or no approval.</li>
        <li><strong>Common denial patterns:</strong> The most frequently cited denial reasons for each loss type.</li>
        <li><strong>Escalation response patterns:</strong> How the carrier responds to reinspection requests and appraisal invocations.</li>
        <li><strong>Outcome trend analysis:</strong> Whether the carrier's behavior has become more or less cooperative over time.</li>
      </ul>
      <h2>Carrier intelligence vs. public reputation</h2>
      <p>Carrier intelligence derived from claim outcome data is qualitatively different from online reviews or media coverage. It captures systematic behavioral patterns that are invisible to the public but directly relevant to claim strategy — particularly for restoration contractors who work the same carriers repeatedly across hundreds of claims.</p>
    `,
  },
  {
    slug: "approval-probability",
    term: "Approval Probability",
    shortDef: "A model-derived estimate of the likelihood that a claim or supplement will receive full approval from the carrier, given current evidence and claim state.",
    category: "scoring",
    relatedTerms: ["friction-scoring", "scope-delta", "outcome-migration"],
    body: `
      <p>Approval probability is a 0–1 score that estimates, at any point in a claim's lifecycle, the likelihood of full carrier approval given the current state of documentation, escalation level, carrier profile, and claim characteristics.</p>
      <h2>Inputs to approval probability</h2>
      <ul>
        <li>Current friction score and trajectory</li>
        <li>Scope delta magnitude</li>
        <li>Documentation completeness (photos, reports, code docs)</li>
        <li>Carrier and adjuster friction profiles</li>
        <li>Lifecycle phase and velocity</li>
        <li>Historical outcome rates for similar claims with this carrier</li>
      </ul>
      <h2>Using approval probability in practice</h2>
      <p>Approval probability is most useful as a trend signal rather than an absolute number. A claim with rising probability despite an active dispute is one where the current documentation strategy is working. A claim with declining probability signals that intervention is needed before the carrier position hardens further.</p>
    `,
  },
  {
    slug: "irc-compliance",
    term: "IRC Compliance (Insurance Replacement Cost)",
    shortDef: "Adherence to the Insurance Replacement Cost standards that govern how carriers must account for full replacement costs in property damage settlements.",
    category: "claims-process",
    relatedTerms: ["scope-delta", "supplement-resistance-score", "denial-overturn"],
    body: `
      <p>IRC compliance refers to whether a carrier's settlement offer reflects the full replacement cost for damaged property as defined by the applicable insurance policy and local building codes. Non-compliance — paying actual cash value when replacement cost coverage was purchased, or excluding code-mandated upgrades — is one of the most common sources of scope delta in property claims.</p>
      <h2>Common IRC compliance issues</h2>
      <ul>
        <li>Paying ACV instead of RCV on covered losses without proper depreciation disclosure.</li>
        <li>Excluding code-upgrade costs mandated by local building ordinances.</li>
        <li>Refusing to pay for matching materials required by ordinance or policy language.</li>
        <li>Improper depreciation of non-depreciable components.</li>
      </ul>
    `,
  },
  {
    slug: "evidence-pipeline",
    term: "Evidence Pipeline",
    shortDef: "An automated system for uploading, classifying, and extracting intelligence from claim-related documents — denial letters, estimates, supplements, photos, and communications.",
    category: "platform",
    relatedTerms: ["carrier-intelligence", "scope-delta", "adjuster-friction-score"],
    body: `
      <p>The evidence pipeline is the operational backbone of a ClaimSignal workspace. Every document associated with a claim — from the initial estimate to the final denial letter — flows through the pipeline for automated classification, entity extraction, and claim matching.</p>
      <h2>Document categories recognized</h2>
      <ul>
        <li>Denial letters</li>
        <li>Estimates and scopes of work</li>
        <li>Supplement submissions</li>
        <li>Payment letters</li>
        <li>Photo inspection reports</li>
        <li>Policy documents</li>
        <li>Email correspondence threads</li>
        <li>Invoices</li>
        <li>Engineering and ITEL reports</li>
      </ul>
      <h2>Automatic entity extraction</h2>
      <p>The evidence pipeline extracts claim numbers, policy numbers, adjuster names, carrier identities, damage amounts, and key dates from uploaded documents — automatically linking documents to the correct claim and surfacing intelligence that would otherwise require manual review.</p>
    `,
  },
  {
    slug: "playbook-engine",
    term: "Playbook Engine",
    shortDef: "A structured knowledge base of proven claim strategies, indexed by carrier, loss type, and denial pattern, enabling contractors to apply successful historical approaches to active claims.",
    category: "platform",
    relatedTerms: ["carrier-intelligence", "escalation-architecture", "friction-scoring"],
    body: `
      <p>The Playbook Engine transforms historical claim outcomes into reusable strategy templates. When a contractor faces a State Farm hail denial with a specific denial reason, the Playbook Engine surfaces the strategies that have historically produced positive outcomes in similar situations — not generic advice, but pattern-matched intelligence from comparable resolved claims.</p>
      <h2>Playbook matching factors</h2>
      <ul>
        <li>Carrier identity</li>
        <li>Loss type (hail, wind, water, fire)</li>
        <li>Denial reason cited by carrier</li>
        <li>Escalation level reached</li>
        <li>Geographic region</li>
        <li>Claim phase at time of intervention</li>
      </ul>
      <h2>AI-enhanced strategy synthesis</h2>
      <p>ClaimSignal's AI layer synthesizes matched playbooks into a prioritized action plan specific to the active claim's current state — combining the pattern intelligence of historical outcomes with the contextual specifics of the claim at hand.</p>
    `,
  },
];

export function getTermBySlug(slug: string): GlossaryTerm | undefined {
  return TERMS.find((t) => t.slug === slug);
}

export function getTermIndexHtml(): string {
  const byCategory: Record<string, GlossaryTerm[]> = {};
  for (const t of TERMS) {
    if (!byCategory[t.category]) byCategory[t.category] = [];
    byCategory[t.category].push(t);
  }

  const categoryLabels: Record<string, string> = {
    scoring: "Scoring & Metrics",
    lifecycle: "Claim Lifecycle",
    "claims-process": "Claims Process",
    adjuster: "Adjuster Intelligence",
    document: "Documents & Evidence",
    platform: "Platform Concepts",
  };

  const categorySections = Object.entries(byCategory)
    .map(([cat, terms]) => {
      const cards = terms
        .map(
          (t) => `<a href="/learn/${t.slug}" class="card card-sm term-card">
            <div class="term-card-name">${t.term}</div>
            <div class="term-card-def">${t.shortDef}</div>
          </a>`
        )
        .join("");
      return `<div class="section">
        <h2 class="section-title">${categoryLabels[cat] ?? cat}</h2>
        <div class="grid-2">${cards}</div>
      </div>`;
    })
    .join("");

  const body = `
    <div class="hero">
      <span class="badge badge-blue" style="margin-bottom:16px;">Intelligence Glossary</span>
      <h1>Property Insurance Claims Intelligence</h1>
      <p>Definitions and explanations of the metrics, scoring models, and strategic concepts used in ClaimSignal's operational intelligence platform.</p>
    </div>
    ${categorySections}
    <div class="cta-block">
      <h2>See this intelligence applied to your claims</h2>
      <p>ClaimSignal tracks every metric on this page — in real time — across your active claim portfolio.</p>
      <a href="/login" class="btn btn-primary">Access the Platform</a>
    </div>
  `;

  return ssrShell({
    title: "Property Insurance Claims Intelligence Glossary | ClaimSignal",
    description:
      "Definitions and explanations of friction scoring, scope delta, escalation architecture, lifecycle velocity, and other key metrics used in property insurance claims intelligence.",
    canonical: "https://claimsignal.com/learn",
    breadcrumbs: [{ label: "Intelligence Glossary" }],
    schemaJson: {
      "@context": "https://schema.org",
      "@type": "DefinedTermSet",
      name: "ClaimSignal Property Insurance Claims Glossary",
      description: "Key terms and concepts in property insurance claims intelligence.",
      url: "https://claimsignal.com/learn",
      hasDefinedTerm: TERMS.map((t) => ({
        "@type": "DefinedTerm",
        name: t.term,
        description: t.shortDef,
        url: `https://claimsignal.com/learn/${t.slug}`,
        inDefinedTermSet: "https://claimsignal.com/learn",
      })),
    },
    body,
  });
}

export function getTermHtml(slug: string): string | null {
  const term = getTermBySlug(slug);
  if (!term) return null;

  const relatedHtml =
    term.relatedTerms.length > 0
      ? `<div class="section" style="margin-top:48px;">
          <h2 class="section-title">Related concepts</h2>
          <div style="display:flex;flex-wrap:wrap;gap:10px;">
            ${term.relatedTerms
              .map((slug) => {
                const rel = getTermBySlug(slug);
                return rel
                  ? `<a href="/learn/${rel.slug}" class="badge badge-muted" style="font-size:13px;padding:6px 14px;">${rel.term}</a>`
                  : "";
              })
              .join("")}
          </div>
        </div>`
      : "";

  const carrierHtml =
    term.relatedCarriers && term.relatedCarriers.length > 0
      ? `<div class="section" style="margin-top:32px;">
          <h2 class="section-title">Relevant carrier profiles</h2>
          <div style="display:flex;flex-wrap:wrap;gap:10px;">
            ${term.relatedCarriers
              .map(
                (slug) =>
                  `<a href="/carriers/${slug}" class="badge badge-blue" style="font-size:13px;padding:6px 14px;">${slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</a>`
              )
              .join("")}
          </div>
        </div>`
      : "";

  const body = `
    <div class="hero" style="margin-bottom:40px;">
      <span class="badge badge-muted" style="margin-bottom:14px;">${term.category.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span>
      <h1>${term.term}</h1>
      <p>${term.shortDef}</p>
    </div>
    <div class="card" style="margin-bottom:32px;">
      <div class="term-body">${term.body}</div>
    </div>
    ${relatedHtml}
    ${carrierHtml}
    <div class="cta-block">
      <h2>Track ${term.term} on your active claims</h2>
      <p>ClaimSignal monitors every metric on this page across your portfolio in real time.</p>
      <a href="/login" class="btn btn-primary">Access the Platform</a>
      <a href="/learn" class="btn btn-outline">Back to Glossary</a>
    </div>
    <style>
      .term-body h2 { font-size:1rem; font-weight:700; margin:28px 0 10px; }
      .term-body p { color:var(--fg2); line-height:1.75; margin-bottom:14px; }
      .term-body ul { padding-left:20px; color:var(--fg2); line-height:1.75; }
      .term-body li { margin-bottom:8px; }
      .term-body table { margin-top:16px; }
      .term-body strong { color:var(--fg); }
      .term-card { display:block; text-decoration:none; transition:border-color .15s; }
      .term-card:hover { border-color:var(--primary); text-decoration:none; }
      .term-card-name { font-weight:600; font-size:14px; margin-bottom:6px; color:var(--fg); }
      .term-card-def { font-size:13px; color:var(--fg2); line-height:1.5; }
    </style>
  `;

  return ssrShell({
    title: `${term.term} — Property Insurance Claims Glossary | ClaimSignal`,
    description: term.shortDef,
    canonical: `https://claimsignal.com/learn/${term.slug}`,
    breadcrumbs: [
      { label: "Intelligence Glossary", href: "/learn" },
      { label: term.term },
    ],
    schemaJson: {
      "@context": "https://schema.org",
      "@type": "DefinedTerm",
      name: term.term,
      description: term.shortDef,
      url: `https://claimsignal.com/learn/${term.slug}`,
      inDefinedTermSet: {
        "@type": "DefinedTermSet",
        name: "ClaimSignal Property Insurance Claims Glossary",
        url: "https://claimsignal.com/learn",
      },
    },
    body,
  });
}
