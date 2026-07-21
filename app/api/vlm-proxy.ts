/**
 * api/vlm-proxy.ts — The only server-side code in the project.
 * Vercel serverless function handling all three model tasks.
 *
 * WHY IT EXISTS (non-negotiable, from the plan):
 *  1. Keys. The repo goes public for judging — OPENAI_API_KEY and
 *     ROBOFLOW_API_KEY may only ever exist here, as env vars.
 *  2. Demo determinism. Responses are cached by content hash, so the filmed
 *     demo replays identical model outputs no matter how flaky the network or
 *     how nondeterministic the model. (In-memory cache is enough: one warm
 *     serverless instance easily spans a demo take; localStorage on the
 *     client is the second layer.)
 *  3. Cost ceiling. One place to clamp image sizes and reject oversized
 *     payloads before they hit paid APIs.
 *
 * Deliberately dependency-free (no SDK): three fetch calls, easier to audit.
 */

export const config = { maxDuration: 30 };

// ── Tiny in-memory response cache (per warm instance) ───────────────────────

const cache = new Map<string, unknown>();

/** djb2 — good enough for cache keys; crypto not needed for this purpose. */
function hashKey(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

// ── Task handlers ───────────────────────────────────────────────────────────

async function handleDetect(image: string): Promise<unknown> {
  const key = process.env.ROBOFLOW_API_KEY;
  const model = process.env.ROBOFLOW_MODEL ?? 'climbing-holds-and-volumes/2';
  if (!key) throw new Error('ROBOFLOW_API_KEY not configured');

  // Roboflow hosted inference accepts base64 body (without the data-URL prefix).
  const base64 = image.replace(/^data:image\/\w+;base64,/, '');
  const res = await fetch(
    `https://serverless.roboflow.com/${model}?api_key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: base64,
    },
  );
  if (!res.ok) throw new Error(`roboflow: HTTP ${res.status}`);
  return res.json();
}

interface ResponseContentItem {
  type?: string;
  text?: string;
  refusal?: string;
}

interface ResponseOutputItem {
  type?: string;
  content?: ResponseContentItem[];
}

/** Extract the JSON text from a raw Responses API payload. */
export function parseOpenAIResponse(payload: unknown): unknown {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('openai: malformed response');
  }
  const output = (payload as { output?: ResponseOutputItem[] }).output;
  if (!Array.isArray(output)) throw new Error('openai: response has no output');

  for (const item of output) {
    if (item.type !== 'message' || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (content.type === 'refusal') throw new Error('openai: request refused');
      if (content.type === 'output_text' && typeof content.text === 'string') {
        return JSON.parse(content.text);
      }
    }
  }
  throw new Error('openai: response has no output text');
}

/**
 * Both GPT-5.6 tasks share one OpenAI Responses API call; only their input and
 * JSON schema differ. Structured Outputs prevents missing keys and invalid
 * enums at the network boundary. Client sanitizers remain in place as defense
 * in depth because model output must never be trusted implicitly.
 */
async function callOpenAI(
  input: unknown[],
  maxOutputTokens: number,
  schemaName: string,
  schema: Record<string, unknown>,
): Promise<unknown> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not configured');

  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? 'gpt-5.6',
      input,
      max_output_tokens: maxOutputTokens,
      reasoning: { effort: 'low' },
      text: {
        verbosity: 'low',
        format: { type: 'json_schema', name: schemaName, strict: true, schema },
      },
    }),
  });
  if (!res.ok) throw new Error(`openai: HTTP ${res.status}`);
  return parseOpenAIResponse(await res.json());
}

function verifyMessages(image: string, nMarks: number): unknown[] {
  return [
    {
      role: 'system',
      content:
        'You are auditing climbing-hold detections. The image shows a climbing wall ' +
        `with ${nMarks} numbered marks on detected candidates. For EACH mark judge: ` +
        'is it really a climbing hold, and what type (jug/crimp/sloper/pocket/pinch/volume/unknown)? ' +
        'Also report cells of a 4x4 grid (cellX,cellY in 0..3, origin top-left) that contain ' +
        'obvious holds with NO mark on them. Never invent coordinates. Respond as JSON: ' +
        '{"verdicts":[{"mark":n,"keep":bool,"holdType":"..."}],"missedCells":[{"cellX":n,"cellY":n}]}',
    },
    {
      role: 'user',
      content: [
        { type: 'input_text', text: `Audit all ${nMarks} marks.` },
        { type: 'input_image', image_url: image, detail: 'high' },
      ],
    },
  ];
}

const verifySchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['verdicts', 'missedCells'],
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['mark', 'keep', 'holdType'],
        properties: {
          mark: { type: 'integer', minimum: 1 },
          keep: { type: 'boolean' },
          holdType: {
            type: 'string',
            enum: ['jug', 'crimp', 'sloper', 'pocket', 'pinch', 'volume', 'unknown'],
          },
        },
      },
    },
    missedCells: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['cellX', 'cellY'],
        properties: {
          cellX: { type: 'integer', minimum: 0, maximum: 3 },
          cellY: { type: 'integer', minimum: 0, maximum: 3 },
        },
      },
    },
  },
};

const coachSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['coachings'],
  properties: {
    coachings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['step', 'coaching'],
        properties: {
          step: { type: 'integer', minimum: 1 },
          coaching: { type: 'string' },
        },
      },
    },
  },
};

// ── HTTP handler (Vercel node signature) ────────────────────────────────────

interface Req {
  method?: string;
  body?: { task?: string; image?: string; nMarks?: number; system?: string; user?: string };
}
interface Res {
  status(code: number): Res;
  json(body: unknown): void;
}

export default async function handler(req: Req, res: Res): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }
  const { task, image, nMarks, system, user } = req.body ?? {};

  // Payload clamp BEFORE any paid call. 2.5MB ≈ a 1280px JPEG with headroom;
  // anything bigger means the client forgot to downscale — reject loudly so
  // the bug is found in dev, not discovered as a bill.
  if (image && image.length > 2_500_000) {
    res.status(413).json({ error: 'image too large — downscale to ≤1280px before calling' });
    return;
  }

  const cacheKey = hashKey(JSON.stringify(req.body));
  if (cache.has(cacheKey)) {
    res.status(200).json(cache.get(cacheKey));
    return;
  }

  try {
    let out: unknown;
    if (task === 'detect' && image) {
      out = await handleDetect(image);
    } else if (task === 'verify' && image && typeof nMarks === 'number') {
      out = await callOpenAI(verifyMessages(image, nMarks), 2000, 'hold_verification', verifySchema);
    } else if (task === 'coach' && system && user) {
      out = await callOpenAI(
        [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        1500,
        'grounded_coaching',
        coachSchema,
      );
    } else {
      res.status(400).json({ error: `unknown or malformed task: ${task}` });
      return;
    }
    cache.set(cacheKey, out);
    res.status(200).json(out);
  } catch (err) {
    // Client fusion code treats any failure as "stage absent" — return the
    // message to make dev debugging possible, but never the stack or env.
    res.status(502).json({ error: err instanceof Error ? err.message : 'upstream failure' });
  }
}
