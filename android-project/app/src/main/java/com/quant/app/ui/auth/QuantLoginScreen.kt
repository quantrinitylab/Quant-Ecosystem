package com.quant.app.ui.auth

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Email
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.quant.app.auth.DemoUser
import com.quant.app.auth.QuantAuthManager
import com.quant.app.auth.UserProfile
import com.quant.app.ui.components.BrandWordmark
import com.quant.app.ui.components.QuantMailLavaMark
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Sovereign Obsidian Login Screen matching QuantMail Web and Superhuman.
 *
 * Implements a distraction-free, hyper-responsive authentication portal:
 * - VoidCanvas background (Color(0xFF09, 0x0A, 0x0C)).
 * - 48dp molten lava QuantMail logo + split BrandWordmark.
 * - Subtitle: "Sovereign End-to-End Encrypted Productivity Suite".
 * - Frosted obsidian text fields (Color(0xFF11, 0x13, 0x18)).
 * - Molten ember sign-in action button (#FF8C42).
 * - "⚡ Continue with Quant SSO" outlined button.
 * - "1-Tap Quick Demo Login" row with instant emulator test chips.
 * - Compliant cryptography footer badge.
 */
@Composable
fun QuantLoginScreen(
    onLoginSuccess: (UserProfile) -> Unit = {},
    onContinueWithSso: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    val context = LocalContext.current
    val haptic = LocalHapticFeedback.current
    val focusManager = LocalFocusManager.current
    val coroutineScope = rememberCoroutineScope()

    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var isPasswordVisible by remember { mutableStateOf(false) }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    fun executeSignIn() {
        if (email.isBlank()) {
            errorMessage = "Please enter your work email"
            return
        }
        if (password.isBlank()) {
            errorMessage = "Please enter your password"
            return
        }

        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
        isLoading = true
        errorMessage = null

        coroutineScope.launch {
            // High-speed simulated cryptoproof verification
            delay(350)
            val success = QuantAuthManager.login(context, email, password)
            isLoading = false
            if (success) {
                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                onLoginSuccess(QuantAuthManager.getCurrentUser(context))
            } else {
                errorMessage = "Authentication failed. Check your credentials."
            }
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(Color(0xFF09, 0x0A, 0x0C))
            .statusBarsPadding()
            .navigationBarsPadding()
            .imePadding()
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Spacer(modifier = Modifier.height(28.dp))

                // Top: 48dp molten lava QuantMail logo + split BrandWordmark
                QuantMailLavaMark(size = 48.dp)

                Spacer(modifier = Modifier.height(14.dp))

                BrandWordmark(
                    app = "mail",
                    fontSize = 28.sp
                )

                Spacer(modifier = Modifier.height(6.dp))

                // Subtitle
                Text(
                    text = "Sovereign End-to-End Encrypted Productivity Suite",
                    color = Color(0xFF94, 0xA3, 0xB8),
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                    textAlign = TextAlign.Center
                )

                Spacer(modifier = Modifier.height(36.dp))

                // Error message banner
                AnimatedVisibility(
                    visible = errorMessage != null,
                    enter = fadeIn(),
                    exit = fadeOut()
                ) {
                    errorMessage?.let { error ->
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(8.dp))
                                .background(Color(0xFFEF, 0x44, 0x44).copy(alpha = 0.12f))
                                .border(BorderStroke(1.dp, Color(0xFFEF, 0x44, 0x44).copy(alpha = 0.35f)), RoundedCornerShape(8.dp))
                                .padding(horizontal = 12.dp, vertical = 8.dp)
                        ) {
                            Text(
                                text = error,
                                color = Color(0xFFF8, 0x71, 0x71),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Medium
                            )
                        }
                        Spacer(modifier = Modifier.height(12.dp))
                    }
                }

                // Input container
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    // Email Text Input
                    OutlinedTextField(
                        value = email,
                        onValueChange = {
                            email = it
                            errorMessage = null
                        },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedContainerColor = Color(0xFF11, 0x13, 0x18),
                            unfocusedContainerColor = Color(0xFF11, 0x13, 0x18),
                            focusedBorderColor = Color(0xFFFF, 0x8C, 0x42),
                            unfocusedBorderColor = Color(0xFF1E, 0x22, 0x2A),
                            focusedTextColor = Color.White,
                            unfocusedTextColor = Color(0xFFE2, 0xE8, 0xF0),
                            focusedLeadingIconColor = Color(0xFFFF, 0x8C, 0x42),
                            unfocusedLeadingIconColor = Color(0xFF94, 0xA3, 0xB8),
                            cursorColor = Color(0xFFFF, 0x8C, 0x42)
                        ),
                        singleLine = true,
                        placeholder = {
                            Text("name@quantmail.in or company.com", color = Color(0xFF64, 0x74, 0x8B), fontSize = 14.sp)
                        },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Default.Email,
                                contentDescription = "Email",
                                modifier = Modifier.size(20.dp)
                            )
                        },
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Email,
                            imeAction = ImeAction.Next
                        ),
                        keyboardActions = KeyboardActions(
                            onNext = { focusManager.moveFocus(FocusDirection.Down) }
                        )
                    )

                    // Password Text Input
                    OutlinedTextField(
                        value = password,
                        onValueChange = {
                            password = it
                            errorMessage = null
                        },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        visualTransformation = if (isPasswordVisible) VisualTransformation.None else PasswordVisualTransformation(),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedContainerColor = Color(0xFF11, 0x13, 0x18),
                            unfocusedContainerColor = Color(0xFF11, 0x13, 0x18),
                            focusedBorderColor = Color(0xFFFF, 0x8C, 0x42),
                            unfocusedBorderColor = Color(0xFF1E, 0x22, 0x2A),
                            focusedTextColor = Color.White,
                            unfocusedTextColor = Color(0xFFE2, 0xE8, 0xF0),
                            focusedLeadingIconColor = Color(0xFFFF, 0x8C, 0x42),
                            unfocusedLeadingIconColor = Color(0xFF94, 0xA3, 0xB8),
                            cursorColor = Color(0xFFFF, 0x8C, 0x42)
                        ),
                        singleLine = true,
                        placeholder = {
                            Text("Password", color = Color(0xFF64, 0x74, 0x8B), fontSize = 14.sp)
                        },
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Default.Lock,
                                contentDescription = "Password",
                                modifier = Modifier.size(20.dp)
                            )
                        },
                        trailingIcon = {
                            IconButton(onClick = { isPasswordVisible = !isPasswordVisible }) {
                                Icon(
                                    imageVector = if (isPasswordVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                    contentDescription = if (isPasswordVisible) "Hide password" else "Show password",
                                    tint = Color(0xFF94, 0xA3, 0xB8),
                                    modifier = Modifier.size(20.dp)
                                )
                            }
                        },
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Password,
                            imeAction = ImeAction.Done
                        ),
                        keyboardActions = KeyboardActions(
                            onDone = {
                                focusManager.clearFocus()
                                executeSignIn()
                            }
                        )
                    )

                    Spacer(modifier = Modifier.height(4.dp))

                    // "Sign In" primary action button
                    Button(
                        onClick = { executeSignIn() },
                        enabled = !isLoading,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(50.dp)
                            .shadow(8.dp, RoundedCornerShape(12.dp), spotColor = Color(0xFFFF, 0x8C, 0x42).copy(alpha = 0.40f)),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color(0xFFFF, 0x8C, 0x42),
                            contentColor = Color.White
                        )
                    ) {
                        if (isLoading) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                color = Color.White,
                                strokeWidth = 2.dp
                            )
                        } else {
                            Text(
                                text = "Sign In",
                                fontWeight = FontWeight.Bold,
                                fontSize = 15.sp,
                                letterSpacing = 0.3.sp
                            )
                        }
                    }

                    // "⚡ Continue with Quant SSO" secondary outlined button
                    OutlinedButton(
                        onClick = {
                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            onContinueWithSso()
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(48.dp),
                        shape = RoundedCornerShape(12.dp),
                        border = BorderStroke(1.dp, Color(0xFF28, 0x2C, 0x35)),
                        colors = ButtonDefaults.outlinedButtonColors(
                            containerColor = Color(0xFF14, 0x16, 0x1D),
                            contentColor = Color.White
                        )
                    ) {
                        Text(
                            text = "⚡ Continue with Quant SSO",
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 14.sp,
                            color = Color(0xFFE2, 0xE8, 0xF0)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(28.dp))

                // "1-Tap Quick Demo Login" row with chips
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Text(
                        text = "1-Tap Quick Demo Login",
                        color = Color(0xFF94, 0xA3, 0xB8),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        letterSpacing = 0.4.sp
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        DemoLoginChip(
                            name = "Sundar Pichai",
                            org = "Google",
                            initials = "SP",
                            accentColor = Color(0xFF42, 0x85, 0xF4),
                            modifier = Modifier.weight(1f),
                            onClick = {
                                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                QuantAuthManager.loginWithDemo(context, DemoUser.SUNDAR_PICHAI)
                                onLoginSuccess(QuantAuthManager.getCurrentUser(context))
                            }
                        )

                        DemoLoginChip(
                            name = "Dev Sentinel",
                            org = "Quant",
                            initials = "DS",
                            accentColor = Color(0xFFFF, 0x8C, 0x42),
                            modifier = Modifier.weight(1f),
                            onClick = {
                                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                QuantAuthManager.loginWithDemo(context, DemoUser.DEV_SENTINEL)
                                onLoginSuccess(QuantAuthManager.getCurrentUser(context))
                            }
                        )
                    }
                }
            }

            // Footer
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 28.dp, bottom = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "End-to-End Encrypted · Zero-Knowledge Storage · RFC 5545 / IMAP Compliant",
                    color = Color(0xFF64, 0x74, 0x8B),
                    fontSize = 10.5.sp,
                    fontWeight = FontWeight.Medium,
                    textAlign = TextAlign.Center,
                    lineHeight = 15.sp
                )
            }
        }
    }
}

/**
 * High-fidelity demo user chip for instantaneous 1-tap testing without soft keyboard typing.
 */
@Composable
private fun DemoLoginChip(
    name: String,
    org: String,
    initials: String,
    accentColor: Color,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    val haptic = LocalHapticFeedback.current

    Row(
        modifier = modifier
            .clip(RoundedCornerShape(10.dp))
            .background(Color(0xFF14, 0x16, 0x1E))
            .border(BorderStroke(1.dp, Color(0xFF24, 0x28, 0x33)), RoundedCornerShape(10.dp))
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onClick = {
                    haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                    onClick()
                }
            )
            .padding(horizontal = 10.dp, vertical = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        // Initials Avatar
        Box(
            modifier = Modifier
                .size(28.dp)
                .clip(CircleShape)
                .background(
                    Brush.linearGradient(
                        listOf(
                            accentColor.copy(alpha = 0.35f),
                            accentColor.copy(alpha = 0.15f)
                        )
                    )
                )
                .border(BorderStroke(1.dp, accentColor.copy(alpha = 0.5f)), CircleShape),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = initials,
                color = accentColor,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold
            )
        }

        Column(
            modifier = Modifier.weight(1f)
        ) {
            Text(
                text = name,
                color = Color.White,
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = org,
                color = Color(0xFF94, 0xA3, 0xB8),
                fontSize = 10.5.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1
            )
        }
    }
}
