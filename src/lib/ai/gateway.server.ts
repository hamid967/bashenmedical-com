/**
 * G3 — Analytics AI: minimal server-only helper to call Lovable AI Gateway
 * for non-streaming JSON completions. Never import from client code.
 */

export type GatewayMessage = { role: "system" | "user" | "assistant"; content: string };

export interface GatewayJsonResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  raw?: string;
  error?: string;
  model: string;
}

/**
 * Non-streaming chat call that expects a JSON object as the assistant reply.
 * Uses response_format=json_object to force valid JSON.
 */
export async function callGatewayJson<T>(params: {
  model: string;
  messages: GatewayMessage[];
  temperature?: number;
}): Promise<GatewayJsonResult<T>> {
  const apiKey = process.env.LOVABLE_API_KEY;
  const model = params.model;
  if (!apiKey) return { ok: false, status: 500, data: null, error: "no_api_key", model };

  const body: Record<string, unknown> = {
    model,
    messages: params.messages,
    response_format: { type: "json_object" },
  };
  if (typeof params.temperature === "number") body.temperature = params.temperature;
  if (model.startsWith("openai/gpt-5.6")) {
    (body as Record<string, unknown>).reasoning_effort = "none";
  }

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return { ok: false, status: res.status, data: null, error: errText.slice(0, 500), model };
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = json.choices?.[0]?.message?.content ?? "";
  try {
    const parsed = JSON.parse(raw) as T;
    return { ok: true, status: 200, data: parsed, raw, model };
  } catch {
    return { ok: false, status: 200, data: null, raw, error: "invalid_json", model };
  }
}
