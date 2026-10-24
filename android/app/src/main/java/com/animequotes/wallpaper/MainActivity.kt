package com.animequotes.wallpaper

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.animequotes.wallpaper.ui.AnimeQuotesApp
import com.animequotes.wallpaper.ui.theme.AnimeQuotesTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            AnimeQuotesTheme {
                AnimeQuotesApp()
            }
        }
    }
}
