import type { ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import { WORKFLOW_DESCRIPTORS } from "@open-cinema/contracts";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  CREDITS_PER_USD,
  formatCost,
  setCostPreferences,
  useCostPreferences,
  type CostUnit,
  type EstimateVisibility,
} from "@/features/settings/preferences";
import { getStudioSettings, type ComfyKeyStatus } from "@/server/settings";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings · Open Cinema" }] }),
  loader: () => getStudioSettings(),
  component: Settings,
});

const REPOSITORY = "https://github.com/martinnormark/open-cinema";

const comfyBadge: Record<
  ComfyKeyStatus,
  { label: string; variant: "success" | "destructive" | "outline" }
> = {
  configured: { label: "Connected", variant: "success" },
  missing: { label: "Not configured", variant: "destructive" },
  unknown: { label: "Unknown", variant: "outline" },
};

const comfyDetail: Record<ComfyKeyStatus, string> = {
  configured:
    "Generations run through Comfy Router and are billed to the workspace that owns this key.",
  missing:
    "Add COMFY_API_KEY to the jobs Worker (apps/jobs/.dev.vars locally, a Worker secret when deployed), then restart.",
  unknown:
    "The jobs Worker did not report its key status. Generating an image will tell you whether credentials are missing.",
};

function Settings() {
  const settings = Route.useLoaderData();
  const preferences = useCostPreferences();
  const comfy = comfyBadge[settings.comfy];
  const models = [
    ...new Set(
      Object.values(WORKFLOW_DESCRIPTORS).flatMap((d) => [...d.models]),
    ),
  ];

  return (
    <section
      className="mx-auto w-full max-w-4xl px-6 pt-10 pb-28 md:px-12 md:pt-14"
      aria-labelledby="page-title"
    >
      <PageHeader
        title="Settings"
        description="How this studio connects to Comfy, shows costs and signs people in."
      />

      <div className="mt-10 rounded-xl border bg-surface">
        <SettingsSection
          title="Comfy"
          description="Generation runs on Comfy Router with the key held by the jobs Worker. The key never reaches the browser."
        >
          <Row label="API key">
            <Badge variant={comfy.variant}>{comfy.label}</Badge>
          </Row>
          <p className="text-sm leading-6 text-muted-foreground">
            {comfyDetail[settings.comfy]}
          </p>
          <a
            href="https://platform.comfy.org"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-foreground underline decoration-border hover:decoration-foreground"
          >
            Manage keys and credits on platform.comfy.org
            <ExternalLink aria-hidden="true" className="size-3.5" />
          </a>
        </SettingsSection>

        <Separator />

        <SettingsSection
          title="Cost display"
          description="Saved in this browser. Estimates come from Comfy's published prices, so treat them as a guide."
        >
          <Row label="Show prices in" id="cost-unit">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              aria-labelledby="cost-unit"
              value={preferences.unit}
              onValueChange={(unit) =>
                unit && setCostPreferences({ unit: unit as CostUnit })
              }
            >
              <ToggleGroupItem value="usd" className="px-3">
                US dollars
              </ToggleGroupItem>
              <ToggleGroupItem value="credits" className="px-3">
                Comfy credits
              </ToggleGroupItem>
            </ToggleGroup>
          </Row>
          <Row label="Estimate before generating" id="cost-estimates">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              aria-labelledby="cost-estimates"
              value={preferences.estimates}
              onValueChange={(estimates) =>
                estimates &&
                setCostPreferences({
                  estimates: estimates as EstimateVisibility,
                })
              }
            >
              <ToggleGroupItem value="always" className="px-3">
                Always
              </ToggleGroupItem>
              <ToggleGroupItem value="video" className="px-3">
                Video only
              </ToggleGroupItem>
              <ToggleGroupItem value="never" className="px-3">
                Never
              </ToggleGroupItem>
            </ToggleGroup>
          </Row>
          <p className="tabular text-sm text-muted-foreground">
            {CREDITS_PER_USD} credits equal $1. Preview:{" "}
            <span className="text-foreground" aria-live="polite">
              {formatCost(
                { min: CREDITS_PER_USD / 2, max: CREDITS_PER_USD },
                preferences.unit,
              )}
            </span>
          </p>
        </SettingsSection>

        <Separator />

        <SettingsSection
          title="Sign-in"
          description="Who can reach this studio and how their work is kept separate."
        >
          <Row label="Mode">
            <span className="flex items-center gap-2">
              <span className="text-sm">
                {settings.auth.mode === "cloudflare-access"
                  ? "Cloudflare Access"
                  : settings.auth.mode === "local"
                    ? "Local test session"
                    : "Not configured"}
              </span>
              <Badge variant={settings.auth.ready ? "success" : "warning"}>
                {settings.auth.ready ? "Ready" : "Needs setup"}
              </Badge>
            </span>
          </Row>
          <p className="text-sm leading-6 text-muted-foreground">
            {settings.auth.detail}
          </p>
          <a
            href={`${REPOSITORY}/blob/main/docs/auth.md`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-foreground underline decoration-border hover:decoration-foreground"
          >
            Deploying publicly
            <ExternalLink aria-hidden="true" className="size-3.5" />
          </a>
        </SettingsSection>

        <Separator />

        <SettingsSection
          title="Environment"
          description="Useful when reporting a problem or comparing deployments."
        >
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[10rem_1fr]">
            <Fact term="Build">
              {settings.environment.mode === "development"
                ? "Development"
                : "Production"}
            </Fact>
            <Fact term="Host">
              <code className="font-mono text-[0.8125rem]">
                {settings.environment.host}
              </code>
              {settings.environment.secure ? "" : " · not HTTPS"}
            </Fact>
            <Fact term="Runtime">Cloudflare Workers</Fact>
            <Fact term="Router models">
              <ul className="flex flex-wrap gap-1.5">
                {models.map((model) => (
                  <li key={model}>
                    <code className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-[0.75rem] text-muted-foreground">
                      {model}
                    </code>
                  </li>
                ))}
              </ul>
            </Fact>
            <Fact term="Source">
              <a
                href={REPOSITORY}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-border hover:decoration-foreground"
              >
                github.com/martinnormark/open-cinema
              </a>{" "}
              · MIT license
            </Fact>
          </dl>
        </SettingsSection>
      </div>
    </section>
  );
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="grid gap-4 p-6 md:grid-cols-[14rem_1fr] md:gap-10"
    >
      <div>
        <h2 className="text-[0.9375rem] font-medium">{title}</h2>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="flex min-w-0 flex-col items-start gap-4">{children}</div>
    </section>
  );
}

function Row({
  label,
  id,
  children,
}: {
  label: string;
  id?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex w-full flex-wrap items-center justify-between gap-3">
      <span id={id} className="text-sm">
        {label}
      </span>
      {children}
    </div>
  );
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}
