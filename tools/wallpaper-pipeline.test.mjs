import test from "node:test";
import assert from "node:assert/strict";
import { createImageProvider, imageQuality, inspectImage, makePrompt, parseArgs, parseEnvFile } from "./wallpaper-pipeline.mjs";

function pngHeader(width, height) {
  const chunk = (type, data) => {
    const bytes = Buffer.alloc(12 + data.length);
    bytes.writeUInt32BE(data.length, 0);
    bytes.write(type, 4, "ascii");
    data.copy(bytes, 8);
    return bytes;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header), chunk("IDAT", Buffer.from([1])), chunk("IEND", Buffer.alloc(0)),
  ]);
}

test("env parser keeps values and ignores comments", () => {
  assert.deepEqual(parseEnvFile('# comment\nexport BASE="http://localhost:20128/v1"\nIMAGE_MODEL=provider/image'), {
    BASE: "http://localhost:20128/v1",
    IMAGE_MODEL: "provider/image",
  });
});

test("argument parser defaults to dry run and accepts batch cost confirmation", () => {
  assert.equal(parseArgs([]).mode, "dry-run");
  assert.deepEqual(parseArgs(["--batch", "--confirm-target", "900", "--max-cost-usd", "30"]), {
    mode: "batch", confirmTarget: 900, maxCostUsd: 30,
  });
  assert.throws(() => parseArgs(["--smoke", "--batch"]), /Choose only one mode/);
});

test("prompt catalog is unique and excludes named franchise characters", () => {
  const prompts = Array.from({ length: 900 }, (_, index) => makePrompt(index));
  assert.equal(new Set(prompts).size, 900);
  assert.ok(prompts.every((prompt) => /no recognizable existing franchise/i.test(prompt)));
});

test("image provider exposes discovery and generation separately from job orchestration", () => {
  const provider = createImageProvider({ baseUrl: "http://localhost:20128/v1", apiKey: "", imageModel: "" });
  assert.equal(provider.id, "9router");
  assert.equal(typeof provider.discover, "function");
  assert.equal(typeof provider.generate, "function");
});

test("quality check verifies image signature, portrait orientation, exact pixels and duplicate hash", () => {
  const bytes = pngHeader(2160, 3840);
  assert.deepEqual(inspectImage(bytes), { mimeType: "image/png", width: 2160, height: 3840, validContainer: true });
  const good = imageQuality(bytes, { width: 2160, height: 3840 });
  assert.equal(good.passed, true);
  assert.equal(imageQuality(bytes, { width: 1024, height: 1536 }).checks.targetResolution, false);
  assert.equal(imageQuality(bytes, { width: 2160, height: 3840 }, new Set([good.sha256])).checks.notExactDuplicate, false);
  assert.equal(imageQuality(bytes.subarray(0, 24), { width: 2160, height: 3840 }).checks.completeContainer, false);
});
