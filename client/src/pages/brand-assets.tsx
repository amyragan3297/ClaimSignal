import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Check, X, Image, Type, Palette } from "lucide-react";
import logoTransparent from "@assets/claimsignal_logo_transparent.png";
import logoDark from "@assets/ClaimSignal_top_logo_panel_1780179719760.png";
import logoPanel from "@assets/ClaimSignal_top_logo_panel-1_1780180101332.png";

interface LogoVariant {
  name: string;
  description: string;
  bg: string;
  src: string;
  testId: string;
}

const logoVariants: LogoVariant[] = [
  {
    name: "Transparent / Dark Background",
    description: "Primary logo for digital use. Optimized for dark backgrounds and apps.",
    bg: "bg-zinc-950 border border-border/50",
    src: logoTransparent,
    testId: "logo-transparent",
  },
  {
    name: "Light Background",
    description: "Use on white or light-colored backgrounds. For print, light-themed documents, and co-branded materials.",
    bg: "bg-white",
    src: logoTransparent,
    testId: "logo-light",
  },
  {
    name: "Dark Panel",
    description: "Logo on dark background panel. For presentations and co-branded decks.",
    bg: "bg-zinc-900",
    src: logoDark,
    testId: "logo-dark",
  },
  {
    name: "Panel Variant",
    description: "Alternate panel layout. Suitable for printed co-branding and digital banners.",
    bg: "bg-zinc-950",
    src: logoPanel,
    testId: "logo-panel",
  },
];

const brandColors = [
  { name: "Signal Blue", hex: "#2563EB", usage: "Primary — CTAs, links, badges", tailwind: "blue-600" },
  { name: "Deep Background", hex: "#09090B", usage: "App background", tailwind: "zinc-950" },
  { name: "Surface", hex: "#18181B", usage: "Cards and panels", tailwind: "zinc-900" },
  { name: "Foreground", hex: "#FAFAFA", usage: "Primary text", tailwind: "zinc-50" },
  { name: "Muted", hex: "#71717A", usage: "Secondary text, labels", tailwind: "zinc-500" },
  { name: "Border", hex: "#27272A", usage: "Card borders, dividers", tailwind: "zinc-800" },
];

const usageAllowed = [
  "Use the logo in co-branded case studies and materials (Founding Partner agreement required)",
  "Reference ClaimSignal™ by name in press releases and testimonials",
  "Display the logo in partner directories with written permission",
  "Use approved color palette in co-branded presentations",
];

const usageNotAllowed = [
  "Modify, distort, recolor, or recreate the logo",
  "Use the logo without a signed co-branding agreement",
  "Imply endorsement or official partnership without written permission",
  "Use the logo in a way that could cause confusion with your own brand",
  "Remove the ™ symbol from the ClaimSignal™ wordmark",
];

function downloadAsset(src: string, filename: string) {
  const a = document.createElement("a");
  a.href = src;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export default function BrandAssetsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-brand-assets-title">Brand Assets</h1>
        <p className="text-sm text-muted-foreground">Official ClaimSignal™ logos, colors, fonts, and usage guidelines</p>
      </div>

      {/* Logo Downloads */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Image className="w-4 h-4 text-primary" />
          <h2 className="text-base font-semibold">Logo Variants</h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {logoVariants.map((variant) => (
            <Card key={variant.name} className="overflow-hidden" data-testid={`card-logo-${variant.testId}`}>
              <div className={`flex items-center justify-center p-6 ${variant.bg} min-h-[120px]`}>
                <img
                  src={variant.src}
                  alt={variant.name}
                  className="max-h-16 w-auto object-contain"
                  data-testid={`img-${variant.testId}`}
                />
              </div>
              <CardContent className="p-4 space-y-3">
                <div>
                  <p className="text-sm font-medium">{variant.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{variant.description}</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => downloadAsset(variant.src, `claimsignal-logo-${variant.testId}.png`)}
                  data-testid={`button-download-${variant.testId}`}
                >
                  <Download className="w-3 h-3 mr-1.5" />
                  Download PNG
                </Button>
              </CardContent>
            </Card>
          ))}

          {/* Icon / Favicon */}
          <Card className="overflow-hidden" data-testid="card-logo-favicon">
            <div className="flex items-center justify-center p-6 bg-zinc-950 border border-border/50 min-h-[120px]">
              <img
                src="/favicon.png"
                alt="ClaimSignal Icon"
                className="max-h-16 w-auto object-contain"
                data-testid="img-favicon"
              />
            </div>
            <CardContent className="p-4 space-y-3">
              <div>
                <p className="text-sm font-medium">Icon / Favicon</p>
                <p className="text-xs text-muted-foreground mt-0.5">Square icon for favicons, app icons, and small-format use.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => downloadAsset("/favicon.png", "claimsignal-icon.png")}
                data-testid="button-download-favicon"
              >
                <Download className="w-3 h-3 mr-1.5" />
                Download PNG
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Brand Colors */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Palette className="w-4 h-4 text-primary" />
          <h2 className="text-base font-semibold">Brand Colors</h2>
        </div>
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border/50">
              {brandColors.map((color) => (
                <div key={color.name} className="flex items-center gap-4 px-5 py-3" data-testid={`row-color-${color.tailwind}`}>
                  <div
                    className="w-8 h-8 rounded-md shrink-0 border border-border/30"
                    style={{ backgroundColor: color.hex }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{color.name}</p>
                    <p className="text-xs text-muted-foreground">{color.usage}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                    <Badge variant="outline" className="font-mono text-xs">{color.hex}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Typography */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Type className="w-4 h-4 text-primary" />
          <h2 className="text-base font-semibold">Typography</h2>
        </div>
        <Card>
          <CardContent className="p-5 space-y-4">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Primary Typeface</p>
              <p className="text-2xl font-bold tracking-tight">Inter</p>
              <p className="text-sm text-muted-foreground">Used for all UI text, headings, and body copy. Available via Google Fonts.</p>
            </div>
            <div className="border-t border-border/50 pt-4 space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Wordmark Treatment</p>
              <p className="text-lg font-bold tracking-tight">ClaimSignal&#8482;</p>
              <p className="text-sm text-muted-foreground">Always written as "ClaimSignal™" with the trademark symbol. Never abbreviated or modified.</p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Usage Rights */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Image className="w-4 h-4 text-primary" />
          <h2 className="text-base font-semibold">Logo Usage Rights</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-green-400">
                <Check className="w-4 h-4" />
                Permitted Use
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {usageAllowed.map((item) => (
                <div key={item} className="flex items-start gap-2">
                  <Check className="w-3.5 h-3.5 text-green-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground leading-relaxed">{item}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-red-400">
                <X className="w-4 h-4" />
                Not Permitted
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {usageNotAllowed.map((item) => (
                <div key={item} className="flex items-start gap-2">
                  <X className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-muted-foreground leading-relaxed">{item}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <p className="text-xs text-muted-foreground mt-3">
          Logo usage in co-branded materials requires a signed Founding Partner Agreement. For questions, contact{" "}
          <a href="mailto:claimsignal1@gmail.com" className="text-primary hover:underline">claimsignal1@gmail.com</a>.
        </p>
      </section>
    </div>
  );
}
