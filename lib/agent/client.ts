/**
 * Ollama Cloud transport for the Kred agent.
 *
 * Ollama Cloud speaks the OpenAI chat-completions wire format, so this is plain
 * `fetch` + SSE parsing rather than an SDK. That keeps the dependency count at zero
 * and means nothing here breaks when a vendor SDK changes its interface.
 *
 * SERVER ONLY. The API keys must never reach the client bundle; this module is
 * imported exclusively by the route handler.
 */
import { nextKey, rotateAfterFailure, keyCount } from "@/lib/agent/limits";

const ENDPOINT = "https://ollama.com/v1/chat/completions";

/** gpt-oss:120b is the strongest tool-caller on Ollama Cloud that still streams fast
 *  enough to feel live. Override per-deploy without a code change if that stops
 *  being true. */
export const MODEL = process.env.OLLAMA_MODEL?.trim() || "gpt-oss:120b";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** assistant turns that called tools */
  tool_calls?: ToolCall[];
  /** tool result turns must echo the id they answer */
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export type StreamEvent =
  | { type: "text"; value: string }
  | { type: "tool_calls"; calls: ToolCall[] }
  | { type: "done"; reason: string };

interface ToolCallDelta {
  index: number;
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

/** Accumulates streamed `tool_calls` deltas, which arrive split across chunks and are
 *  addressed by array index rather than by id. */
class ToolCallBuffer {
  private slots: ToolCall[] = [];

  push(deltas: ToolCallDelta[]): void {
    for (const d of deltas) {
      const slot = (this.slots[d.index] ??= {
        id: "",
        type: "function",
        function: { name: "", arguments: "" },
      });
      if (d.id) slot.id = d.id;
      if (d.function?.name) slot.function.name += d.function.name;
      if (d.function?.arguments) slot.function.arguments += d.function.arguments;
    }
  }

  drain(): ToolCall[] {
    const out = this.slots.filter((c) => c && c.function.name);
    this.slots = [];
    return out;
  }
}

/**
 * Stream one assistant turn. Yields text deltas as they arrive, then either a
 * `tool_calls` event (the caller runs the tools and calls again with the results) or
 * a `done` event.
 *
 * Retries once per configured key on a transport-level failure, so a single exhausted
 * or rate-limited account falls through to the next plan instead of failing the
 * request.
 */
export async function* streamChat(
  messages: ChatMessage[],
  tools: ToolDef[],
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  // At least three tries even with a single key: Ollama Cloud returns transient 503s,
  // and with one plan configured a key-count-based loop would give up on the first
  // blip. More keys just means more of these attempts land on a different account.
  const attempts = Math.max(3, keyCount());
  let lastError = "";

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      // Short backoff, aborted promptly if the user gave up on the reply.
      await new Promise((r) => setTimeout(r, 400 * attempt));
      if (signal?.aborted) return;
    }

    const key = nextKey();
    if (!key) throw new Error("agent is not configured");

    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          tools: tools.length ? tools : undefined,
          stream: true,
          temperature: 0.2, // this reads financial data; creativity is not the goal
        }),
      });
    } catch (err) {
      if (signal?.aborted) return;
      lastError = err instanceof Error ? err.message : String(err);
      rotateAfterFailure();
      continue;
    }

    // 401/402/429 mean this key is bad or spent — try the next plan.
    if (res.status === 401 || res.status === 402 || res.status === 429) {
      lastError = `key rejected (HTTP ${res.status})`;
      rotateAfterFailure();
      continue;
    }
    if (!res.ok || !res.body) {
      lastError = `HTTP ${res.status}`;
      rotateAfterFailure();
      continue;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const buffered = new ToolCallBuffer();
    let carry = "";
    let finish = "stop";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        carry += decoder.decode(value, { stream: true });

        // A chunk can split mid-frame, so keep the tail for the next read.
        const frames = carry.split("\n");
        carry = frames.pop() ?? "";

        for (const frame of frames) {
          const line = frame.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;

          let json: {
            choices?: Array<{
              delta?: { content?: string; tool_calls?: ToolCallDelta[] };
              finish_reason?: string | null;
            }>;
          };
          try {
            json = JSON.parse(payload);
          } catch {
            continue; // a malformed frame isn't worth failing the whole turn over
          }

          const choice = json.choices?.[0];
          if (!choice) continue;
          if (choice.delta?.content) {
            yield { type: "text", value: choice.delta.content };
          }
          if (choice.delta?.tool_calls) {
            buffered.push(choice.delta.tool_calls);
          }
          if (choice.finish_reason) finish = choice.finish_reason;
        }
      }
    } finally {
      reader.releaseLock();
    }

    const calls = buffered.drain();
    if (calls.length) {
      yield { type: "tool_calls", calls };
      return;
    }
    yield { type: "done", reason: finish };
    return;
  }

  throw new Error(`every configured key failed: ${lastError}`);
}
