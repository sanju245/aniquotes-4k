package com.animequotes.wallpaper.data

/** Catalog model used by the Android UI. Production catalog data will come from Supabase. */
data class WallpaperItem(
    val id: String,
    val title: String,
    val characterName: String,
    val seriesName: String?,
    val quote: String? = null,
    val mediaType: WallpaperMediaType = WallpaperMediaType.NORMAL,
    val rightsStatus: ArtworkRightsStatus = ArtworkRightsStatus.UNREVIEWED,
    val averageRating: Double = 0.0,
    val ratingCount: Int = 0,
    val setCount: Int = 0,
    val publishedAtEpoch: Long = 0L,
    val previewColors: List<Long> = listOf(0xFF29213A, 0xFF594071),
    /** HTTPS image URL or short-lived signed storage URL; null for UI-only sample entries. */
    val imageUrl: String? = null,
    /** Signed media URL for live video or static content, refreshed with the catalog. */
    val mediaUrl: String? = null,
    val isNative4k: Boolean = false,
    val isFavorite: Boolean = false
)

enum class WallpaperMediaType { NORMAL, QUOTE, LIVE }
enum class ArtworkRightsStatus {
    UNREVIEWED, ORIGINAL_CREATED, LICENSED_FOR_COMMERCIAL_USE, PUBLIC_DOMAIN_VERIFIED,
    PERMISSION_REQUIRED, DO_NOT_DISTRIBUTE
}
