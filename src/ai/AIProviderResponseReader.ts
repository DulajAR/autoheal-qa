
const DEFAULT_MAX_RESPONSE_BYTES = 32_768;

export type AIResponseReaderOptions = {
  signal: AbortSignal;
  maxBytes?: number;
};

export async function readAIProviderResponse(
  response: Response,
  options: AIResponseReaderOptions
): Promise<string> {
  const { signal } = options;
  const maxBytes =
    options.maxBytes ?? DEFAULT_MAX_RESPONSE_BYTES;

  if (
    !Number.isSafeInteger(maxBytes) ||
    maxBytes < 1 ||
    maxBytes > DEFAULT_MAX_RESPONSE_BYTES
  ) {
    throw new Error("INVALID_RESPONSE_LIMIT");
  }

  if (signal.aborted) {
    throw new Error("AI_RETRY_ABORTED");
  }

  if (!response.body) {
    throw new Error("EMPTY_RESPONSE");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  let onAbort: (() => void) | undefined;

  const aborted = new Promise<never>(
    (_, reject) => {
      onAbort = () => {
        reject(new Error("AI_RETRY_ABORTED"));
      };

      signal.addEventListener(
        "abort",
        onAbort,
        { once: true }
      );

      if (signal.aborted) {
        onAbort();
      }
    }
  );

  try {
    while (true) {
      const result = await Promise.race([
        reader.read(),
        aborted,
      ]);

      if (signal.aborted) {
        throw new Error("AI_RETRY_ABORTED");
      }

      if (result.done) {
        break;
      }

      total += result.value.byteLength;

      if (total > maxBytes) {
        throw new Error("RESPONSE_TOO_LARGE");
      }

      chunks.push(result.value);
    }

    return Buffer.concat(chunks).toString("utf8");
  } finally {
    if (onAbort) {
      signal.removeEventListener("abort", onAbort);
    }

    // Cancellation is best-effort. Do not await a
    // potentially stalled stream cancellation.
    void reader.cancel().catch(() => undefined);

    reader.releaseLock();
  }
}
