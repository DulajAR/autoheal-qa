
export type DOMElementContext = {
  tagName: string;
  id?: string;
  testId?: string;
  name?: string;
  role?: string;
  type?: string;
  ariaLabel?: string;
  placeholder?: string;
  text?: string;
};

export type DOMContext = {
  url: string;
  elements: DOMElementContext[];
  totalElements: number;
  truncated: boolean;
};

export type DOMExtractionOptions = {
  maxElements?: number;
  maxTextLength?: number;
};
