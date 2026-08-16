import { BuildRunMode, LexiconCompileProfile } from "@sylis/api-client/admin";
import {
  Button,
  Field,
  PageHeader,
  Select,
  TextInput,
  Toggle,
} from "@sylis/components";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { EntityRows, QueryBoundary } from "../../components";
import { buildRunCommands, buildRunQueries } from "../../modules/build-runs";
import { useAdminQueryScope } from "../../modules/identity";
import { AdminReauthentication } from "../../modules/identity";

export function BuildRunsPage() {
  const scope = useAdminQueryScope();
  const query = useQuery(buildRunQueries.list(scope));
  const cache = useQueryClient();
  const [manifestUri, setUri] = useState("");
  const [manifestHash, setHash] = useState("");
  const [mode, setMode] = useState(BuildRunMode.PILOT);
  const [profile, setProfile] = useState(LexiconCompileProfile.PILOT_200);
  const [budget, setBudget] = useState("0");
  const [aiEnabled, setAiEnabled] = useState(false);
  const [model, setModel] = useState("deepseek-v4-flash");
  const [concurrency, setConcurrency] = useState("2");
  const [inputPrice, setInputPrice] = useState("");
  const [outputPrice, setOutputPrice] = useState("");
  const [cacheHitPrice, setCacheHitPrice] = useState("");
  const [codeVersion, setCodeVersion] = useState("workspace");
  const [schemaVersion, setSchemaVersion] = useState(
    "sylis.lexicon-artifact/1",
  );
  const [routeReleaseId, setRouteReleaseId] = useState("");
  const [credentialRevisionId, setCredentialRevisionId] = useState("");
  const [pilotEvidenceRunId, setPilotEvidenceRunId] = useState("");
  const [forecastHash, setForecastHash] = useState("");
  const [approvalRunId, setApprovalRunId] = useState("");
  const [approvalBudget, setApprovalBudget] = useState("");
  const [approvalForecastHash, setApprovalForecastHash] = useState("");
  const [approvalReason, setApprovalReason] = useState("");
  const [reauthenticated, setReauthenticated] = useState(false);
  const create = useMutation({
    mutationFn: () =>
      buildRunCommands.create(
        {
          mode,
          manifestUri,
          manifestHash,
          compileProfile: profile,
          budgetMicros: budget,
          codeVersion,
          schemaVersion,
          ...(mode === BuildRunMode.FULL
            ? { pilotEvidenceRunId, forecastHash }
            : {}),
          ...(aiEnabled
            ? { providerRouteReleaseId: routeReleaseId, credentialRevisionId }
            : {}),
          modelPolicy: aiEnabled
            ? {
                enabled: true,
                provider: "deepseek",
                model,
                concurrency: Number(concurrency),
                inputUsdPerMillion: inputPrice,
                outputUsdPerMillion: outputPrice,
                ...(cacheHitPrice
                  ? { cacheHitUsdPerMillion: cacheHitPrice }
                  : {}),
                promptVersion: "lexicon-enrichment-prompts/v1",
                schemaVersion: "sylis.ai-candidate/1",
                modelPolicyVersion: `compiler-ai-policy/v1:${model}`,
              }
            : { enabled: false },
        },
        crypto.randomUUID(),
      ),
    onSuccess: () =>
      cache.invalidateQueries({
        queryKey: buildRunQueries.list(scope).queryKey,
      }),
  });
  const previewBudget = useMutation({
    mutationFn: () =>
      buildRunCommands.previewBudget(approvalRunId, {
        approvedBudgetMicros: approvalBudget,
        forecastHash: approvalForecastHash,
      }),
  });
  const approveBudget = useMutation({
    mutationFn: () =>
      buildRunCommands.approveBudget(
        approvalRunId,
        {
          approvedBudgetMicros: approvalBudget,
          forecastHash: approvalForecastHash,
          actionDigest: previewBudget.data?.actionDigest ?? "",
          reason: approvalReason,
        },
        crypto.randomUUID(),
      ),
    onSuccess: () => {
      previewBudget.reset();
      cache.invalidateQueries({
        queryKey: buildRunQueries.list(scope).queryKey,
      });
    },
  });
  return (
    <div className="admin-page">
      <PageHeader eyebrow="Lexicon compiler" title="构建" />
      <form
        className="admin-command"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (reauthenticated) create.mutate();
        }}
      >
        <Field label="Manifest URI">
          <TextInput
            required
            value={manifestUri}
            onChange={(event) => setUri(event.target.value)}
          />
        </Field>
        <Field label="SHA-256">
          <TextInput
            required
            value={manifestHash}
            onChange={(event) => setHash(event.target.value)}
          />
        </Field>
        <Field label="Profile">
          <Select
            value={profile}
            onChange={(event) =>
              setProfile(event.target.value as LexiconCompileProfile)
            }
          >
            <option value={LexiconCompileProfile.PILOT_200}>PILOT_200</option>
            <option value={LexiconCompileProfile.CORE_20000}>CORE_20000</option>
          </Select>
        </Field>
        <Field label="Mode">
          <Select
            value={mode}
            onChange={(event) => setMode(event.target.value as BuildRunMode)}
          >
            <option value={BuildRunMode.PILOT}>PILOT</option>
            <option value={BuildRunMode.FULL}>FULL</option>
          </Select>
        </Field>
        <Field label="Code version">
          <TextInput
            required
            value={codeVersion}
            onChange={(event) => setCodeVersion(event.target.value)}
          />
        </Field>
        <Field label="Schema version">
          <TextInput
            required
            value={schemaVersion}
            onChange={(event) => setSchemaVersion(event.target.value)}
          />
        </Field>
        {mode === BuildRunMode.FULL ? (
          <>
            <Field label="Pilot evidence run ID">
              <TextInput
                required
                value={pilotEvidenceRunId}
                onChange={(event) => setPilotEvidenceRunId(event.target.value)}
              />
            </Field>
            <Field label="Forecast SHA-256">
              <TextInput
                required
                value={forecastHash}
                onChange={(event) => setForecastHash(event.target.value)}
              />
            </Field>
          </>
        ) : null}
        <Field label="预算 (micros)">
          <TextInput
            type="number"
            min={aiEnabled ? "1" : "0"}
            max={Number.MAX_SAFE_INTEGER}
            step="1"
            required
            value={budget}
            onChange={(event) => setBudget(event.target.value)}
          />
        </Field>
        <Toggle
          checked={aiEnabled}
          label="AI 增强"
          onCheckedChange={setAiEnabled}
        />
        {aiEnabled ? (
          <div className="admin-command__section">
            <Field label="Provider route release ID">
              <TextInput
                required
                value={routeReleaseId}
                onChange={(event) => setRouteReleaseId(event.target.value)}
              />
            </Field>
            <Field label="Credential revision ID">
              <TextInput
                required
                value={credentialRevisionId}
                onChange={(event) =>
                  setCredentialRevisionId(event.target.value)
                }
              />
            </Field>
            <Field label="模型">
              <TextInput
                required
                value={model}
                onChange={(event) => setModel(event.target.value)}
              />
            </Field>
            <Field label="并发数">
              <TextInput
                type="number"
                min="1"
                max="16"
                step="1"
                required
                value={concurrency}
                onChange={(event) => setConcurrency(event.target.value)}
              />
            </Field>
            <Field label="输入价格 (USD / 1M tokens)">
              <TextInput
                inputMode="decimal"
                pattern="(?:0|[1-9]\d*)(?:\.\d{1,6})?"
                required
                value={inputPrice}
                onChange={(event) => setInputPrice(event.target.value)}
              />
            </Field>
            <Field label="输出价格 (USD / 1M tokens)">
              <TextInput
                inputMode="decimal"
                pattern="(?:0|[1-9]\d*)(?:\.\d{1,6})?"
                required
                value={outputPrice}
                onChange={(event) => setOutputPrice(event.target.value)}
              />
            </Field>
            <Field label="缓存命中价格 (USD / 1M tokens)">
              <TextInput
                inputMode="decimal"
                pattern="(?:0|[1-9]\d*)(?:\.\d{1,6})?"
                value={cacheHitPrice}
                onChange={(event) => setCacheHitPrice(event.target.value)}
              />
            </Field>
          </div>
        ) : null}
        <AdminReauthentication onStatusChange={setReauthenticated} />
        <Button type="submit" disabled={!reauthenticated || create.isPending}>
          创建构建
        </Button>
        {create.error ? (
          <p className="admin-error">{create.error.message}</p>
        ) : null}
      </form>
      <form
        className="admin-command"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          if (reauthenticated) approveBudget.mutate();
        }}
      >
        <h2>预算批准</h2>
        <Field label="Build run ID">
          <TextInput
            required
            value={approvalRunId}
            onChange={(event) => {
              setApprovalRunId(event.target.value);
              previewBudget.reset();
            }}
          />
        </Field>
        <Field label="批准预算 (micros)">
          <TextInput
            type="number"
            min="0"
            max={Number.MAX_SAFE_INTEGER}
            step="1"
            required
            value={approvalBudget}
            onChange={(event) => {
              setApprovalBudget(event.target.value);
              previewBudget.reset();
            }}
          />
        </Field>
        <Field label="Forecast SHA-256">
          <TextInput
            required
            value={approvalForecastHash}
            onChange={(event) => {
              setApprovalForecastHash(event.target.value);
              previewBudget.reset();
            }}
          />
        </Field>
        <Field label="理由">
          <TextInput
            required
            value={approvalReason}
            onChange={(event) => setApprovalReason(event.target.value)}
          />
        </Field>
        <Button
          type="button"
          disabled={previewBudget.isPending}
          onClick={() => previewBudget.mutate()}
        >
          预览影响
        </Button>
        {previewBudget.data ? (
          <dl>
            <dt>当前预算</dt>
            <dd>{previewBudget.data.currentBudgetMicros}</dd>
            <dt>批准预算</dt>
            <dd>{previewBudget.data.approvedBudgetMicros}</dd>
            <dt>增加额度</dt>
            <dd>{previewBudget.data.increaseMicros}</dd>
          </dl>
        ) : null}
        {previewBudget.error ? (
          <p className="admin-error">{previewBudget.error.message}</p>
        ) : null}
        <Button
          type="submit"
          disabled={
            !reauthenticated || !previewBudget.data || approveBudget.isPending
          }
        >
          批准预算并启动
        </Button>
        {approveBudget.error ? (
          <p className="admin-error">{approveBudget.error.message}</p>
        ) : null}
      </form>
      <QueryBoundary pending={query.isPending} error={query.error}>
        <EntityRows data={query.data} />
      </QueryBoundary>
    </div>
  );
}
