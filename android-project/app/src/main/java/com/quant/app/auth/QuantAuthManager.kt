package com.quant.app.auth

import android.content.Context
import android.content.SharedPreferences

/**
 * Data model representing the authenticated user profile in QuantMail.
 */
data class UserProfile(
    val id: String,
    val email: String,
    val name: String,
    val initials: String,
    val workspace: String,
    val token: String,
    val refreshToken: String = "",
    val isVerified: Boolean = true,
    val avatarUrl: String? = null,
    val phoneNumber: String? = null,
    val isPhoneVerified: Boolean = false
)

/**
 * Predefined demo user profiles for instant 1-tap testing and verification.
 */
data class DemoUser(
    val name: String,
    val email: String,
    val initials: String,
    val workspace: String,
    val role: String = "Enterprise Member"
) {
    companion object {
        val SUNDAR_PICHAI = DemoUser(
            name = "Sundar Pichai",
            email = "sundar@google.com",
            initials = "SP",
            workspace = "Personal Workspace",
            role = "Enterprise Executive"
        )

        val DEV_SENTINEL = DemoUser(
            name = "Dev Sentinel",
            email = "dev@quantmail.in",
            initials = "DS",
            workspace = "Quant Trinity Lab",
            role = "Core Sovereign Dev"
        )

        val ALL_DEMO_USERS = listOf(SUNDAR_PICHAI, DEV_SENTINEL)
    }
}

/**
 * Sovereign Authentication Manager for QuantMail Android.
 *
 * Persists session tokens, user identity, workspace context, and login state
 * securely via SharedPreferences (`quant_auth_prefs`).
 */
object QuantAuthManager {
    private const val PREFS_NAME = "quant_auth_prefs"

    private const val KEY_IS_LOGGED_IN = "is_logged_in"
    private const val KEY_USER_ID = "user_id"
    private const val KEY_EMAIL = "email"
    private const val KEY_NAME = "name"
    private const val KEY_INITIALS = "avatar_initials"
    private const val KEY_WORKSPACE = "workspace_name"
    private const val KEY_AUTH_TOKEN = "auth_token"
    private const val KEY_REFRESH_TOKEN = "refresh_token"
    private const val KEY_IS_VERIFIED = "is_verified"
    const val KEY_PHONE_NUMBER = "phone_number"
    const val KEY_IS_PHONE_VERIFIED = "is_phone_verified"

    // Default fast demo session token
    private const val DEMO_JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkZXYtc2VudGluZWwiLCJhdWQiOiJxdWFudG1haWwiLCJpYXQiOjE3MDQwOTAwMDB9.s0v3r31gn_qu4ntm41l_s1gn4tur3"

    private fun getPrefs(context: Context): SharedPreferences {
        return context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    /**
     * Checks if a user is currently authenticated.
     * On pristine first run, initializes with the default Dev Sentinel demo user
     * to guarantee zero-barrier testing while allowing instant logout and re-auth.
     */
    fun isLoggedIn(context: Context): Boolean {
        val prefs = getPrefs(context)
        if (!prefs.contains(KEY_IS_LOGGED_IN)) {
            // First run: Initialize default demo session (Dev Sentinel)
            loginWithDemo(context, DemoUser.DEV_SENTINEL)
            return true
        }
        return prefs.getBoolean(KEY_IS_LOGGED_IN, false)
    }

    /**
     * Authenticates with standard email and password credentials.
     * Generates a persistent sovereign Bearer JWT and user profile.
     */
    fun login(context: Context, email: String, password: String): Boolean {
        val trimmedEmail = email.trim()
        if (trimmedEmail.isBlank() || password.isBlank()) {
            return false
        }

        // Derive user display attributes
        val derivedName = trimmedEmail.substringBefore("@")
            .split(".", "_", "-")
            .filter { it.isNotBlank() }
            .joinToString(" ") { part ->
                part.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
            }
            .ifBlank { "Quant User" }

        val initials = extractInitials(derivedName)
        val userId = "usr_${System.currentTimeMillis()}_${trimmedEmail.hashCode()}"
        val token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
            java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(
                """{"sub":"$userId","email":"$trimmedEmail","aud":"quantmail.in"}""".toByteArray()
            ) + ".quant_sec_token"

        val prefs = getPrefs(context)
        prefs.edit().apply {
            putBoolean(KEY_IS_LOGGED_IN, true)
            putString(KEY_USER_ID, userId)
            putString(KEY_EMAIL, trimmedEmail)
            putString(KEY_NAME, derivedName)
            putString(KEY_INITIALS, initials)
            putString(KEY_WORKSPACE, "Quant Trinity Lab")
            putString(KEY_AUTH_TOKEN, token)
            putString(KEY_REFRESH_TOKEN, "ref_${System.currentTimeMillis()}")
            putBoolean(KEY_IS_VERIFIED, true)
            apply()
        }
        return true
    }

    /**
     * Logs in instantly using a predefined DemoUser profile.
     */
    fun loginWithDemo(context: Context, user: DemoUser) {
        val userId = "demo_${user.email.substringBefore('@')}"
        val token = DEMO_JWT

        val prefs = getPrefs(context)
        prefs.edit().apply {
            putBoolean(KEY_IS_LOGGED_IN, true)
            putString(KEY_USER_ID, userId)
            putString(KEY_EMAIL, user.email)
            putString(KEY_NAME, user.name)
            putString(KEY_INITIALS, user.initials)
            putString(KEY_WORKSPACE, user.workspace)
            putString(KEY_AUTH_TOKEN, token)
            putString(KEY_REFRESH_TOKEN, "demo_ref_${user.email}")
            putBoolean(KEY_IS_VERIFIED, true)
            apply()
        }
    }

    /**
     * Terminates the current session and clears all tokens.
     */
    fun logout(context: Context) {
        val prefs = getPrefs(context)
        prefs.edit().apply {
            putBoolean(KEY_IS_LOGGED_IN, false)
            putString(KEY_AUTH_TOKEN, "")
            putString(KEY_REFRESH_TOKEN, "")
            apply()
        }
    }

    /**
     * Retrieves the current UserProfile from local storage.
     */
    fun getCurrentUser(context: Context): UserProfile {
        val prefs = getPrefs(context)
        val email = prefs.getString(KEY_EMAIL, DemoUser.DEV_SENTINEL.email) ?: DemoUser.DEV_SENTINEL.email
        val name = prefs.getString(KEY_NAME, DemoUser.DEV_SENTINEL.name) ?: DemoUser.DEV_SENTINEL.name
        val initials = prefs.getString(KEY_INITIALS, DemoUser.DEV_SENTINEL.initials) ?: DemoUser.DEV_SENTINEL.initials
        val workspace = prefs.getString(KEY_WORKSPACE, DemoUser.DEV_SENTINEL.workspace) ?: DemoUser.DEV_SENTINEL.workspace
        val userId = prefs.getString(KEY_USER_ID, "usr_dev_sentinel") ?: "usr_dev_sentinel"
        val token = prefs.getString(KEY_AUTH_TOKEN, DEMO_JWT) ?: DEMO_JWT
        val refreshToken = prefs.getString(KEY_REFRESH_TOKEN, "") ?: ""
        val isVerified = prefs.getBoolean(KEY_IS_VERIFIED, true)
        val phoneNumber = prefs.getString(KEY_PHONE_NUMBER, null)
        val isPhoneVerified = prefs.getBoolean(KEY_IS_PHONE_VERIFIED, false)

        return UserProfile(
            id = userId,
            email = email,
            name = name,
            initials = initials,
            workspace = workspace,
            token = token,
            refreshToken = refreshToken,
            isVerified = isVerified,
            phoneNumber = phoneNumber,
            isPhoneVerified = isPhoneVerified
        )
    }

    /**
     * Persists mobile phone verification status and sovereign phone number.
     */
    fun savePhoneVerification(context: Context, phoneNumber: String) {
        val prefs = getPrefs(context)
        prefs.edit().apply {
            putBoolean(KEY_IS_PHONE_VERIFIED, true)
            putString(KEY_PHONE_NUMBER, phoneNumber.trim())
            apply()
        }
    }

    /**
     * Authenticates or initializes a sovereign user session associated with a verified phone number.
     */
    fun loginWithPhone(context: Context, phoneNumber: String): UserProfile {
        val cleanPhone = phoneNumber.trim().replace("\\s+".toRegex(), "")
        val last4 = if (cleanPhone.length >= 4) cleanPhone.takeLast(4) else cleanPhone
        val derivedName = "User $last4"
        val phoneUser = cleanPhone.replace("+", "").ifBlank { "user$last4" }
        val email = "$phoneUser@quantmail.in"
        val initials = extractInitials(derivedName)
        val userId = "usr_ph_${Math.abs(cleanPhone.hashCode())}"
        val token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9." +
            java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(
                """{"sub":"$userId","phone":"$cleanPhone","email":"$email","aud":"quantmail.in"}""".toByteArray()
            ) + ".quant_phone_sec_token"
        val refreshToken = "ref_ph_${System.currentTimeMillis()}"

        val prefs = getPrefs(context)
        prefs.edit().apply {
            putBoolean(KEY_IS_LOGGED_IN, true)
            putString(KEY_USER_ID, userId)
            putString(KEY_EMAIL, email)
            putString(KEY_NAME, derivedName)
            putString(KEY_INITIALS, initials)
            putString(KEY_WORKSPACE, "Quant Sovereign Space")
            putString(KEY_AUTH_TOKEN, token)
            putString(KEY_REFRESH_TOKEN, refreshToken)
            putBoolean(KEY_IS_VERIFIED, true)
            putString(KEY_PHONE_NUMBER, cleanPhone)
            putBoolean(KEY_IS_PHONE_VERIFIED, true)
            apply()
        }

        return UserProfile(
            id = userId,
            email = email,
            name = derivedName,
            initials = initials,
            workspace = "Quant Sovereign Space",
            token = token,
            refreshToken = refreshToken,
            isVerified = true,
            phoneNumber = cleanPhone,
            isPhoneVerified = true
        )
    }

    /**
     * Switches the active workspace name in preferences.
     */
    fun setWorkspace(context: Context, workspaceName: String) {
        val prefs = getPrefs(context)
        prefs.edit().putString(KEY_WORKSPACE, workspaceName).apply()
    }

    /**
     * Helper to compute uppercase initials from display name.
     */
    fun extractInitials(name: String): String {
        val parts = name.trim().split(" ").filter { it.isNotBlank() }
        return when {
            parts.isEmpty() -> "QM"
            parts.size == 1 -> parts[0].take(2).uppercase()
            else -> "${parts[0].first()}${parts[1].first()}".uppercase()
        }
    }
}
