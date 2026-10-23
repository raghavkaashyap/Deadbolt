/**
 * Shared Anthropic client for Deadbolt's LLM-assisted steps
 * (intent compilation and semantic intent verification).
 *
 * The LLM never authorizes payment; its output is validated and fed into
 * deterministic logic.
 */
import Anthropic from "@anthropic-ai/sdk";

export const DEADBOLT_MODEL = process.env.DEADBOLT_MODEL ?? "claude-opus-5-5";

let _client: Anthropic | null = null;

export function getAnthropic() {
  if (!_client) {
    // Resolves ANTHROPIC_API_KEY (or another configured credential) from the environment.
    _client = new Anthropic();
  }
  return _client;
}
