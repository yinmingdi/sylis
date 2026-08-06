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

import { EntityRows, QueryBoundary } from "../../app/view-utils";
import { AdminReauthentication } from "../../modules/identity";
import { operationCommands, operationQueries } from "../../modules/operations";

export function BuildsPage() {
  const query = useQuery(operationQueries.builds);
  const cache = useQueryClient();
  const [manifestUri, setUri] = useState("");
  const [manifestHash, setHash] = useState("");
  const [profile, setProfile] = useState("pilot-200");
  const [budget, setBudget] = useState("0");
  const [aiEnabled, setAiEnabled] = useState(false);
  const [model, setModel] = useState("deepseek-v4-flash");
  const [concurrency, setConcurrency] = useState("2");
  const [inputPrice, setInputPrice] = useState("");
  const [outputPrice, setOutputPrice] = useState("");
  const [cacheHitPrice, setCacheHitPrice] = useState("");
  const [reauthenticated, setReauthenticated] = useState(false);
  const create = useMutation({
    mutationFn: () =>
      operationCommands.builds.create(
        {
          manifestUri,
          manifestHash,
          compileProfile: profile,
          budgetMicros: Number(budget),
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
      cache.invalidateQueries({ queryKey: operationQueries.builds.queryKey }),
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
            onChange={(event) => setProfile(event.target.value)}
          >
            <option value="pilot-200">pilot-200</option>
            <option value="core-20000">core-20000</option>
          </Select>
        </Field>
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
      <QueryBoundary pending={query.isPending} error={query.error}>
        <EntityRows data={query.data} />
      </QueryBoundary>
    </div>
  );
}
