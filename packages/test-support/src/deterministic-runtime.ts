import { stableUuid } from "@sylis/utils";

export class FixedClock {
  private currentTime: number;

  constructor(initialTime: string | Date | number) {
    this.currentTime = new Date(initialTime).getTime();
    if (!Number.isFinite(this.currentTime)) {
      throw new Error("Fixed clock requires a valid initial time");
    }
  }

  now(): Date {
    return new Date(this.currentTime);
  }

  advance(milliseconds: number): Date {
    if (!Number.isFinite(milliseconds)) {
      throw new Error("Clock advance must be finite");
    }
    this.currentTime += milliseconds;
    return this.now();
  }

  set(time: string | Date | number): Date {
    const nextTime = new Date(time).getTime();
    if (!Number.isFinite(nextTime)) {
      throw new Error("Fixed clock requires a valid time");
    }
    this.currentTime = nextTime;
    return this.now();
  }
}

export class DeterministicIdFactory {
  private sequence = 0;

  constructor(private readonly seed: string) {
    if (seed.trim().length === 0) {
      throw new Error("Deterministic id seed must not be empty");
    }
  }

  next(scope: string): string {
    if (scope.trim().length === 0) {
      throw new Error("Deterministic id scope must not be empty");
    }
    const id = stableUuid(`${this.seed}:${scope}:${this.sequence}`);
    this.sequence += 1;
    return id;
  }
}
