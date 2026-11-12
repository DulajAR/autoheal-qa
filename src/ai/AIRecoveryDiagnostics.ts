
import { randomUUID } from "node:crypto";

export type AIRecoveryStage =
  | "CONFIGURATION"
  | "AUTHORIZATION"
  | "DOM_EXTRACTION"
  | "PROVIDER"
  | "VALIDATION"
  | "RANKING"
  | "COMPLETED";

export type AIRecoveryDiagnostics = {
  recoveryId: string;
  stage: AIRecoveryStage;
  durationMs: number;
  timedOut: boolean;
};

export function createRecoveryId(): string {
  return randomUUID();
}

export function createRecoveryDiagnostics(
  recoveryId: string,
  stage: AIRecoveryStage,
  startedAt: number,
  timedOut = false
): AIRecoveryDiagnostics {
  return {
    recoveryId,
    stage,
    durationMs: Math.max(
      0,
      performance.now() - startedAt
    ),
    timedOut,
  };
}
