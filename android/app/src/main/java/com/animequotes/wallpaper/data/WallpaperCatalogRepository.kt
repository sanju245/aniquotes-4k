package com.animequotes.wallpaper.data

import com.animequotes.wallpaper.BuildConfig
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant

/** Fetches the public, rights-cleared catalog through the Supabase Edge Function. */
object WallpaperCatalogRepository {
    fun isConfigured(): Boolean = BuildConfig.SUPABASE_URL.isNotBlank() && BuildConfig.SUPABASE_ANON_KEY.isNotBlank()

    fun fetchPublishedCatalog(): List<WallpaperItem> {
        if (!isConfigured()) return emptyList()
        var connection: HttpURLConnection? = null
        return try {
            val baseUrl = BuildConfig.SUPABASE_URL.trimEnd('/')
            connection = (URL("$baseUrl/functions/v1/wallpaper-catalog").openConnection() as HttpURLConnection).apply {
                connectTimeout = 12_000
                readTimeout = 20_000
                requestMethod = "GET"
                setRequestProperty("apikey", BuildConfig.SUPABASE_ANON_KEY)
                setRequestProperty("Authorization", "Bearer ${BuildConfig.SUPABASE_ANON_KEY}")
                setRequestProperty("Accept", "application/json")
            }
            if (connection.responseCode != HttpURLConnection.HTTP_OK) return emptyList()
            val payload = connection.inputStream.bufferedReader().use { it.readText() }
            val root = JSONObject(payload)
            val items = root.optJSONArray("items") ?: return emptyList()
            buildList {
                for (index in 0 until items.length()) {
                    val row = items.optJSONObject(index) ?: continue
                    val mediaTypeValue = row.optString("media_type", "static")
                    val section = row.optString("content_section", "normal")
                    val mediaType = when {
                        mediaTypeValue == "live" || section == "live" -> WallpaperMediaType.LIVE
                        section == "quote" -> WallpaperMediaType.QUOTE
                        else -> WallpaperMediaType.NORMAL
                    }
                    val rights = when (row.optString("rights_status")) {
                        "original_created" -> ArtworkRightsStatus.ORIGINAL_CREATED
                        "licensed_for_commercial_use" -> ArtworkRightsStatus.LICENSED_FOR_COMMERCIAL_USE
                        "public_domain_verified" -> ArtworkRightsStatus.PUBLIC_DOMAIN_VERIFIED
                        else -> ArtworkRightsStatus.UNREVIEWED
                    }
                    val publishedAt = row.optString("published_at", "")
                        .takeIf { it.isNotBlank() && it != "null" }
                        ?.let { runCatching { Instant.parse(it).epochSecond }.getOrDefault(0L) } ?: 0L
                    add(
                        WallpaperItem(
                            id = row.optString("id"),
                            title = row.optString("title", "Untitled wallpaper"),
                            characterName = row.optString("character_name", "").ifBlank { "Unknown character" },
                            seriesName = row.optString("series_name", "").ifBlank { null },
                            quote = row.optString("quote_text", "").ifBlank { null },
                            mediaType = mediaType,
                            rightsStatus = rights,
                            averageRating = row.optDouble("average_rating", 0.0),
                            ratingCount = row.optInt("rating_count", 0),
                            setCount = row.optInt("set_count", 0),
                            publishedAtEpoch = publishedAt,
                            imageUrl = row.optString("image_url", "").ifBlank { null }.takeUnless { it == "null" },
                            mediaUrl = row.optString("media_url", "").ifBlank { null }.takeUnless { it == "null" },
                            isNative4k = row.optBoolean("is_native_4k", false),
                        )
                    )
                }
            }
        } catch (_: Exception) {
            emptyList()
        } finally {
            connection?.disconnect()
        }
    }
}
