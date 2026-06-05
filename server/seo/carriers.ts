import { ssrShell } from "./shell";
import { type CarrierIntelligence } from "../carrier-intelligence";

export interface CarrierProfile {
  slug: string;
  name: string;
  shortName: string;
  hqState: string;
  founded: number;
  marketSegments: string[];
  lossTypesCommon: string[];
  summary: string;
  claimProcess: string;
  supplementApproach: string;
  escalationNotes: string;
  documentationTips: string[];
  commonDenialReasons: string[];
  keyFactors: string[];
  intelligenceModules: {
    frictionScore: null;
    approvalTrendScore: null;
    escalationSuccessRate: null;
    reinspectionFrequency: null;
    outcomeTrendAnalysis: null;
  };
}

export const CARRIERS: CarrierProfile[] = [
  {
    slug: "state-farm",
    name: "State Farm Insurance",
    shortName: "State Farm",
    hqState: "Illinois",
    founded: 1922,
    marketSegments: ["homeowners", "auto", "life", "commercial"],
    lossTypesCommon: ["hail", "wind", "water", "fire", "tornado"],
    summary:
      "State Farm is the largest property and casualty insurer in the United States by market share. Its scale means significant variability in adjuster behavior — outcomes on the same loss type can differ substantially depending on region and assigned adjuster. As a mutual company, State Farm's claim handling priorities have historically balanced policyholder service with loss-ratio management.",
    claimProcess:
      "State Farm's standard claim process begins with an online or phone notice of loss, followed by an adjuster assignment within 1–3 business days for weather-related events. Initial inspections are typically conducted by staff adjusters or independent adjustment firms under contract. For large-scale weather events, State Farm frequently deploys catastrophe adjustment teams whose practices may differ from local adjuster norms.",
    supplementApproach:
      "State Farm processes supplement requests through its field offices. Supplements with strong documentation — annotated photo evidence, line-item estimates referencing current Xactimate pricing, and written justification for excluded items — tend to move faster through the review process. Verbal supplement discussions are rarely binding; written submissions with a documented evidence trail produce more consistent outcomes.",
    escalationNotes:
      "State Farm's policy documents include an appraisal clause that policyholders may invoke when there is a disagreement on the amount of loss. Reinspection requests submitted with a complete evidence packet — rather than a simple disagreement statement — are more likely to produce a revised determination. State insurance department complaint filings for documented bad-faith handling patterns have historically prompted faster resolution in disputed cases.",
    documentationTips: [
      "Submit all supplement requests in writing with itemized line references rather than relying on phone or verbal discussions.",
      "Include manufacturer installation requirements for any items where partial replacement is claimed to be infeasible.",
      "Document adjuster name, contact information, and date of all communications.",
      "Request a copy of the field adjuster's inspection report in writing before submitting a supplement.",
      "For hail claims, include an independent ITEL or RoofX report when disputing scope.",
    ],
    commonDenialReasons: [
      "Pre-existing wear and tear not caused by covered peril",
      "Damage attributed to maintenance deficiency rather than storm event",
      "Scope limited to damaged areas only — no matching or code allowance",
      "Below-deductible determination after applying depreciation",
      "Hail size or storm intensity disputed based on carrier's weather data",
    ],
    keyFactors: [
      "Largest U.S. P&C carrier — significant regional variation in claim handling",
      "Strong appraisal clause invocation history in wind/hail disputes",
      "Supplemental review timelines vary by regional office",
      "Catastrophe teams operate differently than standard local adjusters",
    ],
    intelligenceModules: {
      frictionScore: null,
      approvalTrendScore: null,
      escalationSuccessRate: null,
      reinspectionFrequency: null,
      outcomeTrendAnalysis: null,
    },
  },
  {
    slug: "allstate",
    name: "Allstate Insurance",
    shortName: "Allstate",
    hqState: "Illinois",
    founded: 1931,
    marketSegments: ["homeowners", "auto", "life", "commercial"],
    lossTypesCommon: ["hail", "wind", "water", "fire"],
    summary:
      "Allstate is the second-largest publicly traded personal lines property and casualty insurer in the United States. Allstate has been the subject of significant litigation and regulatory scrutiny over its claims handling practices, including widely reported practices from the McKinsey-era 'Colossus' claims management period. The company has undergone substantial changes since then, but its claim handling reputation among restoration contractors remains mixed.",
    claimProcess:
      "Allstate's claim process uses a combination of staff adjusters, independent adjustment firms, and — for smaller claims — automated photo estimation tools. Policyholders and contractors dealing with Allstate should expect that initial estimates may be generated partly or entirely from photo submissions rather than in-person inspection, particularly for hail and wind claims below a certain threshold.",
    supplementApproach:
      "Allstate's supplement review process has a documented history of systematic line-item reductions. Supplements are most effective when filed with: specific written challenge to each line item reduced, current local pricing justification, and documentation that the excluded items are required either by manufacturer specifications or local code. Generic supplement re-submissions without new documentation rarely produce different outcomes.",
    escalationNotes:
      "Allstate policies include appraisal clauses that have been invoked successfully in disputed hail and wind claims across multiple states. Allstate has also been subject to insurance department complaints in several states that have produced remediation in documented bad-faith cases. Public adjuster engagement tends to produce different outcomes than contractor-only pursuit in Allstate disputes.",
    documentationTips: [
      "Assume the initial estimate was produced from photos — request an in-person inspection if not already conducted.",
      "For each supplement line item, write a specific justification rather than resubmitting the same scope.",
      "Document matching requirements under the applicable policy endorsement and state law.",
      "Request the specific Xactimate profile and pricing list used in the carrier's estimate.",
      "Preserve all written communications — Allstate's review process is heavily documented.",
    ],
    commonDenialReasons: [
      "Cosmetic damage exclusion invoked for hail impact marks without functional damage",
      "Storm date disputed — carrier claims damage predates policy effective date",
      "Photo-based estimate used to limit scope without in-person inspection",
      "Matching denied on grounds that 'cosmetic' differences are not covered",
      "Depreciation applied to items that are non-depreciable under policy language",
    ],
    keyFactors: [
      "Photo estimation tools may undercount scope — request in-person inspection",
      "Strong appraisal clause history in hail disputes",
      "Line-item-specific supplement documentation produces better results than bulk re-submissions",
      "Matching and code upgrade items require specific policy and code citations",
    ],
    intelligenceModules: {
      frictionScore: null,
      approvalTrendScore: null,
      escalationSuccessRate: null,
      reinspectionFrequency: null,
      outcomeTrendAnalysis: null,
    },
  },
  {
    slug: "usaa",
    name: "USAA (United Services Automobile Association)",
    shortName: "USAA",
    hqState: "Texas",
    founded: 1922,
    marketSegments: ["homeowners", "auto", "life"],
    lossTypesCommon: ["hail", "wind", "water", "hurricane", "wildfire"],
    summary:
      "USAA serves military members, veterans, and their families exclusively. It consistently ranks among the highest in customer satisfaction surveys and has a reputation for more cooperative claim handling than other large carriers. However, USAA is not immune to scope disputes, and contractors working USAA claims should be prepared for a claims process that may move quickly but still requires thorough documentation.",
    claimProcess:
      "USAA's claim process is predominantly digital — most claims can be filed and managed through their app, and photo-based initial assessments are common. USAA uses a network of preferred contractors and independent adjusters, with claims often assigned rapidly after notice of loss. For catastrophe events, USAA deploys dedicated response teams.",
    supplementApproach:
      "USAA's supplement process is generally more transparent than many other major carriers, with adjusters typically providing written rationale for scope decisions. Supplements with strong photo documentation and current local pricing data tend to move efficiently. Code compliance items are more consistently acknowledged by USAA than by some competitors, particularly when documented with local ordinance references.",
    escalationNotes:
      "USAA escalation through the appraisal clause is available and has been invoked in larger disputes. Given USAA's general cooperative stance, pre-appraisal escalation — a well-documented written request for scope reconsideration — often produces results without formal appraisal proceedings. USAA members can also escalate through USAA's own member advocacy channels.",
    documentationTips: [
      "USAA's digital process responds well to well-organized photo documentation submitted through official channels.",
      "Reference applicable local ordinances and code upgrade requirements explicitly.",
      "USAA preferred contractor programs may affect third-party contractor supplement processing — understand the referral relationship.",
      "Member advocacy channels provide a non-adversarial escalation path worth attempting before formal appraisal.",
    ],
    commonDenialReasons: [
      "Storm data dispute — carrier data shows wind/hail below damage threshold",
      "Pre-existing condition determination",
      "Scope limited to damaged roof sections — no full replacement allowed",
      "Specific code upgrade items denied without local ordinance documentation",
    ],
    keyFactors: [
      "Military/veteran exclusive — members have strong policy advocacy resources",
      "Generally higher initial cooperation than industry average",
      "Strong digital claim management — well-organized documentation submits cleanly",
      "Code compliance items more consistently acknowledged than at other large carriers",
    ],
    intelligenceModules: {
      frictionScore: null,
      approvalTrendScore: null,
      escalationSuccessRate: null,
      reinspectionFrequency: null,
      outcomeTrendAnalysis: null,
    },
  },
  {
    slug: "travelers",
    name: "Travelers Insurance",
    shortName: "Travelers",
    hqState: "Connecticut",
    founded: 1853,
    marketSegments: ["homeowners", "commercial", "auto", "specialty"],
    lossTypesCommon: ["hail", "wind", "water", "fire", "commercial property"],
    summary:
      "Travelers is a major commercial and personal lines insurer known for sophisticated risk assessment and underwriting. On the personal lines side, Travelers' claim handling reputation varies significantly by region and product line. Commercial property claims — particularly for restoration contractors working large-loss commercial jobs — involve a more complex process than residential claims and typically require experienced public adjusters or legal counsel for scope disputes.",
    claimProcess:
      "Travelers assigns claims to staff adjusters or independent adjustment firms depending on loss size and regional availability. Large commercial losses typically involve specialized large-loss adjusters. Travelers is known for more methodical review processes and longer cycle times than some competitors, which can create documentation management challenges for contractors tracking multiple active claims.",
    supplementApproach:
      "Travelers supplement processing tends to be deliberate and documentation-intensive. Line-item justification with current market pricing data, manufacturer specification references, and local code documentation produces the most consistent outcomes. Travelers adjusters have a reputation for thorough counter-analysis — generic supplements without specific justification for each disputed item frequently receive partial or no adjustment.",
    escalationNotes:
      "Travelers' policies include appraisal clauses, and the company has a history of appraisal proceedings in commercial property disputes. Reinspection requests for commercial losses should be accompanied by a detailed written scope comparison, not simply a restatement of the original claim. For residential claims, the escalation path is similar to other major carriers.",
    documentationTips: [
      "Travelers' review process is methodical — expect thorough counter-analysis of supplements.",
      "For commercial claims, engage a public adjuster experienced with large commercial losses.",
      "Provide current market pricing justification for all disputed line items.",
      "For code upgrade disputes, reference specific local ordinance language in writing.",
      "Track all communication dates and request confirmation of supplement receipt.",
    ],
    commonDenialReasons: [
      "Scope limited based on carrier's independent assessment differing from contractor estimate",
      "Depreciation applied to items with disputed depreciability",
      "Commercial policy exclusions applied to residential-style loss categories",
      "Code upgrade costs denied without specific ordinance documentation",
      "Water damage timeline disputes — pre-existing vs. sudden loss",
    ],
    keyFactors: [
      "Major commercial lines presence — large-loss adjusters operate differently from residential teams",
      "Methodical supplement review requires thorough, item-specific documentation",
      "Longer cycle times than some competitors — documentation tracking critical",
      "Strong appraisal clause history in commercial disputes",
    ],
    intelligenceModules: {
      frictionScore: null,
      approvalTrendScore: null,
      escalationSuccessRate: null,
      reinspectionFrequency: null,
      outcomeTrendAnalysis: null,
    },
  },
  {
    slug: "farmers-insurance",
    name: "Farmers Insurance",
    shortName: "Farmers",
    hqState: "California",
    founded: 1928,
    marketSegments: ["homeowners", "auto", "commercial", "life"],
    lossTypesCommon: ["hail", "wind", "water", "wildfire", "earthquake"],
    summary:
      "Farmers Insurance operates as a network of largely independent farmer-branded companies. This structure creates significant variation in claim handling between policy types and regions. Farmers has a large presence in the Southwest and Mountain West, where hail, wind, and wildfire claims dominate the property loss landscape. Contractor experience with Farmers claims is highly variable by region and adjuster assignment.",
    claimProcess:
      "Farmers uses a combination of staff adjusters and independent adjustment firms. The company has invested in digital claim tools, and initial assessments for lower-complexity claims may use photo submissions. Farmers' adjuster network tends to have higher turnover in catastrophe-heavy regions, which affects the consistency of claim handling.",
    supplementApproach:
      "Farmers' supplement process requires well-documented, line-item-specific submissions. The company has a history of systematic cost-containment in supplemental review, particularly for code compliance items and matching claims. Contractors report variable outcomes depending heavily on the assigned adjuster and regional office.",
    escalationNotes:
      "Farmers' policies include appraisal clauses with varying invocation procedures by state. California-specific bad faith regulations have been invoked successfully in documented cases of unreasonable claim delay or denial. Wildfire claims in particular have generated significant regulatory scrutiny in California, and Farmers has been subject to several department of insurance actions related to claim handling practices.",
    documentationTips: [
      "Document the assigned adjuster and all communication in writing — Farmers regional variation is high.",
      "For wildfire claims in California, understand state-specific policyholder protections that exceed standard policy language.",
      "Code compliance items require specific local ordinance citations — generic references are frequently rejected.",
      "Request written scope justification for any line-item reduction before resubmitting a supplement.",
      "ITEL and independent vendor reports carry weight in Farmers hail scope disputes.",
    ],
    commonDenialReasons: [
      "Pre-existing damage or wear and tear cited for roof claims",
      "Cosmetic damage exclusion applied to hail impact evidence",
      "Wildfire smoke damage scope limited relative to documented exposure",
      "Code upgrade items denied — local ordinance documentation insufficient",
      "Carrier weather data disputes storm intensity or date",
    ],
    keyFactors: [
      "High regional variability — Farmers operates as a network of affiliated companies",
      "Wildfire claim handling in California subject to heightened regulatory scrutiny",
      "Higher adjuster turnover in catastrophe regions affects process consistency",
      "Code compliance documentation particularly important for supplement recovery",
    ],
    intelligenceModules: {
      frictionScore: null,
      approvalTrendScore: null,
      escalationSuccessRate: null,
      reinspectionFrequency: null,
      outcomeTrendAnalysis: null,
    },
  },
  {
    slug: "liberty-mutual",
    name: "Liberty Mutual Insurance",
    shortName: "Liberty Mutual",
    hqState: "Massachusetts",
    founded: 1912,
    marketSegments: ["homeowners", "auto", "commercial", "specialty"],
    lossTypesCommon: ["hail", "wind", "water", "fire"],
    summary:
      "Liberty Mutual is one of the largest global property and casualty insurers and the sixth-largest in the United States by premium volume. The company operates multiple brands (including Safeco) and has a diversified portfolio of personal and commercial lines. Liberty Mutual's claim handling has been the subject of litigation in multiple states, particularly related to systematic undervaluation of structural claims.",
    claimProcess:
      "Liberty Mutual's personal lines claims are handled through a network of staff adjusters and preferred vendor programs. The company has invested heavily in technology-assisted estimating, and photo-based estimates are common for weather-related property claims. Preferred contractor programs create a referral relationship that can affect the independence of scope assessments.",
    supplementApproach:
      "Liberty Mutual's supplement process requires specific documentation support. The company has a documented pattern of applying Xactimate pricing at rates below local market levels — contractors should have current local pricing comparisons available when disputing line-item rates. Preferred vendor arrangements create potential conflicts of interest in scope assessment that independent contractors should be aware of.",
    escalationNotes:
      "Liberty Mutual policies contain appraisal clauses and Liberty Mutual has been involved in numerous appraisal proceedings across multiple states. The company's preferred vendor programs have been challenged in litigation in several markets. For larger commercial disputes, experienced public adjusters or legal counsel familiar with Liberty Mutual's practices improve outcomes significantly.",
    documentationTips: [
      "Request confirmation that pricing used in the initial estimate reflects current local market rates.",
      "If a preferred vendor was used for the initial assessment, understand the referral relationship.",
      "For Safeco-branded policies, the claims process follows Liberty Mutual's standard procedures.",
      "Structural scope disputes benefit from independent engineering documentation.",
      "Track response times against state-mandated timelines — Liberty Mutual disputes have involved delay-related claims.",
    ],
    commonDenialReasons: [
      "Below-market pricing applied to Xactimate line items",
      "Scope limited to damaged components only — matching and code denied",
      "Preferred vendor assessment scope differs from independent contractor scope",
      "Pre-existing condition determination for aging roofing systems",
      "Photo-based estimate excludes items only visible during in-person inspection",
    ],
    keyFactors: [
      "Operates multiple brands including Safeco — similar processes apply",
      "Technology-assisted estimating common — may underrepresent scope",
      "Preferred vendor programs create referral dynamics to be aware of",
      "Xactimate pricing disputes are common in Liberty Mutual supplement reviews",
    ],
    intelligenceModules: {
      frictionScore: null,
      approvalTrendScore: null,
      escalationSuccessRate: null,
      reinspectionFrequency: null,
      outcomeTrendAnalysis: null,
    },
  },
  {
    slug: "nationwide",
    name: "Nationwide Insurance",
    shortName: "Nationwide",
    hqState: "Ohio",
    founded: 1926,
    marketSegments: ["homeowners", "auto", "commercial", "farm"],
    lossTypesCommon: ["hail", "wind", "water", "fire", "agricultural"],
    summary:
      "Nationwide is a mutual insurance company with a significant presence in the Midwest and Southeast, where hail and tornado claims are common. The company's mutual ownership structure influences its claim handling approach. Nationwide has a diversified book that includes significant agricultural and farm policy exposure alongside standard residential homeowners.",
    claimProcess:
      "Nationwide assigns claims through its network of agent-affiliated adjusters and independent firms. The company has a documented responsiveness to supplement documentation when supported with current pricing data and specific scope justification. Agricultural and farm-related property claims follow different processes than standard residential homeowners claims.",
    supplementApproach:
      "Nationwide's supplement review process is generally considered more transparent than some larger competitors. The company responds well to structured supplement submissions that reference specific policy language, local code requirements, and current pricing data. Midwest hail claims have historically been a high-volume area where Nationwide's supplement handling patterns are well-documented in contractor communities.",
    escalationNotes:
      "Nationwide policies contain standard appraisal clauses. The company's agent network creates an additional escalation channel — agent involvement in disputed claims can accelerate review in some regional offices. State insurance department channels have been effective for documented cases of unreasonable delay.",
    documentationTips: [
      "Nationwide's agent network can be leveraged as a non-adversarial escalation channel.",
      "Midwest hail claims benefit from detailed storm certification documentation.",
      "Current local Xactimate pricing comparisons carry weight in supplement reviews.",
      "Agricultural and farm policy claims require specialized documentation distinct from residential claims.",
    ],
    commonDenialReasons: [
      "Storm intensity disputed — carrier weather data shows subcritical hail size",
      "Pre-existing wear and tear on aging roof systems",
      "Code upgrade costs denied without specific local ordinance reference",
      "Matching costs excluded under cosmetic damage language",
    ],
    keyFactors: [
      "Mutual ownership — claim handling priorities balance with policyholder service mission",
      "Agent network provides additional escalation channel",
      "Strong Midwest presence — hail and tornado claim patterns well-documented",
      "Agricultural/farm lines require specialized claim expertise",
    ],
    intelligenceModules: {
      frictionScore: null,
      approvalTrendScore: null,
      escalationSuccessRate: null,
      reinspectionFrequency: null,
      outcomeTrendAnalysis: null,
    },
  },
  {
    slug: "erie-insurance",
    name: "Erie Insurance",
    shortName: "Erie",
    hqState: "Pennsylvania",
    founded: 1925,
    marketSegments: ["homeowners", "auto", "commercial"],
    lossTypesCommon: ["hail", "wind", "water", "fire", "snow/ice"],
    summary:
      "Erie Insurance is a regional carrier operating primarily in the Mid-Atlantic, Midwest, and Southeast. Erie consistently ranks highly in customer satisfaction surveys and has a reputation for cooperative claim handling. The company uses a network of exclusive agents and staff adjusters, and its regional concentration means claim handling practices are more consistent than larger national carriers.",
    claimProcess:
      "Erie's claims are handled primarily by staff adjusters — the company has a lower reliance on independent adjustment firms than many competitors. This produces more consistent claim handling standards within Erie's operating territory. Erie's agent-centric model means claims often flow through relationships rather than purely through automated assignment.",
    supplementApproach:
      "Erie's supplement process is generally regarded as more transparent and cooperative than the national average. The company has strong documentation practices and tends to provide written rationale for scope decisions. Contractors report higher supplement acceptance rates with Erie than with several other major carriers, particularly when documentation is thorough.",
    escalationNotes:
      "Erie's cooperative stance means formal escalation through the appraisal clause is less frequently necessary than with other carriers. Agent involvement in disputed claims is an effective escalation channel unique to Erie's distribution model. When formal escalation is required, Erie's appraisal process follows standard policy terms.",
    documentationTips: [
      "Erie's agent relationships are valuable — involve the agent early in any scope dispute.",
      "Staff adjuster model means consistent documentation standards — well-organized submissions process efficiently.",
      "Code compliance items are generally acknowledged with specific ordinance documentation.",
    ],
    commonDenialReasons: [
      "Pre-existing condition determination",
      "Scope limited to areas of direct impact evidence",
      "Snow/ice damage vs. pre-existing structural issue disputed",
    ],
    keyFactors: [
      "Staff adjuster model — more consistent claim handling than independent adjustment networks",
      "Agent-centric distribution creates additional escalation channel",
      "Regional concentration (Mid-Atlantic, Midwest) produces consistent practices",
      "Higher-than-average customer satisfaction ratings",
    ],
    intelligenceModules: {
      frictionScore: null,
      approvalTrendScore: null,
      escalationSuccessRate: null,
      reinspectionFrequency: null,
      outcomeTrendAnalysis: null,
    },
  },
];

export function getCarrierBySlug(slug: string): CarrierProfile | undefined {
  return CARRIERS.find((c) => c.slug === slug);
}

function intelModulePlaceholder(label: string, description: string): string {
  return `<div class="intel-module">
    <div class="intel-module-icon"></div>
    <div>
      <div class="intel-module-label">${label}</div>
      <div class="intel-module-note">${description} — populates when sufficient anonymized ClaimSignal data exists for this carrier.</div>
    </div>
  </div>`;
}

function intelModuleCard(label: string, value: string, subtext: string, tone: "good" | "bad" | "neutral" | "warning" = "neutral"): string {
  const toneMap = {
    good: "intel-good",
    bad: "intel-bad",
    neutral: "intel-neutral",
    warning: "intel-warning",
  };
  return `<div class="intel-module real">
    <div class="intel-module-value">${value}</div>
    <div class="intel-module-meta">
      <div class="intel-module-label ${toneMap[tone]}">${label}</div>
      <div class="intel-module-note">${subtext}</div>
    </div>
  </div>`;
}

export function buildIntelModules(intel: CarrierIntelligence | undefined): string {
  if (!intel || intel.claimsCount === 0) {
    return `<div style="display:flex;flex-direction:column;gap:12px;">
      ${intelModulePlaceholder("Friction Score", "Average friction score across claims")}
      ${intelModulePlaceholder("Approval Trend", "Supplement approval rate trend")}
      ${intelModulePlaceholder("Escalation Success", "Escalation success rate")}
      ${intelModulePlaceholder("Reinspection Frequency", "Reinspection rate")}
      ${intelModulePlaceholder("Outcome Trend", "Claim outcome trend")}
    </div>`;
  }

  const cards: string[] = [];

  const frictionVal = intel.frictionIndex !== null ? intel.frictionIndex.toFixed(1) : null;
  const frictionTone = frictionVal === null ? "neutral" : parseFloat(frictionVal) <= 4 ? "good" : parseFloat(frictionVal) <= 7 ? "warning" : "bad";
  cards.push(intelModuleCard(
    "Friction Score",
    frictionVal ?? "—",
    `Average across ${intel.claimsCount} ${intel.carrierName} claims` + (frictionVal ? ` · Lower = smoother` : ""),
    frictionTone
  ));

  const approvalRate = intel.approvalRate !== undefined ? Math.round(intel.approvalRate * 100) : null;
  const approvalTone = approvalRate === null ? "neutral" : approvalRate >= 60 ? "good" : approvalRate >= 40 ? "warning" : "bad";
  cards.push(intelModuleCard(
    "Approval Rate",
    approvalRate !== null ? `${approvalRate}%` : "—",
    `Initial claim approval rate across ${intel.claimsCount} claims`,
    approvalTone
  ));

  const denialRate = intel.denialRate !== undefined ? Math.round(intel.denialRate * 100) : null;
  const denialTone = denialRate === null ? "neutral" : denialRate <= 20 ? "good" : denialRate <= 40 ? "warning" : "bad";
  cards.push(intelModuleCard(
    "Denial Rate",
    denialRate !== null ? `${denialRate}%` : "—",
    `${intel.deniedThenApprovedCount} denials later overturned`,
    denialTone
  ));

  const supRate = intel.supplementSuccessRate !== undefined ? Math.round(intel.supplementSuccessRate * 100) : null;
  const supTone = supRate === null ? "neutral" : supRate >= 60 ? "good" : supRate >= 40 ? "warning" : "bad";
  cards.push(intelModuleCard(
    "Supplement Success",
    supRate !== null && intel.supplementSampleSize > 0 ? `${supRate}%` : "—",
    intel.supplementSampleSize > 0 ? `${intel.supplementSampleSize} supplement requests tracked` : "No supplement data yet",
    supTone
  ));

  const escRate = intel.escalationSuccessRate !== undefined ? Math.round(intel.escalationSuccessRate * 100) : null;
  const escTone = escRate === null ? "neutral" : escRate >= 50 ? "good" : escRate >= 30 ? "warning" : "bad";
  cards.push(intelModuleCard(
    "Escalation Success",
    escRate !== null && intel.escalationSampleSize > 0 ? `${escRate}%` : "—",
    intel.escalationSampleSize > 0 ? `${intel.escalationSampleSize} escalations tracked` : "No escalation data yet",
    escTone
  ));

  const overturnRate = intel.overturnRate;
  const overturnTone = overturnRate === null ? "neutral" : overturnRate >= 50 ? "good" : overturnRate >= 30 ? "warning" : "bad";
  cards.push(intelModuleCard(
    "Overturn Rate",
    overturnRate !== null ? `${overturnRate}%` : "—",
    `Denials overturned on challenge or escalation`,
    overturnTone
  ));

  const reinspection = intel.reinspectionRate;
  const reinspectionTone = reinspection === null ? "neutral" : reinspection >= 40 ? "warning" : "neutral";
  cards.push(intelModuleCard(
    "Reinspection Rate",
    reinspection !== null ? `${reinspection}%` : "—",
    `Claims requiring reinspection`,
    reinspectionTone
  ));

  const resDays = intel.avgResolutionDays;
  const resTone = resDays === null ? "neutral" : resDays <= 45 ? "good" : resDays <= 90 ? "warning" : "bad";
  cards.push(intelModuleCard(
    "Avg Resolution",
    resDays !== null ? `${resDays} days` : "—",
    `From date of loss to final outcome`,
    resTone
  ));

  if (intel.commonSignals.length > 0) {
    cards.push(`<div class="card" style="margin-top:8px;">
      <div style="font-size:12px;font-weight:600;color:var(--fg2);margin-bottom:8px;text-transform:uppercase;letter-spacing:.06em;">Behavioral Signals</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${intel.commonSignals.map((s) => `<span class="badge badge-amber">${s}</span>`).join(" ")}
      </div>
    </div>`);
  }

  return `<div style="display:flex;flex-direction:column;gap:12px;">${cards.join("")}</div>`;
}

export function getCarrierIndexHtml(): string {
  const cards = CARRIERS.map(
    (c) => `<a href="/carriers/${c.slug}" class="card card-sm carrier-card">
      <div class="carrier-card-header">
        <div>
          <div class="carrier-card-name">${c.name}</div>
          <div class="carrier-card-meta">${c.hqState} · Founded ${c.founded}</div>
        </div>
      </div>
      <div class="carrier-card-segments">
        ${c.lossTypesCommon.slice(0, 4).map((l) => `<span class="badge badge-muted">${l}</span>`).join(" ")}
      </div>
      <p class="carrier-card-summary">${c.summary.slice(0, 160)}…</p>
    </a>`
  ).join("");

  const body = `
    <div class="hero">
      <span class="badge badge-blue" style="margin-bottom:16px;">Carrier Intelligence</span>
      <h1>Property Insurance Carrier Profiles</h1>
      <p>Educational profiles covering claim handling characteristics, supplement strategies, escalation patterns, and documentation requirements for major U.S. property insurance carriers.</p>
    </div>
    <div class="disclaimer">
      All carrier information on this page is <strong>educational and informational only</strong>. It is based on publicly available information and does not constitute legal advice. Individual claim outcomes vary by policy, region, adjuster, and specific loss circumstances. As ClaimSignal accumulates sufficient anonymized aggregate data, this page will be supplemented with platform-derived intelligence metrics.
    </div>
    <div class="grid-2" style="margin-bottom:56px;">${cards}</div>
    <div class="cta-block">
      <h2>Apply carrier intelligence to your active claims</h2>
      <p>ClaimSignal tracks carrier and adjuster behavior patterns across your portfolio — friction scores, supplement outcomes, and escalation intelligence updated in real time.</p>
      <a href="/login" class="btn btn-primary">Access the Platform</a>
      <a href="/learn" class="btn btn-outline">Intelligence Glossary</a>
    </div>
    <style>
      .carrier-card { display:block; text-decoration:none; transition:border-color .15s; }
      .carrier-card:hover { border-color:var(--primary); text-decoration:none; }
      .carrier-card-header { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:12px; }
      .carrier-card-name { font-weight:700; font-size:15px; color:var(--fg); margin-bottom:2px; }
      .carrier-card-meta { font-size:12px; color:var(--fg2); }
      .carrier-card-segments { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:10px; }
      .carrier-card-summary { font-size:13px; color:var(--fg2); line-height:1.55; margin-top:10px; }
    </style>
  `;

  return ssrShell({
    title: "Property Insurance Carrier Profiles | ClaimSignal",
    description:
      "Educational profiles for major U.S. property insurance carriers — claim handling patterns, supplement strategies, escalation approaches, and documentation requirements for State Farm, Allstate, USAA, Travelers, Farmers, and more.",
    canonical: "https://claimsignal.com/carriers",
    breadcrumbs: [{ label: "Carrier Intelligence" }],
    schemaJson: {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Property Insurance Carrier Profiles",
      description: "Educational profiles for major U.S. property insurance carriers",
      url: "https://claimsignal.com/carriers",
      itemListElement: CARRIERS.map((c, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: c.name,
        url: `https://claimsignal.com/carriers/${c.slug}`,
      })),
    },
    body,
  });
}

export function getCarrierHtml(slug: string, intel?: CarrierIntelligence): string | null {
  const carrier = getCarrierBySlug(slug);
  if (!carrier) return null;

  const intelHtml = buildIntelModules(intel);

  const dataConfidenceBadge = intel
    ? `<span class="badge ${intel.dataConfidence === 'high' ? 'badge-green' : intel.dataConfidence === 'medium' ? 'badge-amber' : 'badge-muted'}">${intel.dataConfidence.charAt(0).toUpperCase() + intel.dataConfidence.slice(1)} confidence · ${intel.claimsCount} claims</span>`
    : `<span class="badge badge-muted">No live data yet</span>`;

  const denialList = carrier.commonDenialReasons
    .map((r) => `<li>${r}</li>`)
    .join("");

  const docTipsList = carrier.documentationTips
    .map((t) => `<li>${t}</li>`)
    .join("");

  const keyFactorsList = carrier.keyFactors
    .map((f) => `<li><strong>${f}</strong></li>`)
    .join("");

  const lossTypeBadges = carrier.lossTypesCommon
    .map((l) => `<span class="badge badge-muted">${l}</span>`)
    .join(" ");

  const claimPatternLinks = carrier.lossTypesCommon
    .map((l) => {
      const lSlug = l.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      return `<a href="/claims/${carrier.slug}/${lSlug}" class="badge badge-blue" style="font-size:13px;padding:6px 14px;">${carrier.shortName} + ${l}</a>`;
    })
    .join("");

  const body = `
    <div class="hero" style="margin-bottom:40px;">
      <span class="badge badge-blue" style="margin-bottom:14px;">Carrier Profile</span>
      <h1>${carrier.name}</h1>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin:16px 0;">
        <span class="badge badge-muted">${carrier.hqState}</span>
        <span class="badge badge-muted">Founded ${carrier.founded}</span>
        ${lossTypeBadges}
      </div>
      <p>${carrier.summary}</p>
    </div>

    <div class="disclaimer">
      This profile is <strong>educational and informational only</strong>, based on publicly available information and anonymized platform data where indicated. It is not legal advice. Individual outcomes vary by policy, region, and loss circumstances.
      <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">${dataConfidenceBadge}</div>
    </div>

    <div class="grid-2" style="margin-bottom:40px;">
      <div class="card">
        <h2 class="section-title">Claim Process</h2>
        <p style="font-size:14px;color:var(--fg2);line-height:1.7;">${carrier.claimProcess}</p>
      </div>
      <div class="card">
        <h2 class="section-title">Supplement Approach</h2>
        <p style="font-size:14px;color:var(--fg2);line-height:1.7;">${carrier.supplementApproach}</p>
      </div>
    </div>

    <div class="card" style="margin-bottom:24px;">
      <h2 class="section-title">Escalation Notes</h2>
      <p style="font-size:14px;color:var(--fg2);line-height:1.7;">${carrier.escalationNotes}</p>
    </div>

    <div class="grid-2" style="margin-bottom:40px;">
      <div class="card">
        <h2 class="section-title" style="margin-bottom:14px;">Common Denial Reasons</h2>
        <ul style="padding-left:18px;color:var(--fg2);font-size:14px;line-height:1.8;">${denialList}</ul>
      </div>
      <div class="card">
        <h2 class="section-title" style="margin-bottom:14px;">Documentation Tips</h2>
        <ul style="padding-left:18px;color:var(--fg2);font-size:14px;line-height:1.8;">${docTipsList}</ul>
      </div>
    </div>

    <div class="card" style="margin-bottom:40px;">
      <h2 class="section-title" style="margin-bottom:14px;">Key Factors</h2>
      <ul style="padding-left:18px;color:var(--fg2);font-size:14px;line-height:1.8;">${keyFactorsList}</ul>
    </div>

    <div class="section" style="margin-bottom:40px;">
      <h2 class="section-title">Intelligence Modules</h2>
      <p class="section-sub">Platform-derived behavioral intelligence for ${carrier.shortName}. ${intel ? `Sourced from ${intel.claimsCount} anonymized claims across the ClaimSignal network.` : "Metrics populate as anonymized aggregate claim data accumulates."}</p>
      ${intelHtml}
    </div>

    ${
      carrier.lossTypesCommon.length > 0
        ? `<div class="section" style="margin-bottom:40px;">
        <h2 class="section-title">Claim Pattern Pages</h2>
        <p class="section-sub">Loss-type-specific claim handling intelligence for ${carrier.shortName}.</p>
        <div style="display:flex;flex-wrap:wrap;gap:10px;">${claimPatternLinks}</div>
      </div>`
        : ""
    }

    <div class="cta-block">
      <h2>Track ${carrier.shortName} claims in ClaimSignal</h2>
      <p>Monitor friction scores, supplement outcomes, and escalation intelligence across your active ${carrier.shortName} claims — updated in real time.</p>
      <a href="/login" class="btn btn-primary">Access the Platform</a>
      <a href="/carriers" class="btn btn-outline">All Carrier Profiles</a>
    </div>
  `;

  return ssrShell({
    title: `${carrier.name} — Property Insurance Carrier Profile | ClaimSignal`,
    description: `Educational profile for ${carrier.name}: claim handling patterns, supplement strategies, common denial reasons, escalation approach, and documentation tips for property insurance claims.`,
    canonical: `https://claimsignal.com/carriers/${carrier.slug}`,
    breadcrumbs: [
      { label: "Carrier Intelligence", href: "/carriers" },
      { label: carrier.name },
    ],
    schemaJson: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: `${carrier.name} — Carrier Profile`,
      description: `Educational property insurance claim handling profile for ${carrier.name}`,
      url: `https://claimsignal.com/carriers/${carrier.slug}`,
      dateModified: new Date().toISOString().split("T")[0],
    },
    body,
  });
}
