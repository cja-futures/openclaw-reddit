import { env } from '../config/env';

export type OpenClawRequest = {
  agentId: string;
  systemPrompt: string;
  userPrompt: string;
  sessionKey?: string;
  metadata?: Record<string, string | number>;
};

type ResponsesApiOutputText = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class OpenClawClient {
  constructor(
    private readonly options = {
      baseUrl: env.OPENCLAW_BASE_URL,
      token: env.OPENCLAW_AUTH_TOKEN,
      timeoutMs: env.OPENCLAW_REQUEST_TIMEOUT_MS,
      maxRetries: env.OPENCLAW_MAX_RETRIES,
    }
  ) {}

  async deleteSession(sessionKey: string): Promise<void> {
    const headers: Record<string, string> = {};
    if (this.options.token) {
      headers.Authorization = `Bearer ${this.options.token}`;
    }
    try {
      await fetch(
        `${this.options.baseUrl}/v1/sessions/${encodeURIComponent(sessionKey)}`,
        { method: 'DELETE', headers }
      );
    } catch {
      // best-effort — ignore network errors
    }
  }

  async createResponse(request: OpenClawRequest): Promise<string> {
    const payload = {
      model: `openclaw:${request.agentId}`,
      input: [
        {
          type: 'message',
          role: 'system',
          content: request.systemPrompt,
        },
        {
          type: 'message',
          role: 'user',
          content: request.userPrompt,
        },
      ],
      metadata: request.metadata
        ? Object.fromEntries(
            Object.entries(request.metadata).map(([key, value]) => [key, String(value)])
          )
        : undefined,
    };

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-OpenClaw-Agent-Id': request.agentId,
      };

      if (request.sessionKey) {
        headers['X-OpenClaw-Session-Key'] = request.sessionKey;
      }

      if (this.options.token) {
        headers.Authorization = `Bearer ${this.options.token}`;
      }

      try {
        const response = await fetch(`${this.options.baseUrl}/v1/responses`, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const detail = await response.text();
          throw new Error(`OpenClaw HTTP ${response.status}: ${detail}`);
        }

        const data = (await response.json()) as ResponsesApiOutputText;
        const outputText = extractOutputText(data);

        if (!outputText) {
          throw new Error('OpenClaw response did not contain output text');
        }

        return outputText.trim();
      } catch (error) {
        clearTimeout(timeout);
        lastError = error instanceof Error ? error : new Error('Unknown OpenClaw error');

        if (attempt === this.options.maxRetries) {
          break;
        }

        await sleep(250 * (attempt + 1));
      }
    }

    throw new Error(`OpenClaw request failed after retries: ${lastError?.message ?? 'unknown'}`);
  }
}

function extractOutputText(data: ResponsesApiOutputText): string | undefined {
  if (data.output_text) {
    return data.output_text;
  }

  const textParts =
    data.output
      ?.flatMap((item) => item.content ?? [])
      .filter((item) => item.type === 'output_text' || item.text)
      .map((item) => item.text?.trim())
      .filter(Boolean) ?? [];

  return textParts.join('\n').trim() || undefined;
}
