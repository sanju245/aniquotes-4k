# 9Router wallpaper generation

The existing production manager is a task queue. This adds a separate, local-first image generation command that uses the configured 9Router image endpoint. It generates original anime-inspired scenes and does not publish them or create catalog rows.

## What the preflight checks

- `GET /v1/models/image` to discover advertised image models.
- `GET /v1/models/info?id=...` to require `kind: image` and the `textToImage` capability.
- The selected model's documented image-generation endpoint. A chat completion model is never treated as an image model.
- Required server-side credentials, requested size, storage driver, and configured cost limits.

9Router's image API documents `POST /v1/images/generations` with `model`, `prompt`, optional `size`, and image responses as a URL or base64. Model size handling varies by provider, so the pipeline checks the pixels in the returned file and does not label a smaller result native 4K. See the [9Router image API instructions](https://github.com/decolua/9router/blob/master/skills/9router-image/SKILL.md).

## Set up on the computer running 9Router

1. In the `admin` folder, copy `.env.example` to `.env.local`.
2. Keep `NINE_ROUTER_BASE_URL=http://localhost:20128/v1` when this same computer runs 9Router. For another host, use an address reachable from the machine that runs this command.
3. In the 9Router dashboard, copy a newly created/replaced API key into `NINE_ROUTER_API_KEY` in `.env.local`. A key previously pasted into chat should be revoked and replaced. Do not put a key in Android code, a `NEXT_PUBLIC_` variable, or a committed file.
4. Set `NINE_ROUTER_IMAGE_MODEL` to an ID shown by the image model discovery endpoint. The inspected router currently advertises `ag/gemini-3.1-flash-image` with `textToImage`; model catalogs can change, so run preflight to confirm it still exists.
5. `NINE_ROUTER_TEXT_MODEL` is optional and is not used to generate the image. Text-only model access is not treated as image-generation support.
6. Run `npm run wallpapers:check --prefix admin`. This performs read-only model discovery and reports missing configuration.
7. Only after a key and image model are configured, run `npm run wallpapers:smoke --prefix admin`. This requests one image and saves it as a draft under `generated/wallpapers/`.

The key is only read by this Node process on the computer where it runs. `localhost` in a hosted deployment refers to that hosted machine; it will not reach a personal computer's 9Router.

## Dry-run and batch safeguards

The generator defaults to dry-run. It does not start a batch unless the exact configured target and a maximum cost are confirmed:

```text
node tools/wallpaper-pipeline.mjs --batch --confirm-target 900 --max-cost-usd 25
```

The example ceiling above is only command syntax, not a price recommendation. Before a batch, set `NINE_ROUTER_COST_PER_IMAGE_USD` using current provider pricing and choose a `--max-cost-usd` you approve. Preflight blocks an unknown per-image cost or an estimate above the cap. The runtime also stops at the cap based on request estimates and provider-reported cost when available. When the provider does not return a cost, the manifest records cost as unknown; do not assume an unknown cost is zero.

For a resumable job, save the printed `jobId` and provide it on the next invocation:

```text
node tools/wallpaper-pipeline.mjs --batch --confirm-target 900 --max-cost-usd 25 --job-id JOB_ID
```

The job manifest is saved at `generated/wallpapers/JOB_ID/manifest.json`; completed and review-needed outputs are not generated again. Failed items can retry up to three image requests. If the process stops after an image request begins, the manifest records an unknown outcome. The default behavior avoids retrying that potentially billable item; `--retry-interrupted` explicitly allows it. A lock file prevents two processes from writing to one job at once.

## Output, QC, and storage

- Default `WALLPAPER_STORAGE_DRIVER=local` stores draft images and a manifest under ignored `generated/`.
- Optional `WALLPAPER_STORAGE_DRIVER=supabase` uploads drafts to the private `wallpaper-assets` bucket. It requires server-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; keep the service key out of browser and Android settings.
- The pipeline checks image signature/container structure, file-size limit, portrait orientation, exact requested pixel dimensions, and duplicate SHA-256 content. Results that fail are retained as `needs_review`, not counted as complete.
- These automated checks do not judge aesthetic quality, similarity between different image files, copyright ownership, or commercial rights. Review those manually. No generated image is published and no Supabase wallpaper row is created automatically.
- The private bucket's existing schema allows files up to 80 MiB. Keep generated images within that limit.

## Current validation result

The inspected local router responded at `http://localhost:20128/v1`. Its image catalog listed `ag/gemini-3.1-flash-image`; model info identified the image endpoint `/v1/images/generations` and `textToImage`. A live image request requires an API key and explicit image-model configuration in `admin/.env.local`. No generation should be attempted until those are configured.
