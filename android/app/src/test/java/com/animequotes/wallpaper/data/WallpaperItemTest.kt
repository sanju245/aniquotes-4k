package com.animequotes.wallpaper.data

import org.junit.Assert.assertEquals
import org.junit.Test

class WallpaperItemTest {
    @Test
    fun sampleCatalogHasUniqueIds() {
        assertEquals(sampleWallpapers.size, sampleWallpapers.map { it.id }.toSet().size)
    }

    @Test
    fun sampleQuotesAreNonBlank() {
        assert(sampleWallpapers.filter { it.mediaType == WallpaperMediaType.QUOTE }.all { !it.quote.isNullOrBlank() })
    }
}
