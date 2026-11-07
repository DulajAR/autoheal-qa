import type {
  AIProvider,
  AILocatorCandidate,
  AILocatorRequest,
} from "./AIProvider";

export class MockAIProvider implements AIProvider {
  readonly name = "mock";

  constructor(
    private readonly candidates: AILocatorCandidate[] = []
  ) {}

  async suggestLocators(
    _request: AILocatorRequest
  ): Promise<AILocatorCandidate[]> {
    return this.candidates.map((candidate) => ({
      ...candidate,
    }));
  }
}