package com.quant.app.ui.main

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.graphics.Bitmap
import android.net.http.SslError
import android.view.ViewGroup
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FloatingActionButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.NestedScrollSource
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.navigation3.runtime.NavKey
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.quant.app.BuildConfig
import com.quant.app.MainActivity
import com.quant.app.bridge.QuantNativeBridge
import com.quant.app.data.EcosystemStateStore
import com.quant.app.network.QuantBackendClient
import com.quant.app.auth.QuantAuthManager
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import com.quant.app.ui.auth.QuantLoginScreen
import com.quant.app.ui.auth.QuantPhoneVerificationScreen
import com.quant.app.ui.components.QuantAccountProfileSheet
import com.quant.app.ui.components.NativeCalendarEventSheet
import com.quant.app.ui.components.NativeContactCreationSheet
import com.quant.app.ui.components.NativeDriveUploadSheet
import com.quant.app.ui.components.NativeEmailComposerSheet
import com.quant.app.ui.components.NativeRepoCreationSheet
import com.quant.app.ui.components.NativeSearchOverlay
import com.quant.app.ui.components.NativeThreadDetailModal
import com.quant.app.ui.components.NativeVoiceChatSheet
import com.quant.app.ui.components.QuantBrandLogo
import com.quant.app.ui.components.QuantPillarTopBar
import com.quant.app.ui.components.QuantTopAppBar
import com.quant.app.ui.components.SearchResultItem
import com.quant.app.ui.navigation.ContextBottomNavBar
import com.quant.app.ui.navigation.ContextNavDestination
import com.quant.app.ui.navigation.ProductivityTab
import com.quant.app.ui.navigation.QuantBottomNavBar
import com.quant.app.ui.views.NativeCalendarView
import com.quant.app.ui.views.NativeCodeHubView
import com.quant.app.ui.views.NativeContactsView
import com.quant.app.ui.views.NativeDriveView
import com.quant.app.ui.views.NativeMailView
import com.quant.app.ui.views.NativeQuantAiView
import org.json.JSONObject

internal fun Context.findActivity(): Activity? {
  var currentContext = this
  while (currentContext is ContextWrapper) {
    if (currentContext is Activity) {
      return currentContext
    }
    currentContext = currentContext.baseContext
  }
  return null
}

fun getAppAccentColor(): Color {
  return when (BuildConfig.FLAVOR) {
    "quantchat" -> Color(0xFF10, 0xB9, 0x81) // Emerald Green
    "quantgram" -> Color(0xFFE1, 0x30, 0x6C) // Instagram Pink / Rose
    "quantube" -> Color(0xFFFF, 0x22, 0x22) // YouTube Red
    "quantai" -> Color(0xFF8B, 0x5C, 0xF6) // Purple / Violet
    "quantdrive" -> Color(0xFF0E, 0xA5, 0xE9) // Sky Blue
    "quantcalendar" -> Color(0xFFF5, 0x9E, 0x0B) // Amber
    "codehub" -> Color(0xFF10, 0xB9, 0x81) // GitHub Green
    else -> Color(0xFFFF, 0x8C, 0x42) // Sovereign Orange (QuantMail & QuantApp)
  }
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun MainScreen(
  onItemClick: (NavKey) -> Unit = {},
  deepLinkUrl: String? = null,
  onWebViewAttached: (WebView) -> Unit = {},
  modifier: Modifier = Modifier,
) {
  val accentColor = remember { getAppAccentColor() }
  val context = androidx.compose.ui.platform.LocalContext.current
  var isAuthenticated by remember { mutableStateOf(QuantAuthManager.isLoggedIn(context)) }
  var currentUser by remember(isAuthenticated) { mutableStateOf(QuantAuthManager.getCurrentUser(context)) }
  val coroutineScope = rememberCoroutineScope()

  // Initial sovereign network sync for authenticated user
  LaunchedEffect(isAuthenticated) {
    if (isAuthenticated) {
      withContext(Dispatchers.IO) {
        try {
          val token = currentUser.token
          QuantBackendClient.fetchCalendarEvents(token)
          QuantBackendClient.fetchDriveFiles(token)
          QuantBackendClient.fetchContacts(token)
          QuantBackendClient.fetchRepos(token)
        } catch (_: Exception) {
          // Sovereign local cache remains intact
        }
      }
    }
  }

  var webViewRef by remember { mutableStateOf<WebView?>(null) }
  var nativeBridge by remember { mutableStateOf<QuantNativeBridge?>(null) }
  var swipeRefreshRef by remember { mutableStateOf<SwipeRefreshLayout?>(null) }
  var isLoading by remember { mutableStateOf(true) }
  var loadProgress by remember { mutableIntStateOf(0) }
  var isError by remember { mutableStateOf(false) }

  // Sovereign View Mode: true = Blisteringly fast Jetpack Compose Native, false = Cloud WebView
  var isNativeMode by remember { mutableStateOf(true) }

  // Selected thread item for NativeThreadDetailModal from NativeMailView
  var selectedMailThread by remember { mutableStateOf<SearchResultItem?>(null) }

  // Composer modal open state
  var isComposerOpen by remember { mutableStateOf(false) }

  // Sovereign Account Profile & Workspace Manager sheet open state
  var isAppSwitcherOpen by remember { mutableStateOf(false) }

  // Sovereign Phone OTP Verification screen open state
  var isPhoneVerificationOpen by remember { mutableStateOf(false) }

  // Fast search overlay open state
  var isSearchOpen by remember { mutableStateOf(false) }

  // Secondary Tab Action Sheet States
  var isEventSheetOpen by remember { mutableStateOf(false) }
  var isUploadSheetOpen by remember { mutableStateOf(false) }
  var isContactSheetOpen by remember { mutableStateOf(false) }
  var isRepoSheetOpen by remember { mutableStateOf(false) }
  var isVoiceChatSheetOpen by remember { mutableStateOf(false) }

  // Determines whether the current app flavor is part of the unified productivity suite
  val isProductivitySuite = remember {
    BuildConfig.FLAVOR in listOf("quantmail", "quantapp", "quantdrive", "quantcalendar", "codehub", "")
  }

  // Active productivity tab state
  var activeTab by remember {
    mutableStateOf(ProductivityTab.fromUrl(deepLinkUrl ?: BuildConfig.DEFAULT_APP_URL))
  }

  var currentSubTabId by remember(activeTab) { mutableStateOf<String?>(null) }
  var selectedLensId by remember(activeTab) { mutableStateOf("all") }
  var isBottomNavVisible by remember { mutableStateOf(true) }

  val nestedScrollConnection = remember {
    object : NestedScrollConnection {
      override fun onPreScroll(available: Offset, source: NestedScrollSource): Offset {
        if (available.y < -15f) {
          isBottomNavVisible = false
        } else if (available.y > 15f) {
          isBottomNavVisible = true
        }
        return Offset.Zero
      }
    }
  }

  // Handle deep link restoration in active WebView
  LaunchedEffect(deepLinkUrl) {
    if (!deepLinkUrl.isNullOrBlank()) {
      activeTab = ProductivityTab.fromUrl(deepLinkUrl)
      webViewRef?.loadUrl(deepLinkUrl)
    }
  }

  // Clean hardware back press handling for all modals, sheets, and docks
  BackHandler(enabled = isComposerOpen) {
    isComposerOpen = false
  }

  BackHandler(enabled = isSearchOpen) {
    isSearchOpen = false
  }

  BackHandler(enabled = isEventSheetOpen) {
    isEventSheetOpen = false
  }

  BackHandler(enabled = isUploadSheetOpen) {
    isUploadSheetOpen = false
  }

  BackHandler(enabled = isContactSheetOpen) {
    isContactSheetOpen = false
  }

  BackHandler(enabled = isRepoSheetOpen) {
    isRepoSheetOpen = false
  }

  BackHandler(enabled = isVoiceChatSheetOpen) {
    isVoiceChatSheetOpen = false
  }

  BackHandler(enabled = isAppSwitcherOpen) {
    isAppSwitcherOpen = false
  }

  BackHandler(enabled = isPhoneVerificationOpen) {
    isPhoneVerificationOpen = false
  }

  BackHandler(enabled = selectedMailThread != null) {
    selectedMailThread = null
  }

  // Smooth fallback to Mail tab when pressing back from secondary native tabs
  BackHandler(
    enabled = isNativeMode &&
      activeTab != ProductivityTab.Mail &&
      !isComposerOpen &&
      !isSearchOpen &&
      !isEventSheetOpen &&
      !isUploadSheetOpen &&
      !isContactSheetOpen &&
      !isRepoSheetOpen &&
      !isVoiceChatSheetOpen &&
      !isAppSwitcherOpen &&
      !isPhoneVerificationOpen &&
      selectedMailThread == null
  ) {
    activeTab = ProductivityTab.Mail
  }

  // Native Android back press navigates WebView history (guarded when sheets and native mode are inactive)
  BackHandler(
    enabled = !isComposerOpen &&
      !isAppSwitcherOpen &&
      !isPhoneVerificationOpen &&
      !isSearchOpen &&
      !isEventSheetOpen &&
      !isUploadSheetOpen &&
      !isContactSheetOpen &&
      !isRepoSheetOpen &&
      !isVoiceChatSheetOpen &&
      selectedMailThread == null &&
      !isNativeMode &&
      webViewRef?.canGoBack() == true
  ) {
    webViewRef?.goBack()
  }

  if (!isAuthenticated) {
    QuantLoginScreen(
      onLoginSuccess = { user ->
        currentUser = user
        isAuthenticated = true
      },
      onContinueWithSso = {
        MainActivity.launchCustomTab(context, "${BuildConfig.DEFAULT_APP_URL}auth/sso")
      },
      modifier = modifier
    )
    return
  }

  Box(modifier = modifier.fillMaxSize()) {
    Scaffold(
      modifier = Modifier
        .fillMaxSize()
        .nestedScroll(nestedScrollConnection)
        .background(Color(0xFF0B, 0x0C, 0x0E)),
      containerColor = Color(0xFF0B, 0x0C, 0x0E),
      topBar = {
        if (isProductivitySuite && !isError) {
          QuantPillarTopBar(
            activeTab = activeTab,
            onTabSelected = { tab ->
              nativeBridge?.triggerHaptic("medium")
              if (activeTab != tab) {
                activeTab = tab
                currentSubTabId = null
                selectedLensId = "all"
                webViewRef?.loadUrl(tab.url)
              }
            },
            selectedLensId = selectedLensId,
            onLensSelected = { lensId ->
              nativeBridge?.triggerHaptic("light")
              selectedLensId = lensId
            },
            onSearchClick = {
              nativeBridge?.triggerHaptic("light")
              isSearchOpen = true
            },
            onVoiceClick = {
              nativeBridge?.triggerHaptic("medium")
              isVoiceChatSheetOpen = true
            },
            onAiCapsuleClick = {
              nativeBridge?.triggerHaptic("medium")
              isVoiceChatSheetOpen = true
            }
          )
        }
      },
      bottomBar = {
        if (isProductivitySuite && !isError) {
          ContextBottomNavBar(
            activePillar = activeTab,
            selectedTabId = currentSubTabId,
            accentColor = activeTab.tabAccentColor,
            isVisible = isBottomNavVisible,
            onTabSelected = { dest ->
              nativeBridge?.triggerHaptic("light")
              currentSubTabId = dest.id
            }
          )
        }
      },
      floatingActionButton = {
        if (isProductivitySuite && !isError) {
          AnimatedContent(
            targetState = activeTab,
            transitionSpec = {
              fadeIn(animationSpec = spring(stiffness = Spring.StiffnessMediumLow)) togetherWith
              fadeOut(animationSpec = spring(stiffness = Spring.StiffnessMediumLow))
            },
            label = "fabTransition"
          ) { tab ->
            ExtendedFloatingActionButton(
              onClick = {
                nativeBridge?.triggerHaptic("medium")
                when (tab) {
                  ProductivityTab.Mail -> {
                    // Open native Jetpack Compose composer modal sheet!
                    isComposerOpen = true
                    webViewRef?.evaluateJavascript(
                      """
                      window.dispatchEvent(new CustomEvent('quant:compose'));
                      """.trimIndent(),
                      null
                    )
                  }
                  ProductivityTab.Calendar -> {
                    // Open native Jetpack Compose calendar event sheet!
                    isEventSheetOpen = true
                    webViewRef?.evaluateJavascript(
                      """
                      window.dispatchEvent(new CustomEvent('quant:calendar:new_event'));
                      if (!window.location.pathname.includes('/calendar')) {
                        window.location.href = 'https://quantmail.in/calendar?action=new';
                      }
                      """.trimIndent(),
                      null
                    )
                  }
                  ProductivityTab.Drive -> {
                    // Open native Jetpack Compose drive upload quick actions sheet!
                    isUploadSheetOpen = true
                    webViewRef?.evaluateJavascript(
                      """
                      window.dispatchEvent(new CustomEvent('quant:drive:upload'));
                      if (!window.location.pathname.includes('/drive')) {
                        window.location.href = 'https://quantmail.in/drive?action=upload';
                      }
                      """.trimIndent(),
                      null
                    )
                  }
                  ProductivityTab.Contacts -> {
                    // Open native Jetpack Compose new contact modal sheet!
                    isContactSheetOpen = true
                    webViewRef?.evaluateJavascript(
                      """
                      window.dispatchEvent(new CustomEvent('quant:contacts:new_contact'));
                      if (!window.location.pathname.includes('/contacts')) {
                        window.location.href = 'https://quantmail.in/contacts?action=new';
                      }
                      """.trimIndent(),
                      null
                    )
                  }
                  ProductivityTab.QuantGit -> {
                    // Open native Jetpack Compose repo creation modal sheet!
                    isRepoSheetOpen = true
                    webViewRef?.evaluateJavascript(
                      """
                      window.dispatchEvent(new CustomEvent('quant:codehub:new_repo'));
                      if (!window.location.pathname.includes('/quantgit')) {
                        window.location.href = 'https://quantmail.in/quantgit?action=new';
                      }
                      """.trimIndent(),
                      null
                    )
                  }
                }
              },
              icon = {
                Icon(
                  imageVector = tab.fabIcon,
                  contentDescription = tab.fabLabel,
                  modifier = Modifier.size(20.dp)
                )
              },
              text = {
                Text(
                  text = tab.fabLabel,
                  fontWeight = FontWeight.Bold,
                  fontSize = 13.sp
                )
              },
              containerColor = tab.tabAccentColor,
              contentColor = Color.Black,
              shape = RoundedCornerShape(16.dp),
              elevation = FloatingActionButtonDefaults.elevation(
                defaultElevation = 6.dp,
                pressedElevation = 10.dp
              ),
              modifier = Modifier.padding(bottom = 16.dp, end = 4.dp)
            )
          }
        }
      }
    ) { innerPadding ->
      Box(
        modifier = Modifier
          .fillMaxSize()
          .padding(innerPadding)
          .background(Color(0xFF0B, 0x0C, 0x0E))
      ) {
        if (isNativeMode) {
          when (activeTab) {
            ProductivityTab.Mail -> {
              NativeMailView(
                subTabId = currentSubTabId,
                accentColor = Color(0xFFFF, 0x8C, 0x42),
                onThreadClick = { thread ->
                  nativeBridge?.triggerHaptic("light")
                  selectedMailThread = thread.toSearchResultItem()
                }
              )
            }
            ProductivityTab.Calendar -> {
              NativeCalendarView(
                subTabId = currentSubTabId,
                onNewEventClick = {
                  nativeBridge?.triggerHaptic("medium")
                  isEventSheetOpen = true
                }
              )
            }
            ProductivityTab.Drive -> {
              NativeDriveView(
                subTabId = currentSubTabId,
                accentColor = Color(0xFF38, 0xBD, 0xF8),
                onFileClick = { file ->
                  nativeBridge?.triggerHaptic("light")
                }
              )
            }
            ProductivityTab.Contacts -> {
              NativeContactsView(
                subTabId = currentSubTabId,
                onNewContactClick = {
                  nativeBridge?.triggerHaptic("medium")
                  isContactSheetOpen = true
                },
                onComposeEmail = { email ->
                  nativeBridge?.triggerHaptic("light")
                  isComposerOpen = true
                },
                accentColor = Color(0xFF10, 0xB9, 0x81)
              )
            }
            ProductivityTab.QuantGit -> {
              NativeCodeHubView(
                subTabId = currentSubTabId,
                onNewRepoClick = {
                  nativeBridge?.triggerHaptic("medium")
                  isRepoSheetOpen = true
                },
                accentColor = Color(0xFFA7, 0x8B, 0xFA)
              )
            }
          }
        } else {
          if (isError) {
            Column(
              modifier = Modifier
                .fillMaxSize()
                .padding(32.dp),
              verticalArrangement = Arrangement.Center,
              horizontalAlignment = Alignment.CenterHorizontally
            ) {
              Box(
                modifier = Modifier
                  .size(64.dp)
                  .background(Color(0xFF16, 0x18, 0x1D), shape = RoundedCornerShape(16.dp)),
                contentAlignment = Alignment.Center
              ) {
                Text(text = "⚡", fontSize = 32.sp)
              }
              Spacer(modifier = Modifier.height(20.dp))
              Text(
                text = "Connection Offline",
                color = Color.White,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(bottom = 8.dp)
              )
              Text(
                text = "Unable to connect to ${BuildConfig.APP_NAME} sovereign server. Please check your internet connection and try again.",
                color = Color(0xFF9C, 0xA3, 0xAF),
                fontSize = 14.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(bottom = 24.dp)
              )
              Button(
                onClick = {
                  isError = false
                  isLoading = true
                  webViewRef?.reload()
                },
                colors = ButtonDefaults.buttonColors(
                  containerColor = accentColor,
                  contentColor = Color.Black
                ),
                shape = RoundedCornerShape(12.dp)
              ) {
                Text(text = "Retry Connection", fontWeight = FontWeight.Bold)
              }
            }
          } else {
            AndroidView(
              modifier = Modifier.fillMaxSize(),
              factory = { context ->
                val swipeRefresh = SwipeRefreshLayout(context).apply {
                  setColorSchemeColors(accentColor.toArgb())
                  setProgressBackgroundColorSchemeColor(android.graphics.Color.parseColor("#16181D"))
                  layoutParams = ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                  )
                }

                val webView = WebView(context).apply {
                  layoutParams = ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                  )
                  setBackgroundColor(android.graphics.Color.parseColor("#0B0C0E"))

                  // Hardened production WebSettings
                  MainActivity.configureWebSettings(settings)

                  // Attach QuantNativeBridge JavaScript interface
                  val activity = context.findActivity()
                  if (activity != null) {
                    val bridge = QuantNativeBridge(activity, this)
                    nativeBridge = bridge
                    addJavascriptInterface(bridge, "QuantNativeBridge")
                    addJavascriptInterface(bridge, "AndroidBridge")
                  }

                  webViewClient = object : WebViewClient() {
                    override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                      isLoading = true
                      isError = false
                      if (url != null) {
                        activeTab = ProductivityTab.fromUrl(url)
                      }
                    }

                    override fun onPageFinished(view: WebView?, url: String?) {
                      isLoading = false
                      swipeRefresh.isRefreshing = false
                      if (url != null) {
                        activeTab = ProductivityTab.fromUrl(url)
                      }

                      // Inject global bridge aliases and event notification into the DOM
                      view?.evaluateJavascript(
                        """
                        if (typeof window.QuantNative === 'undefined' && typeof window.QuantNativeBridge !== 'undefined') {
                          window.QuantNative = window.QuantNativeBridge;
                        }
                        if (typeof window.AndroidBridge === 'undefined' && typeof window.QuantNativeBridge !== 'undefined') {
                          window.AndroidBridge = window.QuantNativeBridge;
                        }
                        window.dispatchEvent(new CustomEvent('quant:native_bridge_ready'));
                        """.trimIndent(),
                        null
                      )
                    }

                    override fun onReceivedError(
                      view: WebView?,
                      request: WebResourceRequest?,
                      error: WebResourceError?
                    ) {
                      if (request?.isForMainFrame == true) {
                        isError = true
                        isLoading = false
                        swipeRefresh.isRefreshing = false
                      }
                    }

                    override fun onReceivedSslError(
                      view: WebView?,
                      handler: SslErrorHandler?,
                      error: SslError?
                    ) {
                      handler?.cancel()
                    }

                    override fun shouldOverrideUrlLoading(
                      view: WebView?,
                      request: WebResourceRequest?
                    ): Boolean {
                      val url = request?.url?.toString() ?: return false
                      return handleNavigation(url)
                    }

                    @Deprecated("Deprecated in Java")
                    override fun shouldOverrideUrlLoading(
                      view: WebView?,
                      url: String?
                    ): Boolean {
                      if (url == null) return false
                      return handleNavigation(url)
                    }

                    private fun handleNavigation(url: String): Boolean {
                      if (MainActivity.isExternalAuthUrl(url)) {
                        MainActivity.launchCustomTab(context, url)
                        return true
                      }
                      return false
                    }
                  }

                  webChromeClient = object : WebChromeClient() {
                    override fun onProgressChanged(view: WebView?, newProgress: Int) {
                      loadProgress = newProgress
                      if (newProgress >= 100) {
                        isLoading = false
                        swipeRefresh.isRefreshing = false
                      }
                    }
                  }

                  // Load initial target URL
                  val initialUrl = deepLinkUrl?.takeIf { it.isNotBlank() } ?: BuildConfig.DEFAULT_APP_URL
                  loadUrl(initialUrl)
                }

                swipeRefresh.addView(webView)
                swipeRefresh.setOnRefreshListener {
                  webView.reload()
                }

                webViewRef = webView
                swipeRefreshRef = swipeRefresh
                onWebViewAttached(webView)

                swipeRefresh
              },
              update = {
                // Keep references in sync
              }
            )
          }

          // Sleek Edge-to-Edge Progress Bar directly under the TopBar (only in Cloud WebView mode)
          AnimatedVisibility(
            visible = !isNativeMode && isLoading,
            enter = fadeIn(),
            exit = fadeOut(),
            modifier = Modifier
              .align(Alignment.TopCenter)
          ) {
            LinearProgressIndicator(
              progress = { loadProgress / 100f },
              modifier = Modifier
                .fillMaxWidth()
                .height(2.5.dp),
              color = accentColor,
              trackColor = Color.Transparent
            )
          }
        }
      }
    }


    // Modern Native Jetpack Compose Email Composer Modal Sheet
    AnimatedVisibility(
      visible = isComposerOpen,
      enter = slideInVertically(
        initialOffsetY = { fullHeight -> fullHeight },
        animationSpec = spring(stiffness = Spring.StiffnessMediumLow, dampingRatio = Spring.DampingRatioLowBouncy)
      ) + fadeIn(),
      exit = slideOutVertically(
        targetOffsetY = { fullHeight -> fullHeight },
        animationSpec = spring(stiffness = Spring.StiffnessMediumLow)
      ) + fadeOut()
    ) {
      NativeEmailComposerSheet(
        onDismiss = { isComposerOpen = false },
        onSend = { to, subject, body ->
          nativeBridge?.triggerHaptic("heavy")
          coroutineScope.launch(Dispatchers.IO) {
            QuantBackendClient.sendEmail(to, subject, body, currentUser.token)
          }
          webViewRef?.evaluateJavascript(
            """
            window.dispatchEvent(new CustomEvent('quant:mail:sent', {
              detail: { to: ${JSONObject.quote(to)}, subject: ${JSONObject.quote(subject)}, body: ${JSONObject.quote(body)} }
            }));
            """.trimIndent(),
            null
          )
          isComposerOpen = false
        },
        accentColor = accentColor
      )
    }

    // Dedicated QuantMail Account & Workspace Manager Bottom Sheet
    if (isAppSwitcherOpen) {
      QuantAccountProfileSheet(
        onDismiss = { isAppSwitcherOpen = false },
        onLogout = {
          nativeBridge?.triggerHaptic("heavy")
          QuantAuthManager.logout(context)
          isAppSwitcherOpen = false
          isAuthenticated = false
        },
        onWorkspaceChanged = { newWorkspace ->
          currentUser = QuantAuthManager.getCurrentUser(context)
          nativeBridge?.triggerHaptic("selection")
        },
        onOpenPhoneVerification = {
          isAppSwitcherOpen = false
          isPhoneVerificationOpen = true
        }
      )
    }

    // Fast Search Overlay matching Superhuman and Gmail
    AnimatedVisibility(
      visible = isSearchOpen,
      enter = fadeIn() + slideInVertically(),
      exit = fadeOut() + slideOutVertically()
    ) {
      NativeSearchOverlay(
        onDismiss = { isSearchOpen = false },
        onResultClick = { item ->
          nativeBridge?.triggerHaptic("medium")
          webViewRef?.evaluateJavascript(
            """
            window.dispatchEvent(new CustomEvent('quant:search:result_selected', {
              detail: { id: '${item.id}', subject: ${JSONObject.quote(item.subject)}, sender: ${JSONObject.quote(item.sender)} }
            }));
            """.trimIndent(),
            null
          )
        },
        accentColor = accentColor
      )
    }

    // Native Jetpack Compose Calendar Event Modal Sheet
    AnimatedVisibility(
      visible = isEventSheetOpen,
      enter = slideInVertically(
        initialOffsetY = { fullHeight -> fullHeight },
        animationSpec = spring(stiffness = Spring.StiffnessMediumLow, dampingRatio = Spring.DampingRatioLowBouncy)
      ) + fadeIn(),
      exit = slideOutVertically(
        targetOffsetY = { fullHeight -> fullHeight },
        animationSpec = spring(stiffness = Spring.StiffnessMediumLow)
      ) + fadeOut()
    ) {
      NativeCalendarEventSheet(
        onDismiss = { isEventSheetOpen = false },
        onSave = { title, dateTime, attendees, isMeetLink ->
          nativeBridge?.triggerHaptic("heavy")
          EcosystemStateStore.addEvent(title, dateTime, attendees, isMeetLink)
          coroutineScope.launch(Dispatchers.IO) {
            QuantBackendClient.createEvent(title, dateTime, attendees, isMeetLink, currentUser.token)
          }
          webViewRef?.evaluateJavascript(
            """
            window.dispatchEvent(new CustomEvent('quant:calendar:event_created', {
              detail: {
                title: ${JSONObject.quote(title)},
                dateTime: ${JSONObject.quote(dateTime)},
                attendees: ${JSONObject.quote(attendees.joinToString(","))},
                isMeetLink: $isMeetLink
              }
            }));
            """.trimIndent(),
            null
          )
          isEventSheetOpen = false
        },
        accentColor = Color(0xFFF5, 0x9E, 0x0B)
      )
    }

    // Native Jetpack Compose Drive Quick Actions Bottom Sheet
    if (isUploadSheetOpen) {
      NativeDriveUploadSheet(
        onDismiss = { isUploadSheetOpen = false },
        onActionSelected = { actionId ->
          nativeBridge?.triggerHaptic("medium")
          val (fileName, fileSize, fileType) = when (actionId) {
            "upload" -> Triple("FastCDC_Uploaded_Doc_${System.currentTimeMillis() % 1000}.pdf", "2.8 MB", "file")
            "scan" -> Triple("OCR_Scanned_Document_${System.currentTimeMillis() % 1000}.pdf", "1.2 MB", "scan")
            "folder" -> Triple("Encrypted_Workspace_Folder", "0 KB", "folder")
            "offline_pin" -> Triple("Offline_Pinned_Vault.zip", "18.5 MB", "offline")
            else -> Triple("Drive_Document.pdf", "1.4 MB", "file")
          }
          EcosystemStateStore.addFile(fileName, fileSize, fileType)
          coroutineScope.launch(Dispatchers.IO) {
            QuantBackendClient.uploadDriveFile(fileName, fileSize, fileType, currentUser.token)
          }
          webViewRef?.evaluateJavascript(
            """
            window.dispatchEvent(new CustomEvent('quant:drive:action', {
              detail: { action: '$actionId' }
            }));
            """.trimIndent(),
            null
          )
          isUploadSheetOpen = false
        },
        accentColor = Color(0xFF0E, 0xA5, 0xE9)
      )
    }

    // Native Jetpack Compose Contact Creation Modal Sheet
    AnimatedVisibility(
      visible = isContactSheetOpen,
      enter = slideInVertically(
        initialOffsetY = { fullHeight -> fullHeight },
        animationSpec = spring(stiffness = Spring.StiffnessMediumLow, dampingRatio = Spring.DampingRatioLowBouncy)
      ) + fadeIn(),
      exit = slideOutVertically(
        targetOffsetY = { fullHeight -> fullHeight },
        animationSpec = spring(stiffness = Spring.StiffnessMediumLow)
      ) + fadeOut()
    ) {
      NativeContactCreationSheet(
        onDismiss = { isContactSheetOpen = false },
        onSave = { name, email, phone, company, role, tag, isVip ->
          nativeBridge?.triggerHaptic("heavy")
          EcosystemStateStore.addContact(name, email, phone, company, role, tag, isVip)
          coroutineScope.launch(Dispatchers.IO) {
            QuantBackendClient.createContact(name, email, phone, company, role, tag, isVip, currentUser.token)
          }
          webViewRef?.evaluateJavascript(
            """
            window.dispatchEvent(new CustomEvent('quant:contacts:contact_created', {
              detail: {
                name: ${JSONObject.quote(name)},
                email: ${JSONObject.quote(email)},
                phone: ${JSONObject.quote(phone ?: "")},
                company: ${JSONObject.quote(company ?: "")},
                role: ${JSONObject.quote(role ?: "")},
                tag: ${JSONObject.quote(tag)},
                isVip: $isVip
              }
            }));
            """.trimIndent(),
            null
          )
          isContactSheetOpen = false
        },
        accentColor = Color(0xFF0E, 0xA5, 0xE9)
      )
    }

    // Native Jetpack Compose CodeHub Create Repository Modal Sheet
    AnimatedVisibility(
      visible = isRepoSheetOpen,
      enter = slideInVertically(
        initialOffsetY = { fullHeight -> fullHeight },
        animationSpec = spring(stiffness = Spring.StiffnessMediumLow, dampingRatio = Spring.DampingRatioLowBouncy)
      ) + fadeIn(),
      exit = slideOutVertically(
        targetOffsetY = { fullHeight -> fullHeight },
        animationSpec = spring(stiffness = Spring.StiffnessMediumLow)
      ) + fadeOut()
    ) {
      NativeRepoCreationSheet(
        onDismiss = { isRepoSheetOpen = false },
        onCreate = { name, desc, isPriv, initReadme, addGitignore, addLicense ->
          nativeBridge?.triggerHaptic("heavy")
          EcosystemStateStore.addRepo(name, desc, isPriv)
          coroutineScope.launch(Dispatchers.IO) {
            QuantBackendClient.createRepo(name, desc, isPriv, currentUser.token)
          }
          webViewRef?.evaluateJavascript(
            """
            window.dispatchEvent(new CustomEvent('quant:codehub:repo_created', {
              detail: {
                name: ${JSONObject.quote(name)},
                description: ${JSONObject.quote(desc)},
                isPrivate: $isPriv,
                initReadme: $initReadme,
                addGitignore: $addGitignore,
                addLicense: $addLicense
              }
            }));
            """.trimIndent(),
            null
          )
          isRepoSheetOpen = false
        },
        accentColor = Color(0xFF10, 0xB9, 0x81)
      )
    }

    // Native Jetpack Compose Quanty AI Voice & Prompt Starters Bottom Sheet
    if (isVoiceChatSheetOpen) {
      NativeVoiceChatSheet(
        onDismiss = { isVoiceChatSheetOpen = false },
        onStartVoiceMode = { persona ->
          nativeBridge?.triggerHaptic("heavy")
          EcosystemStateStore.addChatMessage(persona, "Voice session started with $persona. Listening...")
          webViewRef?.evaluateJavascript(
            """
            window.dispatchEvent(new CustomEvent('quant:ai:voice_start', {
              detail: { persona: '$persona' }
            }));
            """.trimIndent(),
            null
          )
          isVoiceChatSheetOpen = false
        },
        onPromptSelected = { prompt ->
          nativeBridge?.triggerHaptic("medium")
          EcosystemStateStore.addChatMessage("user", prompt)
          EcosystemStateStore.addChatMessage("Quanty AI", "Processing '$prompt' across the sovereign Quant Ecosystem...")
          webViewRef?.evaluateJavascript(
            """
            window.dispatchEvent(new CustomEvent('quant:ai:prompt_send', {
              detail: { prompt: ${JSONObject.quote(prompt)} }
            }));
            """.trimIndent(),
            null
          )
          isVoiceChatSheetOpen = false
        },
        accentColor = Color(0xFF8B, 0x5C, 0xF6)
      )
    }

    // Native Thread Detail Modal for NativeMailView thread clicks
    selectedMailThread?.let { threadItem ->
      NativeThreadDetailModal(
        item = threadItem,
        onDismiss = { selectedMailThread = null },
        onReply = { item ->
          selectedMailThread = null
          isComposerOpen = true
        },
        accentColor = accentColor
      )
    }

    // Sovereign Mobile Phone OTP Verification Modal
    if (isPhoneVerificationOpen) {
      QuantPhoneVerificationScreen(
        initialPhoneNumber = currentUser.phoneNumber ?: "",
        onVerificationSuccess = { verifiedPhone, _ ->
          QuantAuthManager.savePhoneVerification(context, verifiedPhone)
          currentUser = QuantAuthManager.getCurrentUser(context)
          nativeBridge?.triggerHaptic("success")
          android.widget.Toast.makeText(
            context,
            "Phone verified: $verifiedPhone",
            android.widget.Toast.LENGTH_SHORT
          ).show()
          isPhoneVerificationOpen = false
        },
        onDismiss = {
          isPhoneVerificationOpen = false
        }
      )
    }
  }
}

