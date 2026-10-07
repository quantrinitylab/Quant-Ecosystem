package com.quant.app.bridge

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.hardware.biometrics.BiometricPrompt
import android.os.Build
import android.os.CancellationSignal
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.Toast
import com.quant.app.BuildConfig
import java.lang.ref.WeakReference
import java.util.UUID

/**
 * JavaScript interface exposed to the WebView web application under `window.QuantNativeBridge`.
 * Provides native Android capabilities:
 * - Persistent Sovereign Device Token
 * - Low-latency Haptic Feedback
 * - Hardware Biometric Authentication (Fingerprint / Face Unlock)
 * - Native System Share Sheet
 */
class QuantNativeBridge(
  private val activity: Activity,
  webView: WebView
) {
  private val context: Context = activity.applicationContext
  private val webViewRef: WeakReference<WebView> = WeakReference(webView)
  private var activeCancellationSignal: CancellationSignal? = null

  /**
   * Returns a persistent sovereign device UUID or token for push notification dispatch and session binding.
   */
  @JavascriptInterface
  fun getDeviceToken(): String {
    val prefs = context.getSharedPreferences("quant_native_prefs", Context.MODE_PRIVATE)
    var token = prefs.getString("quant_device_token", null)
    if (token.isNullOrBlank()) {
      token = "quant-device-${UUID.randomUUID()}"
      prefs.edit().putString("quant_device_token", token).apply()
    }
    return token
  }

  /**
   * Triggers native haptic vibration.
   * Supported types: "light", "click", "medium", "heavy", "success", "warning", "error".
   */
  @JavascriptInterface
  fun triggerHaptic(type: String? = null) {
    try {
      val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val vibratorManager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
        vibratorManager?.defaultVibrator
      } else {
        @Suppress("DEPRECATION")
        context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
      } ?: return

      if (!vibrator.hasVibrator()) return

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val effect = when (type?.lowercase()) {
          "light", "click" -> VibrationEffect.createOneShot(15, VibrationEffect.DEFAULT_AMPLITUDE)
          "medium" -> VibrationEffect.createOneShot(35, VibrationEffect.DEFAULT_AMPLITUDE)
          "heavy" -> VibrationEffect.createOneShot(65, VibrationEffect.DEFAULT_AMPLITUDE)
          "success" -> VibrationEffect.createWaveform(longArrayOf(0, 20, 50, 25), -1)
          "warning" -> VibrationEffect.createWaveform(longArrayOf(0, 30, 40, 30), -1)
          "error" -> VibrationEffect.createWaveform(longArrayOf(0, 40, 50, 40, 50, 40), -1)
          else -> VibrationEffect.createOneShot(20, VibrationEffect.DEFAULT_AMPLITUDE)
        }
        vibrator.vibrate(effect)
      } else {
        @Suppress("DEPRECATION")
        vibrator.vibrate(25)
      }
    } catch (_: Throwable) {
      // Ignore vibration error on unsupported hardware
    }
  }

  /**
   * Prompts the user with native Android Biometric Authentication (Fingerprint / Face ID).
   * Notifies the web application via callbackFunctionName or CustomEvent 'quant:biometric_result'.
   */
  @JavascriptInterface
  fun authenticateBiometrics(callbackFunctionName: String? = null) {
    activity.runOnUiThread {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        try {
          activeCancellationSignal?.cancel()
          val cancellationSignal = CancellationSignal()
          activeCancellationSignal = cancellationSignal

          val prompt = BiometricPrompt.Builder(activity)
            .setTitle("Biometric Authentication")
            .setSubtitle("Confirm identity for ${BuildConfig.APP_NAME}")
            .setDescription("Authenticate using fingerprint or face recognition")
            .setNegativeButton("Cancel", activity.mainExecutor) { _, _ ->
              triggerHaptic("warning")
              notifyCallback(callbackFunctionName, success = false, error = "User cancelled")
            }
            .build()

          prompt.authenticate(cancellationSignal, activity.mainExecutor, object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult?) {
              super.onAuthenticationSucceeded(result)
              triggerHaptic("success")
              notifyCallback(callbackFunctionName, success = true, error = null)
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence?) {
              super.onAuthenticationError(errorCode, errString)
              // Don't report error if user cancelled via negative button (already handled)
              if (errorCode != BiometricPrompt.BIOMETRIC_ERROR_USER_CANCELED &&
                  errorCode != BiometricPrompt.BIOMETRIC_ERROR_CANCELED) {
                triggerHaptic("error")
                notifyCallback(callbackFunctionName, success = false, error = errString?.toString() ?: "Authentication error")
              }
            }

            override fun onAuthenticationFailed() {
              super.onAuthenticationFailed()
              triggerHaptic("error")
              notifyCallback(callbackFunctionName, success = false, error = "Biometrics not recognized")
            }
          })
        } catch (e: Throwable) {
          triggerHaptic("error")
          notifyCallback(callbackFunctionName, success = false, error = e.message ?: "Biometrics exception")
        }
      } else {
        // Fallback for Android 8.0/8.1
        Toast.makeText(activity, "Biometric authentication requires Android 9.0+", Toast.LENGTH_SHORT).show()
        notifyCallback(callbackFunctionName, success = false, error = "Unsupported Android version")
      }
    }
  }

  /**
   * Opens Android native share sheet with text/url.
   */
  @JavascriptInterface
  fun openNativeShare(title: String?, text: String?, url: String?) {
    activity.runOnUiThread {
      try {
        val sendIntent = Intent(Intent.ACTION_SEND).apply {
          this.type = "text/plain"
          val content = buildString {
            if (!text.isNullOrBlank()) append(text)
            if (!url.isNullOrBlank()) {
              if (isNotEmpty()) append(" ")
              append(url)
            }
          }
          putExtra(Intent.EXTRA_TEXT, content)
          if (!title.isNullOrBlank()) {
            putExtra(Intent.EXTRA_TITLE, title)
            putExtra(Intent.EXTRA_SUBJECT, title)
          }
        }
        val chooser = Intent.createChooser(sendIntent, title ?: "Share with Quant")
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        activity.startActivity(chooser)
      } catch (e: Throwable) {
        Toast.makeText(activity, "Unable to share: ${e.message}", Toast.LENGTH_SHORT).show()
      }
    }
  }

  @JavascriptInterface
  fun isNativeAndroid(): Boolean = true

  @JavascriptInterface
  fun getAppFlavor(): String = BuildConfig.FLAVOR

  @JavascriptInterface
  fun getAppName(): String = BuildConfig.APP_NAME

  @JavascriptInterface
  fun getAppVersion(): String = BuildConfig.VERSION_NAME

  private fun notifyCallback(callback: String?, success: Boolean, error: String?) {
    activity.runOnUiThread {
      val webView = webViewRef.get() ?: return@runOnUiThread
      val escapedError = error?.replace("'", "\\'")?.replace("\"", "\\\"") ?: ""
      val js = buildString {
        if (!callback.isNullOrBlank()) {
          append("if (typeof window['$callback'] === 'function') { ")
          append("  window['$callback']({ success: $success, error: '$escapedError' }); ")
          append("} else if (typeof window.onBiometricResult === 'function') { ")
          append("  window.onBiometricResult({ success: $success, error: '$escapedError' }); ")
          append("} ")
        }
        append("window.dispatchEvent(new CustomEvent('quant:biometric_result', { detail: { success: $success, error: '$escapedError' } }));")
      }
      webView.evaluateJavascript(js, null)
    }
  }
}
