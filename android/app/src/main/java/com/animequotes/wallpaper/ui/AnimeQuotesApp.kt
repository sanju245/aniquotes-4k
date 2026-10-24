package com.animequotes.wallpaper.ui

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.app.WallpaperManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.animequotes.wallpaper.data.*
import com.animequotes.wallpaper.wallpaper.WallpaperMediaActions
import com.animequotes.wallpaper.billing.PlayBillingRepository
import com.animequotes.wallpaper.ui.theme.AccentGold
import com.animequotes.wallpaper.ui.theme.BackgroundDark
import com.animequotes.wallpaper.ui.theme.CardDark
import com.animequotes.wallpaper.ui.theme.TextMuted
import java.util.Locale

private enum class WallpaperDestination(val label: String, val flags: Int) {
    HOME("Home screen", WallpaperManager.FLAG_SYSTEM),
    LOCK("Lock screen", WallpaperManager.FLAG_LOCK),
    BOTH("Home and lock screens", WallpaperManager.FLAG_SYSTEM or WallpaperManager.FLAG_LOCK)
}

private enum class MainTab(val label: String) {
    DISCOVER("Discover"), BEST("Best"), NEW("New"), FAVORITE_CHARACTER("Favorite Character"), SETTINGS("Settings")
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AnimeQuotesApp() {
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences("anime_quotes_prefs", android.content.Context.MODE_PRIVATE) }
    var onboardingComplete by remember { mutableStateOf(prefs.getBoolean("onboarding_complete", false)) }
    var userName by remember { mutableStateOf(prefs.getString("user_name", "") ?: "") }
    var userEmail by remember { mutableStateOf(prefs.getString("user_email", "") ?: "") }
    var marketingConsent by remember { mutableStateOf(prefs.getBoolean("marketing_consent", false)) }
    var phoneBrand by remember { mutableStateOf(prefs.getString("phone_brand", Build.MANUFACTURER.replaceFirstChar { it.uppercase() }) ?: "") }
    var phoneModel by remember { mutableStateOf(prefs.getString("phone_model", Build.MODEL) ?: Build.MODEL) }
    var screenSpec by remember { mutableStateOf("") }
    var selectedCharacters by remember { mutableStateOf(prefs.getStringSet("favorite_characters", emptySet())?.toSet() ?: emptySet()) }
    var premium by remember { mutableStateOf(false) }
    var wallpaperItems by remember {
        mutableStateOf(sampleWallpapers.map { item ->
            item.copy(
                isFavorite = prefs.getBoolean("favorite_${item.id}", false),
                averageRating = prefs.getFloat("rating_avg_${item.id}", item.averageRating.toFloat()).toDouble(),
                ratingCount = prefs.getInt("rating_count_${item.id}", item.ratingCount),
                setCount = prefs.getInt("set_count_${item.id}", item.setCount)
            )
        })
    }
    var selectedTab by rememberSaveable { mutableStateOf(MainTab.DISCOVER) }
    var selectedType by rememberSaveable { mutableStateOf("All") }
    var search by rememberSaveable { mutableStateOf("") }
    var activeRatingItem by remember { mutableStateOf<WallpaperItem?>(null) }
    var notice by remember { mutableStateOf<String?>(null) }
    var showPremiumDialog by remember { mutableStateOf(false) }
    var pendingWallpaper by remember { mutableStateOf<WallpaperItem?>(null) }
    var isSettingWallpaper by remember { mutableStateOf(false) }
    var wallpaperDestination by remember { mutableStateOf(WallpaperDestination.HOME) }
    val scope = rememberCoroutineScope()
    val billingRepository = remember(context) {
        PlayBillingRepository(
            context = context,
            onStatus = { message -> notice = message },
            onPremiumChanged = { active ->
                premium = active
                if (active) showPremiumDialog = false
            }
        )
    }
    DisposableEffect(billingRepository) {
        billingRepository.connect()
        onDispose { billingRepository.close() }
    }

    val handleSet: (WallpaperItem) -> Unit = { item ->
        if (item.mediaType == WallpaperMediaType.LIVE) {
            scope.launch {
                isSettingWallpaper = true
                val refreshed = withContext(Dispatchers.IO) {
                    WallpaperCatalogRepository.fetchPublishedCatalog().firstOrNull { it.id == item.id }
                }
                val mediaUrl = refreshed?.mediaUrl ?: item.mediaUrl
                if (mediaUrl.isNullOrBlank()) {
                    notice = "This live wallpaper has no published video asset yet. Upload and publish a rights-cleared MP4 in the admin panel first."
                } else {
                    val error = WallpaperMediaActions.prepareLiveWallpaper(context, mediaUrl, item.id)
                    if (error != null) notice = error else {
                        try {
                            WallpaperMediaActions.openLiveWallpaperPicker(context)
                            notice = "Review the live wallpaper in Android's preview and tap Set wallpaper to apply it."
                        } catch (e: Exception) {
                            notice = "Android couldn't open the live wallpaper preview: ${e.localizedMessage ?: "unexpected error"}."
                        }
                    }
                }
                isSettingWallpaper = false
            }
        } else {
            pendingWallpaper = item
            wallpaperDestination = WallpaperDestination.HOME
        }
    }
    val handleDownload: (WallpaperItem) -> Unit = { item ->
        if (!premium) {
            showPremiumDialog = true
        } else {
            scope.launch {
                notice = "Preparing download…"
                val refreshed = withContext(Dispatchers.IO) {
                    WallpaperCatalogRepository.fetchPublishedCatalog().firstOrNull { it.id == item.id }
                }
                val url = if (item.mediaType == WallpaperMediaType.LIVE) refreshed?.mediaUrl ?: item.mediaUrl else refreshed?.imageUrl ?: item.imageUrl
                if (url.isNullOrBlank()) {
                    notice = "This wallpaper has no published media URL yet."
                } else {
                    notice = WallpaperMediaActions.downloadPremiumMedia(context, item, url)
                        ?: "Downloaded to ${if (item.mediaType == WallpaperMediaType.LIVE) "Movies" else "Pictures"}/AniQuotes4K."
                }
            }
        }
    }

    LaunchedEffect(Unit) {
        val metrics = context.resources.displayMetrics
        screenSpec = "${metrics.widthPixels} × ${metrics.heightPixels} px"
        // The sample catalog remains available offline. If Supabase is configured,
        // replace it with published, rights-cleared assets returned by the Edge Function.
        val cloudCatalog = withContext(Dispatchers.IO) { WallpaperCatalogRepository.fetchPublishedCatalog() }
        if (cloudCatalog.isNotEmpty()) {
            wallpaperItems = cloudCatalog.map { item ->
                item.copy(
                    isFavorite = prefs.getBoolean("favorite_${item.id}", false),
                    averageRating = prefs.getFloat("rating_avg_${item.id}", item.averageRating.toFloat()).toDouble(),
                    ratingCount = prefs.getInt("rating_count_${item.id}", item.ratingCount),
                    setCount = prefs.getInt("set_count_${item.id}", item.setCount)
                )
            }
        }
    }

    if (!onboardingComplete) {
        OnboardingFlow(
            initialName = userName, initialEmail = userEmail,
            initialBrand = phoneBrand, initialModel = phoneModel,
            initialCharacters = selectedCharacters, initialMarketingConsent = marketingConsent,
            screenSpec = screenSpec,
            onComplete = { name, email, brand, model, characters, consent ->
                userName = name; userEmail = email; phoneBrand = brand; phoneModel = model
                selectedCharacters = characters; marketingConsent = consent
                prefs.edit().putString("user_name", name).putString("user_email", email)
                    .putString("phone_brand", brand).putString("phone_model", model)
                    .putStringSet("favorite_characters", characters)
                    .putBoolean("marketing_consent", consent).putBoolean("onboarding_complete", true).apply()
                onboardingComplete = true
            }
        )
        return
    }

    Scaffold(
        containerColor = BackgroundDark,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("ANIQUOTES 4K", fontWeight = FontWeight.Black, letterSpacing = 1.4.sp)
                        Text("Your screen. Your anime universe.", fontSize = 11.sp, color = TextMuted)
                    }
                },
                actions = {
                    if (!premium) {
                        TextButton(onClick = { showPremiumDialog = true }) {
                            Icon(Icons.Default.WorkspacePremium, contentDescription = null, tint = AccentGold)
                            Spacer(Modifier.width(4.dp)); Text("PREMIUM", color = AccentGold, fontWeight = FontWeight.Bold)
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = BackgroundDark)
            )
        },
        bottomBar = {
            NavigationBar(containerColor = CardDark) {
                listOf(MainTab.DISCOVER, MainTab.BEST, MainTab.NEW, MainTab.FAVORITE_CHARACTER, MainTab.SETTINGS).forEach { tab ->
                    NavigationBarItem(
                        selected = selectedTab == tab,
                        onClick = { selectedTab = tab },
                        icon = {
                            Icon(when (tab) {
                                MainTab.DISCOVER -> Icons.Default.Explore
                                MainTab.BEST -> Icons.Default.Star
                                MainTab.NEW -> Icons.Default.FiberNew
                                MainTab.FAVORITE_CHARACTER -> if (premium) Icons.Default.Favorite else Icons.Default.Lock
                                MainTab.SETTINGS -> Icons.Default.Settings
                            }, contentDescription = tab.label)
                        },
                        label = { Text(tab.label, maxLines = 1, fontSize = 9.sp) }
                    )
                }
            }
        }
    ) { padding ->
        when (selectedTab) {
            MainTab.DISCOVER -> DiscoverScreen(
                padding = padding, wallpapers = wallpaperItems, selectedType = selectedType, onTypeChange = { selectedType = it },
                search = search, onSearchChange = { search = it }, onRate = { activeRatingItem = it }, onToggleFavorite = { item ->
                    val newValue = !item.isFavorite
                    prefs.edit().putBoolean("favorite_${item.id}", newValue).apply()
                    wallpaperItems = wallpaperItems.map { current -> if (current.id == item.id) current.copy(isFavorite = newValue) else current }
                },
                onSet = handleSet,
                onDownload = handleDownload,
                premium = premium, onPremium = { showPremiumDialog = true }
            )
            MainTab.BEST -> RankedScreen(padding, title = "Best wallpapers", subtitle = "Ranked using ratings, rating volume and set activity.", items = wallpaperItems.sortedByDescending { score(it) }, onRate = { activeRatingItem = it }, onToggleFavorite = { item ->
                val newValue = !item.isFavorite; prefs.edit().putBoolean("favorite_${item.id}", newValue).apply(); wallpaperItems = wallpaperItems.map { current -> if (current.id == item.id) current.copy(isFavorite = newValue) else current }
            }, onSet = handleSet, premium = premium, onDownload = handleDownload)
            MainTab.NEW -> RankedScreen(padding, title = "New wallpapers", subtitle = "Recently published additions from the catalog.", items = wallpaperItems.sortedByDescending { it.publishedAtEpoch }, onRate = { activeRatingItem = it }, onToggleFavorite = { item ->
                val newValue = !item.isFavorite; prefs.edit().putBoolean("favorite_${item.id}", newValue).apply(); wallpaperItems = wallpaperItems.map { current -> if (current.id == item.id) current.copy(isFavorite = newValue) else current }
            }, onSet = handleSet, premium = premium, onDownload = handleDownload)
            MainTab.FAVORITE_CHARACTER -> FavoriteCharacterScreen(
                padding = padding, premium = premium, characters = selectedCharacters, wallpapers = wallpaperItems,
                onUpgrade = { showPremiumDialog = true }, onRate = { activeRatingItem = it }, onToggleFavorite = { item ->
                    val newValue = !item.isFavorite; prefs.edit().putBoolean("favorite_${item.id}", newValue).apply(); wallpaperItems = wallpaperItems.map { current -> if (current.id == item.id) current.copy(isFavorite = newValue) else current }
                },
                onSet = handleSet,
                onDownload = handleDownload
            )
            MainTab.SETTINGS -> SettingsScreen(
                padding = padding, name = userName, email = userEmail, brand = phoneBrand, model = phoneModel,
                screenSpec = screenSpec, premium = premium, onPremium = { showPremiumDialog = true },
                onEditCharacters = { selectedTab = MainTab.FAVORITE_CHARACTER }, onRestartOnboarding = {
                    prefs.edit().putBoolean("onboarding_complete", false).apply(); onboardingComplete = false
                }
            )
        }
    }

    pendingWallpaper?.let { item ->
        AlertDialog(
            onDismissRequest = { if (!isSettingWallpaper) pendingWallpaper = null },
            title = { Text("Set wallpaper") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(item.title, fontWeight = FontWeight.SemiBold)
                    Text("Choose where to apply this wallpaper.", color = TextMuted)
                    WallpaperDestination.entries.forEach { destination ->
                        Row(
                            Modifier.fillMaxWidth().clickable(enabled = !isSettingWallpaper) { wallpaperDestination = destination },
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(
                                selected = wallpaperDestination == destination,
                                onClick = { wallpaperDestination = destination },
                                enabled = !isSettingWallpaper
                            )
                            Text(destination.label)
                        }
                    }
                    if (item.imageUrl.isNullOrBlank()) {
                        Text("This sample has no published image URL yet. Once a rights-cleared image is uploaded and connected to the catalog, this action will apply it directly.", color = TextMuted, fontSize = 12.sp)
                    }
                }
            },
            confirmButton = {
                Button(
                    enabled = !isSettingWallpaper && !item.imageUrl.isNullOrBlank(),
                    onClick = {
                        val url = item.imageUrl
                        if (url.isNullOrBlank()) {
                            notice = "No published image URL is connected for this sample yet."
                            pendingWallpaper = null
                        } else {
                            scope.launch {
                                isSettingWallpaper = true
                                // Refresh signed URLs before applying: storage URLs expire after one hour.
                                val refreshedItem = withContext(Dispatchers.IO) {
                                    WallpaperCatalogRepository.fetchPublishedCatalog().firstOrNull { it.id == item.id }
                                }
                                val usableUrl = refreshedItem?.imageUrl ?: url
                                val result = applyStaticWallpaper(context, usableUrl, wallpaperDestination.flags)
                                if (result == null) {
                                    wallpaperItems = wallpaperItems.map { current ->
                                        if (current.id == item.id) {
                                            val updated = current.copy(setCount = current.setCount + 1)
                                            prefs.edit().putInt("set_count_${item.id}", updated.setCount).apply()
                                            updated
                                        } else current
                                    }
                                    notice = "Wallpaper applied. Android confirmed the request for ${wallpaperDestination.label.lowercase(Locale.getDefault())}."
                                } else {
                                    notice = result
                                }
                                isSettingWallpaper = false
                                pendingWallpaper = null
                            }
                        }
                    }
                ) { if (isSettingWallpaper) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp) else Text("Set wallpaper") }
            },
            dismissButton = {
                TextButton(enabled = !isSettingWallpaper, onClick = { pendingWallpaper = null }) { Text("Cancel") }
            },
            containerColor = CardDark
        )
    }

    if (activeRatingItem != null) {
        RatingDialog(item = activeRatingItem!!, onDismiss = { activeRatingItem = null }, onSubmit = { stars ->
            val rated = activeRatingItem!!
            val ratingKey = "rating_mine_${rated.id}"
            val previousStars = prefs.getInt(ratingKey, 0)
            wallpaperItems = wallpaperItems.map { current ->
                if (current.id == rated.id) {
                    val oldCount = current.ratingCount
                    val newCount = if (previousStars > 0) oldCount else oldCount + 1
                    val oldTotal = current.averageRating * oldCount
                    val correctedTotal = if (previousStars > 0) oldTotal - previousStars + stars else oldTotal + stars
                    val nextAverage = if (newCount > 0) correctedTotal / newCount else stars.toDouble()
                    prefs.edit().putInt(ratingKey, stars).putFloat("rating_avg_${rated.id}", nextAverage.toFloat()).putInt("rating_count_${rated.id}", newCount).apply()
                    current.copy(averageRating = nextAverage, ratingCount = newCount)
                } else current
            }
            notice = if (previousStars > 0) "Your rating for ${rated.title} was updated to $stars/5." else "Thanks for rating ${rated.title} $stars/5. Your rating is saved on this device; server sync is not connected yet."
            activeRatingItem = null
        })
    }
    if (showPremiumDialog) {
        AlertDialog(
            onDismissRequest = { showPremiumDialog = false },
            icon = { Icon(Icons.Default.WorkspacePremium, contentDescription = null, tint = AccentGold, modifier = Modifier.size(34.dp)) },
            title = { Text("Unlock Premium") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("₹49/month", fontSize = 26.sp, fontWeight = FontWeight.Black, color = AccentGold)
                    listOf("Ad-free experience", "Download eligible 4K wallpapers", "Advanced device-specific personalization", "Unlock your Favorite Character feed").forEach {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Icon(Icons.Default.CheckCircle, contentDescription = null, tint = AccentGold, modifier = Modifier.size(18.dp)); Text(it)
                        }
                    }
                    Text("Live wallpapers now use Android's native preview flow. Premium downloads save eligible media to your device. Subscription checkout is still being connected and no payment is taken from this preview.", color = TextMuted, fontSize = 12.sp)
                }
            },
            confirmButton = {
                Button(onClick = {
                    showPremiumDialog = false
                    val activity = context as? Activity
                    if (activity == null) notice = "Open AniQuotes 4K from the Android app to continue with Google Play checkout."
                    else billingRepository.launchPurchase(activity)
                }) { Text("Subscribe · ₹49/month") }
            },
            dismissButton = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    TextButton(onClick = { billingRepository.restorePurchases(); billingRepository.refreshEntitlement() }) { Text("Restore") }
                    TextButton(onClick = { showPremiumDialog = false }) { Text("Maybe later") }
                }
            },
            containerColor = CardDark
        )
    }
    notice?.let { message ->
        AlertDialog(onDismissRequest = { notice = null }, title = { Text("AniQuotes 4K") }, text = { Text(message) }, confirmButton = { TextButton(onClick = { notice = null }) { Text("OK") } }, containerColor = CardDark)
    }
}

/** Downloads a rights-cleared HTTPS image and applies it through Android's native WallpaperManager. */
private suspend fun applyStaticWallpaper(context: android.content.Context, imageUrl: String, flags: Int): String? = withContext(Dispatchers.IO) {
    var connection: HttpURLConnection? = null
    var bitmap: Bitmap? = null
    try {
        val uri = Uri.parse(imageUrl)
        require(uri.scheme.equals("https", ignoreCase = true) && !uri.host.isNullOrBlank()) {
            "Wallpaper image URLs must use HTTPS."
        }
        connection = (URL(imageUrl).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15_000
            readTimeout = 20_000
            instanceFollowRedirects = false
            requestMethod = "GET"
            setRequestProperty("Accept", "image/jpeg,image/png,image/webp,image/avif")
            connect()
        }
        if (connection.responseCode != HttpURLConnection.HTTP_OK) {
            return@withContext "Could not load this wallpaper (HTTP ${connection.responseCode}). Please try again later."
        }
        val declaredLength = connection.contentLengthLong
        val maxBytes = 50L * 1024L * 1024L
        if (declaredLength > maxBytes) return@withContext "This image is too large to apply safely (over 50 MB)."
        val output = ByteArrayOutputStream()
        connection.inputStream.use { input ->
            val buffer = ByteArray(16 * 1024)
            var total = 0L
            while (true) {
                val count = input.read(buffer)
                if (count < 0) break
                total += count
                if (total > maxBytes) return@withContext "This image is too large to apply safely (over 50 MB)."
                output.write(buffer, 0, count)
            }
        }
        val bytes = output.toByteArray()
        bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
            ?: return@withContext "The published media is not a supported static image."
        if (bitmap.width <= 0 || bitmap.height <= 0 || bitmap.width.toLong() * bitmap.height.toLong() > 60_000_000L) {
            return@withContext "This image's dimensions are too large to apply safely."
        }
        WallpaperManager.getInstance(context).setBitmap(bitmap, null, true, flags)
        null
    } catch (e: SecurityException) {
        "Android denied permission to apply this wallpaper. Please check your device settings."
    } catch (e: Exception) {
        "Could not apply wallpaper: ${e.localizedMessage ?: "unexpected error"}."
    } finally {
        bitmap?.recycle()
        connection?.disconnect()
    }
}

private fun score(item: WallpaperItem): Double {
    // Small-sample dampening: prevents one five-star vote from automatically winning Best.
    val priorMean = 4.0
    val priorVotes = 12.0
    val bayesian = ((item.averageRating * item.ratingCount) + (priorMean * priorVotes)) / (item.ratingCount + priorVotes)
    val sets = kotlin.math.ln(1.0 + item.setCount.toDouble())
    val voteSignal = kotlin.math.ln(1.0 + item.ratingCount.toDouble())
    return bayesian * 0.65 + sets * 0.22 + voteSignal * 0.13
}

@Composable
private fun OnboardingFlow(
    initialName: String, initialEmail: String, initialBrand: String, initialModel: String,
    initialCharacters: Set<String>, initialMarketingConsent: Boolean, screenSpec: String,
    onComplete: (String, String, String, String, Set<String>, Boolean) -> Unit
) {
    var step by rememberSaveable { mutableIntStateOf(0) }
    var name by rememberSaveable { mutableStateOf(initialName) }
    var email by rememberSaveable { mutableStateOf(initialEmail) }
    var brand by rememberSaveable { mutableStateOf(initialBrand) }
    var model by rememberSaveable { mutableStateOf(initialModel) }
    var characters by remember { mutableStateOf(initialCharacters) }
    var marketingConsent by rememberSaveable { mutableStateOf(initialMarketingConsent) }
    var privacyAccepted by rememberSaveable { mutableStateOf(false) }
    var showPrivacyNotice by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    Column(Modifier.fillMaxSize().background(BackgroundDark).padding(24.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Column {
                Text("ANIQUOTES 4K", color = AccentGold, fontWeight = FontWeight.Black, letterSpacing = 1.4.sp)
                Text("PERSONAL SETUP", color = TextMuted, fontSize = 11.sp, letterSpacing = 1.sp)
            }
            Text("${step + 1} OF 3", color = TextMuted, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        }
        Spacer(Modifier.height(18.dp))
        LinearProgressIndicator(progress = { (step + 1) / 3f }, modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)), color = AccentGold, trackColor = CardDark)
        Spacer(Modifier.height(26.dp))
        when (step) {
            0 -> {
                Text("Welcome to your anime universe", fontSize = 29.sp, fontWeight = FontWeight.Black, lineHeight = 34.sp)
                Spacer(Modifier.height(8.dp)); Text("Create a more personal wallpaper experience.", color = TextMuted)
                Spacer(Modifier.height(24.dp))
                OutlinedTextField(value = name, onValueChange = { name = it; error = null }, label = { Text("Your name") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(value = email, onValueChange = { email = it.trim(); error = null }, label = { Text("Email address") }, modifier = Modifier.fillMaxWidth(), singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email))
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.Top) {
                    Checkbox(checked = privacyAccepted, onCheckedChange = { privacyAccepted = it }, colors = CheckboxDefaults.colors(checkedColor = AccentGold))
                    Text("Read the Privacy Notice: how your name, email, device details and character preferences are used.", fontSize = 12.sp, color = AccentGold, modifier = Modifier.padding(top = 10.dp).clickable { showPrivacyNotice = true })
                }
                Row(verticalAlignment = Alignment.Top) {
                    Checkbox(checked = marketingConsent, onCheckedChange = { marketingConsent = it }, colors = CheckboxDefaults.colors(checkedColor = AccentGold))
                    Text("Optional: Send me news and offers about your other apps. I can opt out later.", fontSize = 12.sp, color = TextMuted, modifier = Modifier.padding(top = 10.dp))
                }
            }
            1 -> {
                Text("Make it fit your phone", fontSize = 29.sp, fontWeight = FontWeight.Black, lineHeight = 34.sp)
                Spacer(Modifier.height(8.dp)); Text("We detect screen dimensions automatically. Confirm your device details if you want.", color = TextMuted)
                Spacer(Modifier.height(22.dp))
                OutlinedTextField(value = brand, onValueChange = { brand = it }, label = { Text("Phone brand") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                Spacer(Modifier.height(12.dp))
                OutlinedTextField(value = model, onValueChange = { model = it }, label = { Text("Phone model") }, modifier = Modifier.fillMaxWidth(), singleLine = true)
                Spacer(Modifier.height(18.dp))
                Card(colors = CardDefaults.cardColors(containerColor = CardDark), shape = RoundedCornerShape(18.dp)) {
                    Row(Modifier.fillMaxWidth().padding(18.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        Icon(Icons.Default.PhoneAndroid, contentDescription = null, tint = AccentGold, modifier = Modifier.size(32.dp))
                        Column { Text("Detected screen", fontWeight = FontWeight.Bold); Text(if (screenSpec.isBlank()) "Reading screen dimensions…" else screenSpec, color = TextMuted, fontSize = 13.sp); Text("Used for fit recommendations", color = TextMuted, fontSize = 11.sp) }
                    }
                }
                Spacer(Modifier.height(12.dp))
                Text("Advanced device-specific personalization is included with Premium.", color = AccentGold, fontSize = 12.sp)
            }
            2 -> {
                Text("Who's your favorite?", fontSize = 29.sp, fontWeight = FontWeight.Black, lineHeight = 34.sp)
                Spacer(Modifier.height(8.dp)); Text("Choose one or more characters. You can change these later.", color = TextMuted)
                Spacer(Modifier.height(18.dp))
                Text("YOUR CHARACTERS · ${characters.size} SELECTED", color = AccentGold, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.8.sp)
                Spacer(Modifier.height(12.dp))
                Column(verticalArrangement = Arrangement.spacedBy(9.dp)) {
                    availableCharacters.forEach { character ->
                        val selected = character in characters
                        Surface(
                            modifier = Modifier.fillMaxWidth().clickable { characters = if (selected) characters - character else characters + character },
                            shape = RoundedCornerShape(14.dp), color = if (selected) Color(0xFF3A2C4B) else CardDark,
                            border = if (selected) androidx.compose.foundation.BorderStroke(1.dp, AccentGold) else null
                        ) {
                            Row(Modifier.padding(horizontal = 14.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.Person, contentDescription = null, tint = if (selected) AccentGold else TextMuted)
                                Spacer(Modifier.width(10.dp)); Text(character, modifier = Modifier.weight(1f), fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal)
                                if (selected) Icon(Icons.Default.CheckCircle, contentDescription = "Selected", tint = AccentGold)
                            }
                        }
                    }
                }
                Spacer(Modifier.height(10.dp)); Text("Your choices can personalize the Premium Favorite Character section. Choosing characters does not purchase Premium.", color = TextMuted, fontSize = 12.sp)
            }
        }
        error?.let { Spacer(Modifier.height(8.dp)); Text(it, color = MaterialTheme.colorScheme.error, fontSize = 12.sp) }
        Spacer(Modifier.weight(1f))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            if (step > 0) OutlinedButton(onClick = { step--; error = null }, modifier = Modifier.weight(1f), shape = RoundedCornerShape(15.dp)) { Text("Back") }
            Button(
                onClick = {
                    when (step) {
                        0 -> {
                            if (name.trim().isEmpty()) error = "Enter your name to continue."
                            else if (!email.trim().matches(Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"))) error = "Enter a valid email address."
                            else if (!privacyAccepted) error = "Please acknowledge the Privacy Notice to continue."
                            else { error = null; step = 1 }
                        }
                        1 -> { error = null; step = 2 }
                        else -> onComplete(name.trim(), email.trim().lowercase(Locale.ROOT), brand.trim(), model.trim(), characters, marketingConsent)
                    }
                }, modifier = Modifier.weight(1.5f).height(52.dp), shape = RoundedCornerShape(15.dp),
                colors = ButtonDefaults.buttonColors(containerColor = AccentGold, contentColor = BackgroundDark)
            ) { Text(if (step == 2) "Enter the app" else "Continue", fontWeight = FontWeight.Bold) }
        }
        Spacer(Modifier.height(8.dp))
        Text("By continuing, your registration is for this app. Marketing about other apps is optional and separate.", color = TextMuted, fontSize = 10.sp, lineHeight = 14.sp)
    }
    if (showPrivacyNotice) {
        AlertDialog(
            onDismissRequest = { showPrivacyNotice = false },
            title = { Text("Privacy Notice") },
            text = {
                Text("This prototype saves your name, email, phone brand/model, screen dimensions and favorite character choices on this device. In the production app, registration and preferences will be sent securely to the app backend. Your email is used for app-related account/support purposes. Marketing about other apps is optional and off unless you choose it. You can change your preferences or request deletion through support at Sanjay200123@gmail.com. Do not launch real data collection until the published privacy policy, secure registration endpoint and deletion process are live.", fontSize = 13.sp)
            },
            confirmButton = { TextButton(onClick = { privacyAccepted = true; showPrivacyNotice = false }) { Text("I understand") } },
            dismissButton = { TextButton(onClick = { showPrivacyNotice = false }) { Text("Close") } },
            containerColor = CardDark
        )
    }
}

@Composable
private fun DiscoverScreen(
    padding: PaddingValues, wallpapers: List<WallpaperItem>, selectedType: String, onTypeChange: (String) -> Unit,
    search: String, onSearchChange: (String) -> Unit, onRate: (WallpaperItem) -> Unit, onToggleFavorite: (WallpaperItem) -> Unit,
    onSet: (WallpaperItem) -> Unit, onDownload: (WallpaperItem) -> Unit, premium: Boolean, onPremium: () -> Unit
) {
    val typeOptions = listOf("All", "Normal", "With Quotes", "Live", "Favorites")
    val filtered = wallpapers.filter { item ->
        (selectedType == "All" || when (selectedType) { "Normal" -> item.mediaType == WallpaperMediaType.NORMAL; "With Quotes" -> item.mediaType == WallpaperMediaType.QUOTE; "Live" -> item.mediaType == WallpaperMediaType.LIVE; "Favorites" -> item.isFavorite; else -> true }) &&
            (item.characterName.contains(search, true) || item.title.contains(search, true) || item.quote.orEmpty().contains(search, true))
    }
    LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(horizontal = 18.dp, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { HeroCard(onPremium = onPremium, premium = premium) }
        item {
            OutlinedTextField(value = search, onValueChange = onSearchChange, modifier = Modifier.fillMaxWidth(), singleLine = true, leadingIcon = { Icon(Icons.Default.Search, null) }, placeholder = { Text("Search characters or quotes") }, shape = RoundedCornerShape(16.dp))
        }
        item { Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) { typeOptions.forEach { type -> FilterChip(selected = selectedType == type, onClick = { onTypeChange(type) }, label = { Text(type) }) } } }
        item { Text("Discover wallpapers", fontSize = 21.sp, fontWeight = FontWeight.Bold) }
        if (filtered.isEmpty()) item { Text("No results. Try another search.", color = TextMuted) }
        else items(filtered, key = { it.id }) { item -> WallpaperCard(item, onRate, onToggleFavorite, onSet, onDownload, premium) }
    }
}

@Composable
private fun HeroCard(onPremium: () -> Unit, premium: Boolean) {
    Card(modifier = Modifier.fillMaxWidth().height(206.dp), shape = RoundedCornerShape(24.dp), colors = CardDefaults.cardColors(containerColor = CardDark)) {
        Box(Modifier.fillMaxSize().background(Brush.linearGradient(listOf(Color(0xFF171324), Color(0xFF432C52), Color(0xFF7B4437)))).padding(20.dp), contentAlignment = Alignment.BottomStart) {
            Column {
                Text("WALLPAPER OF THE DAY", color = AccentGold, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.1.sp)
                Spacer(Modifier.height(8.dp)); Text("Your screen. Your anime universe.", fontSize = 24.sp, fontWeight = FontWeight.Black, lineHeight = 28.sp)
                Spacer(Modifier.height(6.dp)); Text("Explore normal, quote and live wallpapers in 4K source quality.", color = Color(0xFFE5DDEC), fontSize = 13.sp)
                if (!premium) { Spacer(Modifier.height(10.dp)); Text("PREMIUM  ·  ₹49/month  ·  AD-FREE", color = AccentGold, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.clickable { onPremium() }) }
            }
        }
    }
}

@Composable
private fun WallpaperCard(item: WallpaperItem, onRate: (WallpaperItem) -> Unit, onToggleFavorite: (WallpaperItem) -> Unit, onSet: (WallpaperItem) -> Unit, onDownload: (WallpaperItem) -> Unit, premium: Boolean) {
    Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(22.dp), colors = CardDefaults.cardColors(containerColor = CardDark)) {
        Column {
            Box(Modifier.fillMaxWidth().height(170.dp).background(Brush.linearGradient(item.previewColors.map { Color(it) }.ifEmpty { listOf(CardDark, BackgroundDark) })).padding(18.dp), contentAlignment = Alignment.BottomStart) {
                Column {
                    Text(when (item.mediaType) { WallpaperMediaType.NORMAL -> "ANIME WALLPAPER"; WallpaperMediaType.QUOTE -> "WALLPAPER WITH QUOTE"; WallpaperMediaType.LIVE -> "LIVE WALLPAPER" }, color = AccentGold, fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
                    Spacer(Modifier.height(8.dp)); Text(item.characterName, fontSize = 23.sp, fontWeight = FontWeight.Black)
                    item.quote?.let { Spacer(Modifier.height(4.dp)); Text("“$it”", fontSize = 13.sp, color = Color.White) }
                }
            }
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Default.Star, contentDescription = null, tint = AccentGold, modifier = Modifier.size(18.dp))
                    Text(String.format(Locale.getDefault(), "%.1f", item.averageRating), fontWeight = FontWeight.Bold)
                    Text("(${item.ratingCount} ratings)", color = TextMuted, fontSize = 12.sp)
                    Spacer(Modifier.weight(1f)); Text("${item.setCount} sets", color = TextMuted, fontSize = 12.sp)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                    OutlinedButton(onClick = { onToggleFavorite(item) }, shape = RoundedCornerShape(13.dp), contentPadding = PaddingValues(horizontal = 10.dp)) {
                        Icon(if (item.isFavorite) Icons.Default.Favorite else Icons.Default.FavoriteBorder, contentDescription = if (item.isFavorite) "Remove favorite" else "Add favorite", tint = if (item.isFavorite) AccentGold else TextMuted)
                    }
                    Button(onClick = { onSet(item) }, modifier = Modifier.weight(1f), shape = RoundedCornerShape(13.dp), colors = ButtonDefaults.buttonColors(containerColor = AccentGold, contentColor = BackgroundDark)) {
                        Icon(Icons.Default.Wallpaper, null, modifier = Modifier.size(17.dp)); Spacer(Modifier.width(5.dp)); Text(if (item.mediaType == WallpaperMediaType.LIVE) "Set Live" else "Set wallpaper", maxLines = 1)
                    }
                    OutlinedButton(onClick = { onRate(item) }, shape = RoundedCornerShape(13.dp)) { Icon(Icons.Default.StarOutline, null); Text("Rate") }
                    if (premium) OutlinedButton(onClick = { onDownload(item) }, shape = RoundedCornerShape(13.dp), contentPadding = PaddingValues(horizontal = 10.dp)) { Icon(Icons.Default.Download, "Download") }
                }
            }
        }
    }
}

@Composable
private fun RankedScreen(padding: PaddingValues, title: String, subtitle: String, items: List<WallpaperItem>, onRate: (WallpaperItem) -> Unit, onToggleFavorite: (WallpaperItem) -> Unit, onSet: (WallpaperItem) -> Unit, premium: Boolean, onDownload: (WallpaperItem) -> Unit) {
    LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { Column(verticalArrangement = Arrangement.spacedBy(5.dp)) { Text(title, fontSize = 28.sp, fontWeight = FontWeight.Black); Text(subtitle, color = TextMuted, fontSize = 13.sp) } }
        items(items, key = { it.id }) { WallpaperCard(it, onRate, onToggleFavorite, onSet, onDownload, premium) }
    }
}

@Composable
private fun FavoriteCharacterScreen(padding: PaddingValues, premium: Boolean, characters: Set<String>, wallpapers: List<WallpaperItem>, onUpgrade: () -> Unit, onRate: (WallpaperItem) -> Unit, onToggleFavorite: (WallpaperItem) -> Unit, onSet: (WallpaperItem) -> Unit, onDownload: (WallpaperItem) -> Unit) {
    val matching = wallpapers.filter { it.characterName in characters }
    if (!premium) {
        LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            item { Text("Favorite Character", fontSize = 28.sp, fontWeight = FontWeight.Black); Text("A wallpaper feed built around the characters you love.", color = TextMuted) }
            items(wallpapers.take(3), key = { it.id }) { item ->
                Box {
                    Box(Modifier.blur(10.dp)) { WallpaperCard(item, onRate, onToggleFavorite, onSet, onDownload, false) }
                    Box(Modifier.matchParentSize().clip(RoundedCornerShape(22.dp)).background(Color(0xB8100E17)).clickable { onUpgrade() }, contentAlignment = Alignment.Center) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(20.dp)) {
                            Icon(Icons.Default.Lock, null, tint = AccentGold, modifier = Modifier.size(34.dp))
                            Text("YOUR FAVORITES, PERSONALIZED", color = Color.White, fontWeight = FontWeight.Black)
                            Text("Premium feature", color = Color(0xFFE3D9EF), fontSize = 12.sp)
                            Button(onClick = onUpgrade, colors = ButtonDefaults.buttonColors(containerColor = AccentGold, contentColor = BackgroundDark)) { Text("Unlock · ₹49/month") }
                        }
                    }
                }
            }
        }
    } else {
        LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            item { Text("Favorite Character", fontSize = 28.sp, fontWeight = FontWeight.Black); Text("Only your selected characters", color = TextMuted) }
            if (matching.isEmpty()) item { Text("No published wallpapers match your selected characters yet. You can change your choices in onboarding/settings.", color = TextMuted) }
            else items(matching, key = { it.id }) { WallpaperCard(it, onRate, onToggleFavorite, onSet, onDownload, true) }
        }
    }
}

@Composable
private fun RatingDialog(item: WallpaperItem, onDismiss: () -> Unit, onSubmit: (Int) -> Unit) {
    var stars by remember { mutableIntStateOf(0) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Rate this wallpaper") },
        text = {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(item.title, fontWeight = FontWeight.Bold)
                Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                    (1..5).forEach { star -> IconButton(onClick = { stars = star }) { Icon(if (star <= stars) Icons.Default.Star else Icons.Default.StarOutline, contentDescription = "$star stars", tint = if (star <= stars) AccentGold else TextMuted, modifier = Modifier.size(30.dp)) } }
                }
                Text(if (stars == 0) "Tap a star to rate" else "$stars out of 5 stars", color = TextMuted, fontSize = 12.sp)
            }
        },
        confirmButton = { Button(onClick = { if (stars > 0) onSubmit(stars) }, enabled = stars > 0) { Text("Submit rating") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }, containerColor = CardDark
    )
}

@Composable
private fun SettingsScreen(padding: PaddingValues, name: String, email: String, brand: String, model: String, screenSpec: String, premium: Boolean, onPremium: () -> Unit, onEditCharacters: () -> Unit, onRestartOnboarding: () -> Unit) {
    val context = LocalContext.current
    val supportEmail = "Sanjay200123@gmail.com"
    LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        item { Text("Settings & support", fontSize = 27.sp, fontWeight = FontWeight.Black); Text("Your account and app preferences", color = TextMuted) }
        item {
            Card(colors = CardDefaults.cardColors(containerColor = CardDark), shape = RoundedCornerShape(20.dp)) {
                Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Default.AccountCircle, null, tint = AccentGold, modifier = Modifier.size(32.dp)); Spacer(Modifier.width(10.dp)); Column { Text(name, fontWeight = FontWeight.Bold, fontSize = 18.sp); Text(email, color = TextMuted, fontSize = 12.sp) } }
                    HorizontalDivider(color = TextMuted.copy(alpha = .2f))
                    Text("Plan: ${if (premium) "Premium" else "Free"}", fontWeight = FontWeight.Bold)
                    if (!premium) Button(onClick = onPremium, modifier = Modifier.fillMaxWidth(), colors = ButtonDefaults.buttonColors(containerColor = AccentGold, contentColor = BackgroundDark)) { Icon(Icons.Default.WorkspacePremium, null); Spacer(Modifier.width(8.dp)); Text("Go Premium · ₹49/month") }
                }
            }
        }
        item {
            Card(colors = CardDefaults.cardColors(containerColor = CardDark), shape = RoundedCornerShape(20.dp)) {
                Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                    Text("Your device", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                    Text("$brand $model", color = Color.White)
                    Text("Screen: $screenSpec", color = TextMuted, fontSize = 12.sp)
                    Text("Advanced device-specific personalization is available with Premium.", color = TextMuted, fontSize = 12.sp)
                    TextButton(onClick = onRestartOnboarding) { Text("Edit setup details", color = AccentGold) }
                    TextButton(onClick = onEditCharacters) { Text("View Favorite Character", color = AccentGold) }
                }
            }
        }
        item {
            Card(colors = CardDefaults.cardColors(containerColor = CardDark), shape = RoundedCornerShape(20.dp)) {
                Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("Contact support", fontSize = 18.sp, fontWeight = FontWeight.Bold)
                    Text("Sanjay", fontWeight = FontWeight.SemiBold)
                    Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(BackgroundDark).clickable {
                        val intent = Intent(Intent.ACTION_SENDTO, Uri.parse("mailto:$supportEmail?subject=Anime%20Quotes%20Wallpaper%20Support")); runCatching { context.startActivity(intent) }
                    }.padding(12.dp), verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Default.Email, null, tint = AccentGold); Spacer(Modifier.width(10.dp)); Text(supportEmail) }
                    Text("Privacy Notice · Terms of Service", color = TextMuted, fontSize = 12.sp)
                }
            }
        }
    }
}
