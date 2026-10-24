package com.animequotes.wallpaper.wallpaper

import android.service.wallpaper.WallpaperService
import android.view.SurfaceHolder
import android.media.MediaPlayer
import android.os.Handler
import android.os.Looper
import java.io.File

/** Plays a locally cached, rights-cleared MP4 as a muted looping live wallpaper. */
class VideoWallpaperService : WallpaperService() {
    override fun onCreateEngine(): Engine = VideoEngine()

    private inner class VideoEngine : Engine() {
        private var player: MediaPlayer? = null
        private var visibleNow = false
        private val mainHandler = Handler(Looper.getMainLooper())

        override fun onVisibilityChanged(visible: Boolean) {
            visibleNow = visible
            if (visible) startPlayerIfReady() else player?.pauseSafely()
        }

        override fun onSurfaceCreated(holder: SurfaceHolder) {
            super.onSurfaceCreated(holder)
            startPlayerIfReady()
        }

        override fun onSurfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
            super.onSurfaceChanged(holder, format, width, height)
            if (visibleNow) startPlayerIfReady()
        }

        override fun onSurfaceDestroyed(holder: SurfaceHolder) {
            visibleNow = false
            releasePlayer()
            super.onSurfaceDestroyed(holder)
        }

        override fun onDestroy() {
            releasePlayer()
            super.onDestroy()
        }

        private fun startPlayerIfReady() {
            if (!visibleNow || !surfaceHolder.surface.isValid || player != null) return
            val path = getSharedPreferences("anime_quotes_prefs", MODE_PRIVATE)
                .getString("live_wallpaper_path", null) ?: return
            val file = File(path)
            if (!file.isFile || file.length() == 0L) return

            val mediaPlayer = MediaPlayer()
            player = mediaPlayer
            try {
                mediaPlayer.setDataSource(file.absolutePath)
                mediaPlayer.setSurface(surfaceHolder.surface)
                mediaPlayer.isLooping = true
                mediaPlayer.setVolume(0f, 0f)
                mediaPlayer.setOnPreparedListener { prepared ->
                    if (visibleNow) prepared.start()
                }
                mediaPlayer.setOnErrorListener { _, _, _ ->
                    releasePlayer()
                    true
                }
                mediaPlayer.prepareAsync()
            } catch (_: Exception) {
                releasePlayer()
            }
        }

        private fun releasePlayer() {
            val current = player ?: return
            player = null
            try { current.setOnPreparedListener(null) } catch (_: Exception) { }
            try { current.stop() } catch (_: Exception) { }
            try { current.reset() } catch (_: Exception) { }
            try { current.release() } catch (_: Exception) { }
        }
    }

    private fun MediaPlayer.pauseSafely() {
        try { if (isPlaying) pause() } catch (_: Exception) { }
    }
}
