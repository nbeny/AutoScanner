import { ScannerCategory } from '../types';

describe('ScannerCategory', () => {
  it('includes the AI_LLM category with the ai-llm value', () => {
    expect(ScannerCategory.AI_LLM).toBe('ai-llm');
  });
});
