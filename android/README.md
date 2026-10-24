# Android app

Kotlin + Jetpack Compose starter. Open this directory in Android Studio.

Current UI has Discover, Favorites and Settings screens, search against sample entries, a professional support card with a mailto action for Sanjay (Sanjay200123@gmail.com), and a rights-aware metadata model. Wallpaper application, cloud catalog sync, favorites persistence, and automatic rotation are not yet implemented.

Requires Android SDK 35 and JDK 17. This environment did not have Gradle or the Android SDK installed, so compile status is unverified.


## Current UI implementation status
The app includes a first-run three-page setup for name/email, phone brand/model and detected screen dimensions, and favorite characters. It has Discover, Best, New, Favorite Character and Settings tabs; the Discover tab separates Normal, With Quotes and Live content. Star-rating, Premium upgrade and download controls are UI prototypes. Registration currently stays in local preferences. Google Play Billing, backend sync, remote 4K assets, real wallpaper application, and live wallpaper service are not connected yet.


## Favorites and ratings pass (2026-10-23)
- App display branding updated to AniQuotes 4K.
- Wallpaper cards now include favorite toggles and Discover includes a Favorites filter. Favorite choices persist locally across app restarts.
- Local star ratings can be updated by the same installation and persist average/count values locally. This is a prototype behavior only; account-bound server ratings and anti-abuse enforcement require the deployed backend.
- Actual wallpaper setting is intentionally not faked: sample entries contain gradient previews, not licensed source images or live video assets. Native static/live wallpaper activation will be connected after real rights-cleared catalog media is available.
