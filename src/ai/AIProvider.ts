export type AILocatorCandidate = {
  selector: string;
  confidence: number;
  reasoning?: string;
};

export type AILocatorRequest = {
  primarySelector: string;
  domSnapshot: string;
};

export interface AIProvider {
  readonly name: string;

  suggestLocators(
    request: AILocatorRequest
  ): Promise<AILocatorCandidate[]>;
}