import type { GenerationUsage } from "../ports/structured-generation";

export interface TokenPricing {
  inputUsdPerMillion: string;
  outputUsdPerMillion: string;
  cacheHitUsdPerMillion?: string;
}

function usdToMicros(value: string): bigint {
  if (!/^\d+(?:\.\d{1,6})?$/.test(value)) {
    throw new Error(`Invalid USD decimal ${value}.`);
  }
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}

function tokenCost(tokens: number, microsPerMillion: bigint): bigint {
  return (BigInt(tokens) * microsPerMillion + 999_999n) / 1_000_000n;
}

export class BudgetLedger {
  private readonly limitMicros: bigint;
  private readonly inputMicrosPerMillion: bigint;
  private readonly outputMicrosPerMillion: bigint;
  private readonly cacheHitMicrosPerMillion: bigint;
  private spentMicros = 0n;
  private reservedMicros = 0n;

  constructor(budgetUsd: string, pricing: TokenPricing) {
    this.limitMicros = usdToMicros(budgetUsd);
    this.inputMicrosPerMillion = usdToMicros(pricing.inputUsdPerMillion);
    this.outputMicrosPerMillion = usdToMicros(pricing.outputUsdPerMillion);
    this.cacheHitMicrosPerMillion = usdToMicros(
      pricing.cacheHitUsdPerMillion ?? pricing.inputUsdPerMillion,
    );
  }

  private cost(usage: GenerationUsage): bigint {
    const inputTokens = Math.max(0, usage.inputTokens - usage.cacheHitTokens);
    return (
      tokenCost(inputTokens, this.inputMicrosPerMillion) +
      tokenCost(usage.outputTokens, this.outputMicrosPerMillion) +
      tokenCost(usage.cacheHitTokens, this.cacheHitMicrosPerMillion)
    );
  }

  reserve(maximumUsage: GenerationUsage): bigint {
    const reservation = this.cost(maximumUsage);
    if (
      this.spentMicros + this.reservedMicros + reservation >
      this.limitMicros
    ) {
      throw new Error("AI_BUDGET_EXHAUSTED");
    }
    this.reservedMicros += reservation;
    return reservation;
  }

  settle(reservation: bigint, actualUsage: GenerationUsage): number {
    if (reservation < 0n || reservation > this.reservedMicros) {
      throw new Error("AI_BUDGET_RESERVATION_INVALID");
    }
    const actual = this.cost(actualUsage);
    const remainingReserved = this.reservedMicros - reservation;
    if (this.spentMicros + remainingReserved + actual > this.limitMicros) {
      throw new Error("AI_BUDGET_EXHAUSTED");
    }
    this.reservedMicros = remainingReserved;
    this.spentMicros += actual;
    return Number(actual);
  }

  release(reservation: bigint): void {
    if (reservation < 0n || reservation > this.reservedMicros) {
      throw new Error("AI_BUDGET_RESERVATION_INVALID");
    }
    this.reservedMicros -= reservation;
  }

  get spent(): number {
    return Number(this.spentMicros);
  }
}
