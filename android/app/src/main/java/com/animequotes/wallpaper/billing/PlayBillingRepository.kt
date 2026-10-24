package com.animequotes.wallpaper.billing

import android.app.Activity
import android.content.Context
import android.os.Handler
import android.os.Looper
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import com.animequotes.wallpaper.BuildConfig
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID

/** Play Billing client. Premium is enabled only after the server verifies a purchase token. */
class PlayBillingRepository(
    private val context: Context,
    private val onStatus: (String) -> Unit,
    private val onPremiumChanged: (Boolean) -> Unit,
) {
    companion object {
        const val PRODUCT_ID = "aniquotes_premium_monthly"
    }

    private val main = Handler(Looper.getMainLooper())
    private val prefs = context.getSharedPreferences("anime_quotes_prefs", Context.MODE_PRIVATE)
    private val installationId = prefs.getString("billing_installation_id", null) ?: UUID.randomUUID().toString().also {
        prefs.edit().putString("billing_installation_id", it).apply()
    }
    private var productDetails: ProductDetails? = null
    private val client: BillingClient = BillingClient.newBuilder(context)
        .setListener { result, purchases -> handlePurchasesUpdated(result, purchases.orEmpty()) }
        .enablePendingPurchases()
        .build()

    fun connect() {
        if (!BuildConfig.SUPABASE_URL.startsWith("https://") || BuildConfig.SUPABASE_ANON_KEY.isBlank()) {
            onStatus("Configure Supabase before enabling verified Premium purchases.")
            return
        }
        client.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                    onStatus("Google Play Billing unavailable: ${result.debugMessage}")
                    return
                }
                queryProduct()
                restorePurchases()
                refreshEntitlement()
            }
            override fun onBillingServiceDisconnected() { onStatus("Google Play connection lost. Retry in a moment.") }
        })
    }

    fun launchPurchase(activity: Activity) {
        val details = productDetails
        if (!client.isReady || details == null) {
            onStatus("The ₹49/month subscription is not available yet. Confirm that $PRODUCT_ID is configured in Play Console and the app is installed from a licensed test track.")
            return
        }
        val offer = details.subscriptionOfferDetails?.firstOrNull()
        if (offer == null) {
            onStatus("Google Play did not return a subscription offer for this product.")
            return
        }
        val productParams = BillingFlowParams.ProductDetailsParams.newBuilder()
            .setProductDetails(details)
            .setOfferToken(offer.offerToken)
            .build()
        val params = BillingFlowParams.newBuilder().setProductDetailsParamsList(listOf(productParams)).build()
        val result = client.launchBillingFlow(activity, params)
        if (result.responseCode != BillingClient.BillingResponseCode.OK) onStatus("Couldn't open Google Play checkout: ${result.debugMessage}")
    }

    fun restorePurchases() {
        if (!client.isReady) return
        client.queryPurchasesAsync(
            QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build()
        ) { result, purchases ->
            if (result.responseCode != BillingClient.BillingResponseCode.OK) {
                onStatus("Couldn't restore Google Play purchases: ${result.debugMessage}")
                return@queryPurchasesAsync
            }
            purchases.filter { PRODUCT_ID in it.products && it.purchaseState == Purchase.PurchaseState.PURCHASED }
                .forEach { verifyPurchase(it) }
        }
    }

    fun refreshEntitlement() {
        Thread {
            val result = postToVerifier(JSONObject().put("action", "status").put("installation_id", installationId))
            val active = result?.optBoolean("premium", false) == true
            main.post { onPremiumChanged(active) }
        }.start()
    }

    fun close() { if (client.isReady) client.endConnection() }

    private fun queryProduct() {
        val product = QueryProductDetailsParams.Product.newBuilder()
            .setProductId(PRODUCT_ID).setProductType(BillingClient.ProductType.SUBS).build()
        val params = QueryProductDetailsParams.newBuilder().setProductList(listOf(product)).build()
        client.queryProductDetailsAsync(params) { result, details ->
            if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                productDetails = details.firstOrNull()
                if (productDetails == null) onStatus("Subscription product '$PRODUCT_ID' wasn't found in Google Play Console yet.")
            } else onStatus("Couldn't load subscription price: ${result.debugMessage}")
        }
    }

    private fun handlePurchasesUpdated(result: BillingResult, purchases: List<Purchase>) {
        when (result.responseCode) {
            BillingClient.BillingResponseCode.OK -> purchases.forEach { purchase ->
                if (PRODUCT_ID !in purchase.products) return@forEach
                when (purchase.purchaseState) {
                    Purchase.PurchaseState.PENDING -> onStatus("Your payment is pending. Premium will unlock after Google Play confirms it.")
                    Purchase.PurchaseState.PURCHASED -> verifyPurchase(purchase)
                }
            }
            BillingClient.BillingResponseCode.USER_CANCELED -> onStatus("Purchase cancelled. You can upgrade whenever you're ready.")
            else -> onStatus("Google Play purchase failed: ${result.debugMessage}")
        }
    }

    private fun verifyPurchase(purchase: Purchase) {
        Thread {
            val token = purchase.purchaseToken
            val result = postToVerifier(JSONObject()
                .put("action", "verify")
                .put("installation_id", installationId)
                .put("product_id", PRODUCT_ID)
                .put("purchase_token", token))
            val active = result?.optBoolean("premium", false) == true
            if (active && purchase.isAcknowledged.not()) {
                main.post {
                    client.acknowledgePurchase(
                        com.android.billingclient.api.AcknowledgePurchaseParams.newBuilder().setPurchaseToken(token).build()
                    ) { ack -> if (ack.responseCode != BillingClient.BillingResponseCode.OK) onStatus("Purchase verified, but Google Play acknowledgement needs another attempt.") }
                }
            }
            main.post {
                onPremiumChanged(active)
                onStatus(if (active) "Premium is active. Ads and Premium restrictions are now disabled." else "Google Play purchase could not be verified by the server. Premium remains locked.")
            }
        }.start()
    }

    private fun postToVerifier(body: JSONObject): JSONObject? {
        if (BuildConfig.SUPABASE_URL.isBlank() || BuildConfig.SUPABASE_ANON_KEY.isBlank()) return null
        var connection: HttpURLConnection? = null
        return try {
            connection = (URL("${BuildConfig.SUPABASE_URL.trimEnd('/')}/functions/v1/verify-play-purchase").openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"; connectTimeout = 10_000; readTimeout = 15_000; doOutput = true
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("apikey", BuildConfig.SUPABASE_ANON_KEY)
                setRequestProperty("Authorization", "Bearer ${BuildConfig.SUPABASE_ANON_KEY}")
            }
            connection.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            val stream = if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream
            val text = stream?.bufferedReader()?.use { it.readText() } ?: return null
            JSONObject(text)
        } catch (_: Exception) { null } finally { connection?.disconnect() }
    }
}
