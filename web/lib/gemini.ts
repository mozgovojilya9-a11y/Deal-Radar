type JsonRecord = Record<string, unknown>;

export class GeminiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function geminiModel(): string {
  return process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
}

export function geminiEnabled(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

function toGeminiSchema(schema: JsonRecord): JsonRecord {
  const typeMap: Record<string, string> = { object: "OBJECT", array: "ARRAY", string: "STRING", number: "NUMBER", integer: "INTEGER", boolean: "BOOLEAN" };
  const output: JsonRecord = {};
  if (typeof schema.type === "string") output.type = typeMap[schema.type] || "STRING";
  if (Array.isArray(schema.required)) output.required = schema.required;
  if (Array.isArray(schema.enum)) output.enum = schema.enum;
  if (schema.properties && typeof schema.properties === "object") {
    output.properties = Object.fromEntries(Object.entries(schema.properties as Record<string, JsonRecord>).map(([key, value]) => [key, toGeminiSchema(value)]));
  }
  if (schema.items && typeof schema.items === "object") output.items = toGeminiSchema(schema.items as JsonRecord);
  return output;
}

/** Structured JSON generation. Throws GeminiError with the HTTP status on failure. */
export async function geminiJson<T>(options: {
  system: string;
  contents: Array<{ role: "user" | "model"; text: string }>;
  schema: JsonRecord;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiError("GEMINI_API_KEY не настроен", 503);
  const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(geminiModel()) + ":generateContent";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: options.system }] },
      contents: options.contents.map((item) => ({ role: item.role, parts: [{ text: item.text }] })),
      generationConfig: {
        temperature: options.temperature ?? 0.2,
        maxOutputTokens: options.maxTokens ?? 700,
        responseMimeType: "application/json",
        responseSchema: toGeminiSchema(options.schema),
      },
    }),
    signal: AbortSignal.timeout(options.timeoutMs ?? 18000),
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("Gemini HTTP", response.status, body.slice(0, 500));
    throw new GeminiError("Gemini HTTP " + response.status, response.status);
  }
  const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const raw = payload.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim() || "";
  if (!raw) throw new GeminiError("Gemini вернул пустой ответ", 502);
  return JSON.parse(raw) as T;
}
