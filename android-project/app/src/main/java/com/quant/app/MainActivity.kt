package com.quant.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import com.quant.app.theme.QuantTheme

class MainActivity : ComponentActivity() {

  // Active deep link URL to load or pass to the WebView
  val deepLinkUrlState = mutableStateOf<String?>(null)

  // Track the active webview instance to directly restore sessions or load deep link URLs
  var activeWebView: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)

    handleIncomingIntent(intent)

    enableEdgeToEdge()
    setContent {
      QuantTheme {
        Surface(
          modifier = Modifier.fillMaxSize(),
          color = MaterialTheme.colorScheme.background
        ) {
          MainNavigation(
            deepLinkUrl = deepLinkUrlState.value,
            onWebViewAttached = { webView ->
              activeWebView = webView
              deepLinkUrlState.value?.let { targetUrl ->
                webView.loadUrl(targetUrl)
                deepLinkUrlState.value = null
              }
            }
          )
        }
      }
    }
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleIncomingIntent(intent)
  }

  private fun handleIncomingIntent(intent: Intent?) {
    val data = intent?.data ?: return
    val resolvedUrl = resolveDeepLinkUrl(data)
    if (resolvedUrl != null) {
      val webView = activeWebView
      if (webView != null) {
        webView.loadUrl(resolvedUrl)
      } else {
        deepLinkUrlState.value = resolvedUrl
      }
    }
  }

  companion object {
    /**
     * Resolves incoming deep links from string (custom scheme or https App Links)
     * to the appropriate session restoration URL for the WebView.
     */
    fun resolveDeepLinkUrl(urlString: String): String? {
      val trimmed = urlString.trim()
      if (trimmed.startsWith("quantmail://oauth/callback", ignoreCase = true)) {
        val queryIndex = trimmed.indexOf('?')
        return if (queryIndex != -1 && queryIndex + 1 < trimmed.length) {
          val query = trimmed.substring(queryIndex + 1)
          "https://quantmail.in/auth/callback?$query"
        } else {
          "https://quantmail.in/auth/callback"
        }
      }
      if (trimmed.startsWith("https://quantmail.in/auth/callback", ignoreCase = true)) {
        return trimmed
      }
      return null
    }

    /**
     * Resolves incoming deep links from android.net.Uri.
     */
    fun resolveDeepLinkUrl(uri: Uri): String? {
      return resolveDeepLinkUrl(uri.toString())
    }

    /**
     * Determines whether a URL is an external OAuth or authentication provider that must
     * NOT be loaded inside the WebView (which triggers Google's disallowed_useragent security rejection).
     */
    fun isExternalAuthUrl(url: String): Boolean {
      val lower = url.trim().lowercase()
      if (lower.startsWith("https://accounts.google.com") || lower.startsWith("http://accounts.google.com")) {
        return true
      }
      if (lower.contains("accounts.google.com/o/oauth2") || lower.contains("accounts.google.com/signin")) {
        return true
      }
      if (lower.startsWith("https://github.com/login/oauth") || lower.startsWith("http://github.com/login/oauth")) {
        return true
      }
      if (lower.startsWith("https://appleid.apple.com") || lower.startsWith("http://appleid.apple.com")) {
        return true
      }
      if (lower.startsWith("https://login.microsoftonline.com") || lower.startsWith("https://login.live.com")) {
        return true
      }
      return false
    }

    /**
     * Launches external OAuth / auth provider in a secure Chrome Custom Tab.
     */
    fun launchCustomTab(context: Context, url: String) {
      val customTabsIntent = CustomTabsIntent.Builder()
        .setShowTitle(true)
        .setShareState(CustomTabsIntent.SHARE_STATE_OFF)
        .build()
      customTabsIntent.launchUrl(context, Uri.parse(url))
    }

    /**
     * Hardens WebSettings according to Google Play production security standards.
     * - Disallows mixed content (WebSettings.MIXED_CONTENT_NEVER_ALLOW)
     * - Disables file access (allowFileAccess = false)
     * - Disables content access (allowContentAccess = false)
     */
    fun configureWebSettings(settings: WebSettings) {
      settings.apply {
        javaScriptEnabled = true
        domStorageEnabled = true
        databaseEnabled = true
        allowFileAccess = false
        allowContentAccess = false
        cacheMode = WebSettings.LOAD_DEFAULT
        useWideViewPort = true
        loadWithOverviewMode = true
        mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        userAgentString = "${userAgentString} QuantApp/1.0"
      }
    }
  }
}
