
import type {
  AIProviderErrorCode,
} from "./AIProviderDiagnostics";

/**
 * AutoHeal QA
 * Phase 4.0.7 - AI Provider Error Classification
 *
 * Converts known internal failure conditions
 * into safe diagnostic codes.
 *
 * Never stores or returns raw error messages.
 */

export function classifyHTTPStatus(
  status: number
): AIProviderErrorCode {
  if (status === 401 || status === 403) {
    return "AUTHENTICATION_ERROR";
  }

  if (status === 429) {
    return "RATE_LIMITED";
  }

  return "HTTP_ERROR";
}

/**
 * Classify only trusted internal error codes.
 *
 * Do not pass arbitrary upstream error messages
 * into this function.
 */
export function classifyProviderFailure(
  internalCode: string
): AIProviderErrorCode {
  switch (internalCode) {
    case "PROVIDER_TIMEOUT":
    case "GEMINI_TIMEOUT":
      return "TIMEOUT";

    case "RESPONSE_TOO_LARGE":
    case "GEMINI_RESPONSE_TOO_LARGE":
      return "RESPONSE_TOO_LARGE";

    case "EMPTY_RESPONSE":
    case "EMPTY_GEMINI_RESPONSE":
    case "INVALID_ENVELOPE":
    case "INVALID_CONTENT":
    case "INVALID_CANDIDATES":
    case "INVALID_CANDIDATE":
    case "INVALID_GEMINI_ENVELOPE":
    case "INVALID_GEMINI_CONTENT":
    case "INVALID_GEMINI_CANDIDATES":
    case "INVALID_GEMINI_CANDIDATE":
      return "INVALID_RESPONSE";

    case "INVALID_AI_REQUEST":
    case "GEMINI_REQUEST_TOO_LARGE":
      return "INVALID_REQUEST";

    case "EXTERNAL_AI_NOT_AUTHORIZED":
      return "UNAUTHORIZED";

    default:
      return "UNKNOWN_ERROR";
  }
}
