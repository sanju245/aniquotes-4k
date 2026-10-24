package com.animequotes.wallpaper.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val BackgroundDark = Color(0xFF100F14)
val CardDark = Color(0xFF211F29)
val AccentGold = Color(0xFFFFC857)
val TextMuted = Color(0xFFB8B3C2)

private val AnimeColorScheme = darkColorScheme(
    primary = AccentGold,
    onPrimary = Color(0xFF241900),
    secondary = Color(0xFFE56B6F),
    background = BackgroundDark,
    surface = CardDark,
    onBackground = Color(0xFFF7F3FA),
    onSurface = Color(0xFFF7F3FA)
)

@Composable
fun AnimeQuotesTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = AnimeColorScheme,
        content = content
    )
}
