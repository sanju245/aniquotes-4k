# Colab + Drive wallpaper batch

This notebook is an optional second generation route for the project. It is separate from `tools/wallpaper-pipeline.mjs`; it does not change the local 9Router integration, upload anything to Supabase, create catalog rows, or publish assets.

Notebook: [`colab/aniquotes_4k_batch.ipynb`](../colab/aniquotes_4k_batch.ipynb)

## Outputs and limits

- 900 original anime-inspired SDXL stills are rendered at 768 × 1368 and resized with Lanczos plus a light sharpen to 2160 × 3840. They are labeled `upscaled_4k`, `native4k: false`; the notebook does not claim they were generated at native 4K.
- 80 live wallpaper drafts are MP4 loops derived from stills 1–80. FFmpeg applies a subtle sinusoidal zoom to a single still. The result is 1080 × 1920, 24 fps, 10 seconds, muted, and is not frame-by-frame AI video.
- Outputs and manifests are saved incrementally under `MyDrive/AniQuotes4K/wallpaper_jobs/<JOB_ID>/`.
- Every output remains a draft with `rightsStatus: unreviewed`. Review quality, similarity, and rights before any use. The automated duplicate check is exact SHA-256 matching plus cross-job prompt hashes; it is not perceptual similarity detection.
- This path does not publish or submit output to the app catalog.

## Start or resume

1. Open the notebook in Colab. For this private repository, use Colab's GitHub picker if it can access the repo; otherwise download the notebook from GitHub and upload it to Colab.
2. Select a T4 GPU runtime, run the dependency cell, then mount Google Drive. The install cell does not replace Colab's preinstalled CUDA PyTorch.
3. Review the SDXL model terms on Hugging Face. If access is gated, accept the terms and add an `HF_TOKEN` secret in Colab's Secrets panel. The notebook reads the secret only for model download; it is not saved in the notebook or Drive manifest.
4. Run the settings and preflight cells. The preflight checks for 900 unique prompts and creates the plan manifest without loading the image model or generating media.
5. Set `RUN_NORMAL = True` and run the still-image stage. The default cap is 25 stills per session. After a Colab disconnect or planned stop, reopen the notebook, keep `JOB_ID` and all generation settings unchanged, and run setup, preflight, and the still stage again.
6. Once stills 1–80 are complete, set `RUN_LIVE = True` and run the live stage. The default cap is 10 videos per session. The two stages can resume independently.
7. Check the final summary or open `manifest.csv` in Drive. Asset states include `planned`, `running`, `completed`, `needs_review`, `duplicate`, `blocked_source`, and `failed`. Per-item attempts and the last error are recorded. After fixing a cause, call `retry_failed('normal')` or `retry_failed('live')`; a retry resets the attempt count and preserves the prior error.

If a run was forcibly interrupted, an output that is already complete is reconciled from disk. A remaining `running` item is marked failed and can retry from its deterministic seed. The per-job lock prevents concurrent runs; only call `clear_stale_lock()` after confirming no Colab runtime is still using that job.

Keep the same job ID and generation settings when resuming. The manifest rejects a mismatch rather than silently mixing model, prompt, resolution, or inference settings. Use a new job ID for a deliberately different run. Session caps can change without invalidating the manifest.

## Colab runtime expectations

This notebook saves progress to Drive after each item and is designed to survive session restarts, but Colab free GPU sessions are temporary and can disconnect or enforce changing availability limits. They do not run continuously in the background and this is not a 24/7 worker. SDXL CPU offload reduces GPU memory use at a speed cost. The 900 stills will require many capped sessions; the 80 FFmpeg loops add CPU work. No runtime estimate is guaranteed.

The notebook has generation switches off by default. A real GPU run and generation of all assets have not been performed by repository validation; use a small capped run first and inspect its manifest and output before continuing.
