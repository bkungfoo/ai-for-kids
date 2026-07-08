import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import {
  ProviderNotConfiguredError,
  type GenerationResult,
  type Provider,
} from './types.js';

export interface ClaudeCodeRequest {
  /** What the child wants to build. Moderated on input. */
  prompt: string;
}

const client = new Anthropic({ apiKey: config.anthropicApiKey });

const KID_CODER_SYSTEM = `You are a friendly coding helper for children. Help them build small, fun, safe projects (games, animations, simple web pages). Write clear, beginner-friendly code with short explanations. Keep all content age-appropriate, positive, and safe. Never produce code that could harm a device, access private data, scrape or contact strangers, or do anything unsafe.`;

/**
 * Claude Code (vibe coding) adapter.
 *
 * Both directions matter here: input moderation guards the child's request, and
 * output moderation re-checks the generated code/explanation for safety before
 * it is returned (e.g. nothing scary, no unsafe instructions).
 */
export const claudeCodeProvider: Provider<ClaudeCodeRequest> = {
  name: 'claude-code',

  isConfigured() {
    return Boolean(config.anthropicApiKey);
  },

  inputTexts(req) {
    return [req.prompt];
  },

  async generate(req): Promise<GenerationResult> {
    if (!config.anthropicApiKey) throw new ProviderNotConfiguredError('claude-code');

    const response = await client.messages.create({
      model: config.providers.claudeCode.model,
      max_tokens: 4096,
      system: KID_CODER_SYSTEM,
      messages: [{ role: 'user', content: req.prompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n');

    return {
      // Re-moderate everything Claude produced before it reaches the child.
      textToModerate: [text],
      metadataToModerate: [],
      result: { response: text, model: response.model },
    };
  },
};
