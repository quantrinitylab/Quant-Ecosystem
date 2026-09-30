package com.quant.app.auth

import android.content.Context
import com.quant.app.network.QuantBackendClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext

/**
 * State lifecycle representing the sovereign phone authentication flow.
 */
sealed class PhoneAuthState {
    object Idle : PhoneAuthState()
    object SendingCode : PhoneAuthState()
    data class CodeSent(val phoneNumber: String, val isDemo: Boolean, val demoCode: String? = null) : PhoneAuthState()
    object Verifying : PhoneAuthState()
    data class Verified(val phoneNumber: String) : PhoneAuthState()
    data class Error(val message: String) : PhoneAuthState()
}

/**
 * Sovereign Phone Authentication Manager for QuantMail Android.
 *
 * Orchestrates OTP dispatch, SMS verification, session state lifecycle,
 * and sovereign user profile promotion upon verified phone authentication.
 */
object QuantPhoneAuthManager {

    private val _state = MutableStateFlow<PhoneAuthState>(PhoneAuthState.Idle)
    val state: StateFlow<PhoneAuthState> = _state.asStateFlow()

    val currentState: PhoneAuthState get() = _state.value

    /**
     * Resets the authentication state back to Idle.
     */
    fun resetState() {
        _state.value = PhoneAuthState.Idle
    }

    /**
     * Dispatches an OTP verification code to the target phone number.
     */
    suspend fun sendOtp(context: Context, phoneNumber: String): Boolean = withContext(Dispatchers.IO) {
        val cleanPhone = phoneNumber.trim()
        if (cleanPhone.isBlank()) {
            _state.value = PhoneAuthState.Error("Phone number cannot be empty")
            return@withContext false
        }

        _state.value = PhoneAuthState.SendingCode
        val token = QuantAuthManager.getCurrentUser(context).token
        val result = QuantBackendClient.sendPhoneOtp(cleanPhone, token)

        if (result.isSuccess) {
            val otpResult = result.getOrThrow()
            if (otpResult.success) {
                _state.value = PhoneAuthState.CodeSent(
                    phoneNumber = cleanPhone,
                    isDemo = otpResult.isDemo,
                    demoCode = otpResult.demoCode
                )
                return@withContext true
            } else {
                _state.value = PhoneAuthState.Error(otpResult.message)
                return@withContext false
            }
        } else {
            val errorMsg = result.exceptionOrNull()?.message ?: "Failed to dispatch verification code"
            _state.value = PhoneAuthState.Error(errorMsg)
            return@withContext false
        }
    }

    /**
     * Verifies the submitted OTP code against backend / sovereign demo rules.
     * On successful verification, updates local session storage via QuantAuthManager.
     */
    suspend fun verifyOtp(context: Context, phoneNumber: String, code: String): Boolean = withContext(Dispatchers.IO) {
        val cleanPhone = phoneNumber.trim()
        val cleanCode = code.trim()

        if (cleanPhone.isBlank()) {
            _state.value = PhoneAuthState.Error("Phone number cannot be empty")
            return@withContext false
        }
        if (cleanCode.isBlank()) {
            _state.value = PhoneAuthState.Error("Verification code cannot be empty")
            return@withContext false
        }

        _state.value = PhoneAuthState.Verifying
        val token = QuantAuthManager.getCurrentUser(context).token
        val result = QuantBackendClient.verifyPhoneOtp(cleanPhone, cleanCode, token)

        if (result.isSuccess) {
            val verifyResult = result.getOrThrow()
            if (verifyResult.verified) {
                QuantAuthManager.savePhoneVerification(context, cleanPhone)
                _state.value = PhoneAuthState.Verified(cleanPhone)
                return@withContext true
            } else {
                _state.value = PhoneAuthState.Error(verifyResult.message)
                return@withContext false
            }
        } else {
            val errorMsg = result.exceptionOrNull()?.message ?: "Verification failed"
            _state.value = PhoneAuthState.Error(errorMsg)
            return@withContext false
        }
    }

    /**
     * Re-dispatches an OTP verification code to the target phone number.
     */
    suspend fun resendOtp(context: Context, phoneNumber: String): Boolean {
        return sendOtp(context, phoneNumber)
    }

    /**
     * Logs into or creates a sovereign user session associated with the verified phone number.
     */
    fun loginWithPhone(context: Context, phoneNumber: String): UserProfile {
        return QuantAuthManager.loginWithPhone(context, phoneNumber)
    }
}
