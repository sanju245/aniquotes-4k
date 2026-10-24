package com.animequotes.wallpaper.wallpaper

import android.app.WallpaperManager
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.animequotes.wallpaper.data.WallpaperItem
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

object WallpaperMediaActions {
    private const val MAX_IMAGE_BYTES = 80L * 1024 * 1024
    private const val MAX_VIDEO_BYTES = 500L * 1024 * 1024

    /** Downloads an MP4 to private app storage before launching Android's live-wallpaper picker. */
    suspend fun prepareLiveWallpaper(context: Context, mediaUrl: String, wallpaperId: String): String? = withContext(Dispatchers.IO) {
        val targetDir = File(context.filesDir, "live-wallpapers").apply { if (!exists()) mkdirs() }
        val target = File(targetDir, "${wallpaperId.filter { it.isLetterOrDigit() || it == '-' || it == '_' }}.mp4")
        var connection: HttpURLConnection? = null
        try {
            requireHttps(mediaUrl)
            connection = (URL(mediaUrl).openConnection() as HttpURLConnection).apply {
                connectTimeout = 15_000; readTimeout = 30_000; instanceFollowRedirects = false
                setRequestProperty("Accept", "video/mp4,video/*")
                connect()
            }
            if (connection.responseCode != HttpURLConnection.HTTP_OK) return@withContext "Couldn't load the live wallpaper (HTTP ${connection.responseCode})."
            if (connection.contentLengthLong > MAX_VIDEO_BYTES) return@withContext "This live wallpaper is too large to prepare safely (over 500 MB)."
            var total = 0L
            connection.inputStream.use { input ->
                FileOutputStream(target).use { output ->
                    val buffer = ByteArray(32 * 1024)
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        total += count
                        if (total > MAX_VIDEO_BYTES) return@withContext "This live wallpaper is too large to prepare safely (over 500 MB)."
                        output.write(buffer, 0, count)
                    }
                }
            }
            if (total == 0L) return@withContext "The live wallpaper file was empty."
            context.getSharedPreferences("anime_quotes_prefs", Context.MODE_PRIVATE).edit()
                .putString("live_wallpaper_path", target.absolutePath).apply()
            null
        } catch (e: Exception) {
            target.delete()
            "Couldn't prepare the live wallpaper: ${e.localizedMessage ?: "unexpected error"}."
        } finally { connection?.disconnect() }
    }

    fun openLiveWallpaperPicker(context: Context) {
        val intent = Intent(WallpaperManager.ACTION_CHANGE_LIVE_WALLPAPER).apply {
            putExtra(WallpaperManager.EXTRA_LIVE_WALLPAPER_COMPONENT,
                android.content.ComponentName(context, VideoWallpaperService::class.java))
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }

    /** Saves premium media to a user-visible media collection on Android 10+. */
    suspend fun downloadPremiumMedia(context: Context, item: WallpaperItem, mediaUrl: String): String? = withContext(Dispatchers.IO) {
        var connection: HttpURLConnection? = null
        var pendingUri: Uri? = null
        try {
            requireHttps(mediaUrl)
            val live = item.mediaType.name == "LIVE"
            val maxBytes = if (live) MAX_VIDEO_BYTES else MAX_IMAGE_BYTES
            val safeTitle = item.title.replace(Regex("[^A-Za-z0-9._ -]"), "_").trim().take(80).ifBlank { "AniQuotes4K-${UUID.randomUUID()}" }
            val mime = if (live) "video/mp4" else "image/jpeg"
            val collection = if (live) MediaStore.Video.Media.EXTERNAL_CONTENT_URI else MediaStore.Images.Media.EXTERNAL_CONTENT_URI
            val relativePath = if (live) "${Environment.DIRECTORY_MOVIES}/AniQuotes4K" else "${Environment.DIRECTORY_PICTURES}/AniQuotes4K"
            connection = (URL(mediaUrl).openConnection() as HttpURLConnection).apply {
                connectTimeout = 15_000; readTimeout = 30_000; instanceFollowRedirects = false
                setRequestProperty("Accept", if (live) "video/mp4,video/*" else "image/*")
                connect()
            }
            if (connection.responseCode != HttpURLConnection.HTTP_OK) return@withContext "Download failed (HTTP ${connection.responseCode}). Please retry."
            if (connection.contentLengthLong > maxBytes) return@withContext "This file is too large to download safely."

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, "$safeTitle.${if (live) "mp4" else "jpg"}")
                    put(MediaStore.MediaColumns.MIME_TYPE, mime)
                    put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath)
                    put(MediaStore.MediaColumns.IS_PENDING, 1)
                }
                pendingUri = context.contentResolver.insert(collection, values)
                    ?: return@withContext "Android couldn't create a file in your media library."
                val output = context.contentResolver.openOutputStream(pendingUri!!)
                    ?: return@withContext "Android couldn't open the destination file."
                var total = 0L
                connection.inputStream.use { input -> output.use { out ->
                    val buffer = ByteArray(32 * 1024)
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        total += count
                        if (total > maxBytes) throw IllegalStateException("File exceeded the safe size limit.")
                        out.write(buffer, 0, count)
                    }
                } }
                if (total == 0L) throw IllegalStateException("The downloaded file was empty.")
                context.contentResolver.update(pendingUri!!, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
            } else {
                val fallback = File(context.getExternalFilesDir(if (live) Environment.DIRECTORY_MOVIES else Environment.DIRECTORY_PICTURES), "AniQuotes4K").apply { mkdirs() }
                val target = File(fallback, "$safeTitle.${if (live) "mp4" else "jpg"}")
                var total = 0L
                connection.inputStream.use { input -> FileOutputStream(target).use { out ->
                    val buffer = ByteArray(32 * 1024)
                    while (true) { val count = input.read(buffer); if (count < 0) break; total += count; if (total > maxBytes) throw IllegalStateException("File exceeded the safe size limit."); out.write(buffer, 0, count) }
                } }
            }
            null
        } catch (e: Exception) {
            pendingUri?.let { runCatching { context.contentResolver.delete(it, null, null) } }
            "Download failed: ${e.localizedMessage ?: "unexpected error"}."
        } finally { connection?.disconnect() }
    }

    private fun requireHttps(value: String) {
        val uri = Uri.parse(value)
        require(uri.scheme.equals("https", true) && !uri.host.isNullOrBlank()) { "Media URLs must use HTTPS." }
    }
}
