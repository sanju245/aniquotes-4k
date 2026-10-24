#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_TARGET = 900;
const MAX_IMAGE_BYTES = 80 * 1024 * 1024;
const DEFAULT_SIZE = { width: 2160, height: 3840 };

const SUBJECTS = [
  "a lone apprentice astronomer", "a quiet shrine caretaker", "a courier with a red scarf", "a young botanist", "a masked stage performer",
  "a student carrying a sketchbook", "a tiny paper-crane maker", "a wandering tea seller", "a gentle forest guardian", "a rooftop violinist",
  "a traveler with a lantern", "a library apprentice", "a mountain climber", "a young mechanic", "a fox-like spirit made of light",
  "a night train conductor", "a baker before sunrise", "a kite maker", "a sea-glass collector", "a stargazing siblings duo",
  "a painter in a raincoat", "a bicycle messenger", "a sleepy cloud gardener", "a moon festival drummer", "a snowfield photographer",
  "a small robot learning to bloom", "a fisherman on a quiet pier", "a paper boat explorer", "a ceramic artist", "a traveler resting beneath a tree",
];
const SETTINGS = [
  "a lantern-lit hillside town", "a floating garden above the clouds", "a misty cedar path", "a seaside railway platform", "an old bookshop at dusk",
  "a glass greenhouse in the rain", "a mountain lake under stars", "a quiet rooftop above the city", "a field of silver grass", "a warm train cabin",
  "a hidden waterfall grotto", "a narrow street after rainfall", "a moonlit bamboo grove", "a snowy village bridge", "a flower market at dawn",
  "a tiny observatory", "a cliffside lighthouse", "a peaceful harbor of paper boats", "a sunlit art classroom", "a festival avenue of wishes",
  "a desert garden under a blue moon", "a forest clearing with fireflies", "a coastal cliff in spring", "a tram stop in autumn", "a starlit orchard",
  "a hilltop windmill", "a quiet shrine courtyard", "a cloud-filled canyon", "a pastel city canal", "a meadow after a summer storm",
];
const PALETTES = ["indigo and amber", "teal and peach", "lavender and silver", "emerald and gold", "coral and midnight blue", "soft jade and cream", "cobalt and rose", "plum and warm ivory", "icy blue and copper", "moss green and sunset orange", "rose pink and charcoal", "saffron and deep violet"];
const LIGHTING = ["soft dawn rays", "a gentle crescent moon glow", "warm window light", "scattered firefly light", "a veil of luminous fog", "reflected city lights"];
const COMPOSITIONS = ["a calm centered silhouette with generous open sky", "a low viewpoint with dramatic vertical depth", "a framed scene seen through branches", "a close foreground detail and distant layered scenery", "a graceful diagonal path leading toward the horizon", "a balanced asymmetrical composition with clear negative space"];

export function parseEnvFile(source) {
  const values = {};
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[2].startsWith("#")) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}

export function parseArgs(argv) {
  const options = { mode: "dry-run" };
  let modeSelected = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (["--dry-run", "--smoke", "--batch"].includes(arg)) {
      if (modeSelected) throw new Error("Choose only one mode: --dry-run, --smoke, or --batch.");
      modeSelected = true;
      options.mode = arg.slice(2);
    } else if (["--job-id", "--confirm-target", "--max-cost-usd"].includes(arg)) {
      const value = argv[++i];
      if (!value || value.startsWith("--")) throw new Error(`${arg} needs a value.`);
      const key = { "--job-id": "jobId", "--confirm-target": "confirmTarget", "--max-cost-usd": "maxCostUsd" }[arg];
      options[key] = key === "jobId" ? value : Number(value);
      if (typeof options[key] === "number" && (!Number.isFinite(options[key]) || options[key] <= 0)) throw new Error(`${arg} must be a positive number.`);
    } else if (arg === "--retry-interrupted") options.retryInterrupted = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

export function makePrompt(index) {
  const at = (list, stride) => list[(index * stride) % list.length];
  const variation = String(index + 1).padStart(4, "0");
  return `Original anime-inspired wallpaper study ${variation}: ${at(SUBJECTS, 1)} in ${at(SETTINGS, 7)}. Use a distinctive ${at(PALETTES, 5)} palette, ${at(LIGHTING, 7)}, and ${at(COMPOSITIONS, 5)}. Refined hand-painted illustration, expressive but original character design, beautiful environmental detail, polished premium mobile wallpaper, portrait 9:16 framing, crisp edges, no text, no logos, no watermark, no recognizable existing franchise or copyrighted character.`;
}

export function inspectImage(bytes) {
  if (bytes.length < 24) return { mimeType: null, width: null, height: null, validContainer: false };
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    let offset = 8;
    let hasHeader = false;
    let hasData = false;
    let hasEnd = false;
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset);
      const end = offset + 12 + length;
      if (end > bytes.length) break;
      const type = bytes.toString("ascii", offset + 4, offset + 8);
      if (type === "IHDR" && length === 13) hasHeader = true;
      if (type === "IDAT" && length > 0) hasData = true;
      if (type === "IEND" && length === 0) { hasEnd = end === bytes.length; break; }
      offset = end;
    }
    return { mimeType: "image/png", width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), validContainer: hasHeader && hasData && hasEnd };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1];
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
      const length = bytes.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 7) {
        const endsCorrectly = bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9;
        return { mimeType: "image/jpeg", height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7), validContainer: endsCorrectly };
      }
      if (length < 2) break;
      offset += 2 + length;
    }
  }
  if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    const kind = bytes.toString("ascii", 12, 16);
    if (kind === "VP8X" && bytes.length >= 30) {
      const width = 1 + bytes.readUIntLE(24, 3);
      const height = 1 + bytes.readUIntLE(27, 3);
      return { mimeType: "image/webp", width, height, validContainer: bytes.readUInt32LE(4) + 8 === bytes.length };
    }
    return { mimeType: "image/webp", width: null, height: null, validContainer: bytes.readUInt32LE(4) + 8 === bytes.length && ["VP8 ", "VP8L"].includes(kind) };
  }
  return { mimeType: null, width: null, height: null, validContainer: false };
}

export function imageQuality(bytes, target, priorHashes = new Set()) {
  const inspected = inspectImage(bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const checks = {
    supportedImage: Boolean(inspected.mimeType),
    completeContainer: inspected.validContainer,
    withinStorageLimit: bytes.length > 0 && bytes.length <= MAX_IMAGE_BYTES,
    portrait: Boolean(inspected.width && inspected.height && inspected.height > inspected.width),
    targetResolution: inspected.width === target.width && inspected.height === target.height,
    notExactDuplicate: !priorHashes.has(sha256),
  };
  return { ...inspected, sha256, sizeBytes: bytes.length, checks, passed: Object.values(checks).every(Boolean) };
}

async function loadProjectEnv() {
  const envPath = path.join(PROJECT_DIR, "admin", ".env.local");
  try {
    const parsed = parseEnvFile(await readFile(envPath, "utf8"));
    for (const [key, value] of Object.entries(parsed)) if (process.env[key] === undefined) process.env[key] = value;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function configFromEnv() {
  const base = process.env.NINE_ROUTER_BASE_URL || "http://localhost:20128/v1";
  const baseUrl = new URL(base);
  if (!/^https?:$/.test(baseUrl.protocol) || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) throw new Error("NINE_ROUTER_BASE_URL must be an HTTP(S) base URL without embedded credentials or query parameters.");
  const width = Number(process.env.WALLPAPER_TARGET_WIDTH || DEFAULT_SIZE.width);
  const height = Number(process.env.WALLPAPER_TARGET_HEIGHT || DEFAULT_SIZE.height);
  const targetCount = Number(process.env.WALLPAPER_TARGET_COUNT || DEFAULT_TARGET);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error("WALLPAPER_TARGET_WIDTH and WALLPAPER_TARGET_HEIGHT must be positive integers.");
  if (!Number.isInteger(targetCount) || targetCount <= 0 || targetCount > 10000) throw new Error("WALLPAPER_TARGET_COUNT must be an integer from 1 to 10000.");
  const driver = (process.env.WALLPAPER_STORAGE_DRIVER || "local").toLowerCase();
  if (!new Set(["local", "supabase"]).has(driver)) throw new Error("WALLPAPER_STORAGE_DRIVER must be local or supabase.");
  return {
    baseUrl: baseUrl.toString().replace(/\/$/, ""),
    apiKey: process.env.NINE_ROUTER_API_KEY || "",
    imageModel: process.env.NINE_ROUTER_IMAGE_MODEL || "",
    textModel: process.env.NINE_ROUTER_TEXT_MODEL || "",
    target: { width, height },
    targetCount,
    driver,
    bucket: process.env.SUPABASE_STORAGE_BUCKET || "wallpaper-assets",
    supabaseUrl: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    costPerImage: parseOptionalPositive(process.env.NINE_ROUTER_COST_PER_IMAGE_USD),
    maxCost: parseOptionalPositive(process.env.WALLPAPER_JOB_MAX_COST_USD),
  };
}

function parseOptionalPositive(value) {
  if (!value?.trim()) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error("Cost environment values must be positive numbers in USD.");
  return number;
}

function authHeaders(config, extra = {}) {
  return { ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}), ...extra };
}

async function readJson(url, config, timeoutMs = 12000) {
  const response = await fetch(url, { headers: authHeaders(config), signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`9Router request failed (${response.status}) for ${new URL(url).pathname}.`);
  return response.json();
}

async function discover(config) {
  const list = await readJson(new URL("models/image", `${config.baseUrl}/`).toString(), config);
  const imageModels = Array.isArray(list?.data) ? list.data : [];
  const details = await Promise.all(imageModels.map(async (model) => {
    try {
      const url = new URL("models/info", `${config.baseUrl}/`);
      url.searchParams.set("id", model.id);
      return await readJson(url.toString(), config);
    } catch { return null; }
  }));
  const eligible = details.filter((model) => model && model.kind === "image" && Array.isArray(model.capabilities) && model.capabilities.includes("textToImage"));
  let selected = null;
  if (config.imageModel) selected = eligible.find((model) => model.id === config.imageModel) || null;
  else if (eligible.length === 1) selected = eligible[0];
  const textInfo = config.textModel ? await (async () => {
    try { const url = new URL("models/info", `${config.baseUrl}/`); url.searchParams.set("id", config.textModel); return await readJson(url.toString(), config); } catch { return null; }
  })() : null;
  return { advertisedImageModels: imageModels.map((model) => model.id), eligible, selected, textInfo };
}

// Batch orchestration depends on this small provider contract rather than
// embedding 9Router request details into job/resume logic.
export function createImageProvider(config) {
  return {
    id: "9router",
    discover: () => discover(config),
    generate: (selectedModel, prompt) => requestImage(config, selectedModel, prompt),
  };
}

function printHelp() {
  console.log(`AniQuotes 4K wallpaper pipeline\n\n` +
    `  npm run wallpapers:check --prefix admin       Read-only config/model check\n` +
    `  npm run wallpapers:smoke --prefix admin       Generate exactly one smoke image\n` +
    `  node tools/wallpaper-pipeline.mjs --batch --confirm-target 900 --max-cost-usd 25\n` +
    `  node tools/wallpaper-pipeline.mjs --batch --confirm-target 900 --max-cost-usd 25 --job-id JOB_ID\n\n` +
    `Batch mode requires a known per-image estimate and a maximum USD budget. Images remain drafts; nothing is published.`);
}

function outputConfigSummary(config, discovery) {
  const selected = discovery.selected;
  const missing = [];
  if (!config.imageModel) missing.push("NINE_ROUTER_IMAGE_MODEL");
  if (!config.apiKey) missing.push("NINE_ROUTER_API_KEY");
  if (!selected) missing.push("a configured model confirmed as textToImage");
  if (config.driver === "supabase" && (!config.supabaseUrl || !config.supabaseServiceKey)) missing.push("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  console.log(JSON.stringify({
    router: config.baseUrl,
    routerReachable: true,
    advertisedImageModels: discovery.advertisedImageModels,
    selectedModel: selected ? { id: selected.id, kind: selected.kind, endpoint: selected.endpoint, capabilities: selected.capabilities, sizeOptions: selected.sizeOptions || selected.options?.size || null } : null,
    textModel: config.textModel ? { id: config.textModel, detectedKind: discovery.textInfo?.kind || "unverified" } : null,
    apiKeyConfigured: Boolean(config.apiKey),
    requestedResolution: `${config.target.width}x${config.target.height}`,
    targetCount: config.targetCount,
    storageDriver: config.driver,
    storageBucket: config.driver === "supabase" ? config.bucket : null,
    costPerImageEstimateUsd: config.costPerImage,
    jobMaxCostUsd: config.maxCost,
    generationReady: missing.length === 0,
    blockers: missing,
  }, null, 2));
  return missing;
}

function slugJobId(input) {
  const id = input || `job-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(id)) throw new Error("Job ID may contain only letters, numbers, dashes, and underscores (max 80 characters).");
  return id;
}

function buildManifest(jobId, target, dimensions, model) {
  return {
    schemaVersion: 1,
    jobId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    requestedResolution: dimensions,
    targetCount: target,
    model,
    storageDriver: process.env.WALLPAPER_STORAGE_DRIVER || "local",
    state: "running",
    items: Array.from({ length: target }, (_, i) => ({
      assetId: `normal-${String(i + 1).padStart(4, "0")}`,
      index: i + 1,
      prompt: makePrompt(i),
      promptSha256: createHash("sha256").update(makePrompt(i)).digest("hex"),
      status: "planned",
      attempts: 0,
      estimatedCostUsd: parseOptionalPositive(process.env.NINE_ROUTER_COST_PER_IMAGE_USD),
      actualCostUsd: null,
      quality: null,
      outputPath: null,
      error: null,
    })),
  };
}

async function writeManifest(filePath, manifest) {
  manifest.updatedAt = new Date().toISOString();
  const temp = `${filePath}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "w" });
  await rename(temp, filePath);
}

function generationEndpoint(config, selected) {
  const endpoint = selected.endpoint;
  if (typeof endpoint !== "string" || !endpoint.startsWith("/v1/images/generations")) throw new Error("Discovered image model does not expose the documented 9Router image-generation route.");
  const origin = new URL(config.baseUrl).origin;
  return new URL(endpoint, origin).toString();
}

async function extractImage(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.startsWith("image/")) {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_IMAGE_BYTES) throw new Error("Image response exceeds 80 MiB storage limit.");
    return { bytes, mimeType: contentType.split(";")[0], usage: null };
  }
  const payload = await response.json();
  const item = payload?.data?.[0];
  let bytes;
  let mimeType = null;
  if (typeof item?.b64_json === "string") bytes = Buffer.from(item.b64_json, "base64");
  else if (typeof item?.url === "string") {
    const url = new URL(item.url);
    if (!new Set(["http:", "https:"]).has(url.protocol)) throw new Error("9Router returned a non-HTTP image URL.");
    const imageResponse = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!imageResponse.ok) throw new Error(`Could not download generated image (${imageResponse.status}).`);
    mimeType = imageResponse.headers.get("content-type")?.split(";")[0] || null;
    const raw = Buffer.from(await imageResponse.arrayBuffer());
    if (raw.length > MAX_IMAGE_BYTES) throw new Error("Downloaded image exceeds 80 MiB storage limit.");
    bytes = raw;
  } else throw new Error("9Router response did not contain image bytes or a URL.");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error("9Router returned an empty or oversized image.");
  return { bytes, mimeType, usage: payload.usage || payload.cost || null };
}

async function requestImage(config, selected, prompt) {
  const url = generationEndpoint(config, selected);
  const response = await fetch(url, {
    method: "POST",
    headers: authHeaders(config, { "Content-Type": "application/json" }),
    body: JSON.stringify({ model: selected.id, prompt, n: 1, size: `${config.target.width}x${config.target.height}`, response_format: "b64_json" }),
    signal: AbortSignal.timeout(180000),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 500);
    throw new Error(`9Router image request failed (${response.status})${detail ? `: ${detail}` : "."}`);
  }
  return extractImage(response);
}

function extensionFor(mimeType, bytes) {
  const detected = inspectImage(bytes).mimeType || mimeType;
  return detected === "image/png" ? "png" : detected === "image/jpeg" ? "jpg" : detected === "image/webp" ? "webp" : "bin";
}

async function saveToSupabase(config, bytes, mimeType, storagePath) {
  const base = new URL(config.supabaseUrl);
  const url = new URL(`/storage/v1/object/${encodeURIComponent(config.bucket)}/${storagePath.split("/").map(encodeURIComponent).join("/")}`, base);
  const response = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${config.supabaseServiceKey}`, apikey: config.supabaseServiceKey, "Content-Type": mimeType || "application/octet-stream", "x-upsert": "false" }, body: bytes, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Supabase Storage upload failed (${response.status}); image remains in local draft storage.`);
  return storagePath;
}

// Storage is separate from generation so local disk, Supabase Storage, or a
// future object-store adapter can be selected without changing job logic.
export function createStorageAdapter(config) {
  return {
    driver: config.driver,
    async save({ bytes, mimeType, jobId, jobDir, filename, attempt }) {
      let localPath = path.join(jobDir, filename);
      try { await writeFile(localPath, bytes, { flag: "wx" }); }
      catch (error) {
        if (error?.code !== "EEXIST") throw error;
        const extension = path.extname(filename);
        const stem = path.basename(filename, extension);
        const alternate = `${stem}-attempt-${attempt}${extension}`;
        localPath = path.join(jobDir, alternate);
        await writeFile(localPath, bytes, { flag: "wx" });
      }
      const result = { outputPath: path.relative(PROJECT_DIR, localPath).replaceAll("\\", "/"), remotePath: null, uploadError: null };
      if (config.driver === "supabase") {
        try { result.remotePath = await saveToSupabase(config, bytes, mimeType, `${jobId}/${filename}`); }
        catch (error) { result.uploadError = error instanceof Error ? error.message : "Storage upload failed"; }
      }
      return result;
    },
  };
}

async function acquireLock(lockPath) {
  try { return await open(lockPath, "wx"); }
  catch (error) { if (error?.code === "EEXIST") throw new Error("This job appears to be running already. If it is stale, remove its lock file after confirming no generator is active."); throw error; }
}

async function runGeneration(config, provider, storage, selected, options) {
  if (!config.apiKey) throw new Error("NINE_ROUTER_API_KEY is missing; no image generation request was sent.");
  if (!config.imageModel || selected.id !== config.imageModel) throw new Error("NINE_ROUTER_IMAGE_MODEL must explicitly match a discovered textToImage model before generation.");
  if (config.driver === "supabase" && (!config.supabaseUrl || !config.supabaseServiceKey)) throw new Error("Supabase storage needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  const target = options.mode === "smoke" ? 1 : config.targetCount;
  if (options.mode === "batch") {
    const maxCost = options.maxCostUsd || config.maxCost;
    if (options.confirmTarget !== target) throw new Error(`Batch blocked. Pass --confirm-target ${target} to confirm the exact target.`);
    if (!config.costPerImage) throw new Error("Batch blocked: set NINE_ROUTER_COST_PER_IMAGE_USD from the provider's current price sheet.");
    if (!maxCost) throw new Error("Batch blocked: pass --max-cost-usd or set WALLPAPER_JOB_MAX_COST_USD.");
    const estimate = target * config.costPerImage;
    if (estimate > maxCost) throw new Error(`Batch blocked: estimated cost $${estimate.toFixed(4)} exceeds the $${maxCost.toFixed(4)} maximum.`);
  }
  const jobId = slugJobId(options.jobId || (options.mode === "smoke" ? `smoke-${Date.now()}` : undefined));
  const jobDir = path.join(PROJECT_DIR, "generated", "wallpapers", jobId);
  await mkdir(jobDir, { recursive: true });
  const lock = await acquireLock(path.join(jobDir, "job.lock"));
  try {
    const manifestPath = path.join(jobDir, "manifest.json");
    let manifest;
    try { manifest = JSON.parse(await readFile(manifestPath, "utf8")); }
    catch (error) {
      if (error?.code !== "ENOENT") throw new Error("Existing job manifest is invalid; preserved it and stopped.");
      manifest = buildManifest(jobId, target, config.target, selected.id);
      await writeManifest(manifestPath, manifest);
    }
    if (manifest.targetCount !== target || manifest.model !== selected.id || manifest.requestedResolution.width !== config.target.width || manifest.requestedResolution.height !== config.target.height) throw new Error("Resume configuration differs from the saved job; use its original target, model, and resolution.");
    const priorInterrupted = manifest.items.filter((item) => item.status === "running");
    if (priorInterrupted.length) {
      for (const item of priorInterrupted) { item.status = "interrupted_unknown"; item.error = "Previous process stopped after request started; outcome may have been billed."; }
      await writeManifest(manifestPath, manifest);
    }
    if (priorInterrupted.length && !options.retryInterrupted) throw new Error(`${priorInterrupted.length} item(s) were interrupted mid-request; use --retry-interrupted only if you accept possible duplicate provider charges.`);
    const priorHashes = new Set(manifest.items.filter((item) => item.quality?.sha256).map((item) => item.quality.sha256));
    const maxCost = options.maxCostUsd || config.maxCost;
    manifest.state = "running";
    await writeManifest(manifestPath, manifest);
    let generated = 0;
    for (const item of manifest.items) {
      if (["completed", "needs_review"].includes(item.status)) continue;
      if (item.status === "interrupted_unknown" && !options.retryInterrupted) continue;
      let outcome;
      while (!outcome && item.attempts < 3) {
        const estimatedRequestsAfterThis = manifest.items.reduce((sum, entry) => sum + entry.attempts, 0) + 1;
        if (options.mode === "batch" && estimatedRequestsAfterThis * config.costPerImage > maxCost) {
          manifest.state = "cost_limit_reached";
          await writeManifest(manifestPath, manifest);
          console.log(`Stopping at the configured cost ceiling. Estimated request exposure: $${((estimatedRequestsAfterThis - 1) * config.costPerImage).toFixed(4)} of $${maxCost.toFixed(4)}.`);
          break;
        }
        item.status = "running";
        item.error = null;
        item.attempts += 1;
        await writeManifest(manifestPath, manifest);
        try { outcome = await provider.generate(selected, item.prompt); }
        catch (error) {
          item.error = error instanceof Error ? error.message : "Unknown image-generation error";
          item.status = "failed";
          await writeManifest(manifestPath, manifest);
          if (item.attempts < 3) await new Promise((resolve) => setTimeout(resolve, item.attempts * 1500));
        }
      }
      if (manifest.state === "cost_limit_reached") break;
      if (!outcome) { item.status = "failed"; await writeManifest(manifestPath, manifest); continue; }
      const quality = imageQuality(outcome.bytes, config.target, priorHashes);
      priorHashes.add(quality.sha256);
      item.quality = quality;
      item.actualCostUsd = typeof outcome.usage?.cost_usd === "number" ? outcome.usage.cost_usd : (typeof outcome.usage?.cost === "number" ? outcome.usage.cost : null);
      const extension = extensionFor(outcome.mimeType, outcome.bytes);
      const filename = `${item.assetId}.${extension}`;
      let stored;
      try { stored = await storage.save({ bytes: outcome.bytes, mimeType: quality.mimeType, jobId, jobDir, filename, attempt: item.attempts }); }
      catch (error) {
        stored = { outputPath: null, remotePath: null, uploadError: `Generated image could not be saved: ${error instanceof Error ? error.message : "storage error"}` };
      }
      item.outputPath = stored.outputPath;
      if (stored.remotePath) item.supabaseStoragePath = stored.remotePath;
      if (stored.uploadError) item.error = stored.uploadError;
      if (quality.passed && !stored.uploadError) {
        item.status = "completed";
      } else item.status = "needs_review";
      generated += 1;
      await writeManifest(manifestPath, manifest);
      if (options.mode === "batch") {
        const recordedActualCost = manifest.items.reduce((sum, entry) => sum + (entry.actualCostUsd || 0), 0);
        if (recordedActualCost > maxCost) {
          manifest.state = "cost_limit_reached";
          await writeManifest(manifestPath, manifest);
          console.log(`Stopping after the provider-reported cost exceeded the configured ceiling ($${recordedActualCost.toFixed(4)} > $${maxCost.toFixed(4)}).`);
          break;
        }
      }
      if (options.mode === "smoke") break;
    }
    const completed = manifest.items.filter((item) => item.status === "completed").length;
    const needsReview = manifest.items.filter((item) => item.status === "needs_review").length;
    const failed = manifest.items.filter((item) => item.status === "failed").length;
    if (manifest.state !== "cost_limit_reached") manifest.state = completed === target ? "complete" : (failed || needsReview ? "attention_required" : "paused_or_incomplete");
    await writeManifest(manifestPath, manifest);
    console.log(JSON.stringify({ jobId, generatedThisRun: generated, completed, needsReview, failed, target, manifest: path.relative(PROJECT_DIR, manifestPath).replaceAll("\\", "/"), storageDriver: config.driver, actualCostRecordedUsd: manifest.items.reduce((sum, item) => sum + (item.actualCostUsd || 0), 0), actualCostUnknownRequestCount: manifest.items.reduce((sum, item) => sum + Math.max(0, item.attempts - (item.actualCostUsd === null ? 0 : 1)), 0) }, null, 2));
  } finally {
    await lock.close();
    const { unlink } = await import("node:fs/promises");
    await unlink(path.join(jobDir, "job.lock")).catch(() => {});
  }
}

export async function main(argv = process.argv.slice(2)) {
  await loadProjectEnv();
  const options = parseArgs(argv);
  if (options.help) { printHelp(); return 0; }
  const config = configFromEnv();
  const provider = createImageProvider(config);
  const storage = createStorageAdapter(config);
  const discovery = await provider.discover();
  const blockers = outputConfigSummary(config, discovery);
  if (options.mode === "dry-run") return blockers.length ? 2 : 0;
  if (blockers.length) throw new Error(`Generation blocked: ${blockers.join(", ")}. No image request was sent.`);
  if (options.mode === "smoke" && !config.imageModel) throw new Error("Smoke test requires NINE_ROUTER_IMAGE_MODEL to be explicitly configured.");
  if (options.mode === "batch" && !options.jobId) console.log("Starting explicitly confirmed batch. This can incur provider charges.");
  await runGeneration(config, provider, storage, discovery.selected, options);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(`Wallpaper pipeline stopped: ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  });
}
