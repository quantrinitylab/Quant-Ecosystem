package com.quant.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class OAuthDeepLinkSecurityTest {

  @Test
  fun testResolveCustomSchemeOAuthCallback() {
    val input = "quantmail://oauth/callback?code=4%2F0AfgeXvu...&state=xyz987"
    val resolved = MainActivity.resolveDeepLinkUrl(input)
    assertEquals("https://quantmail.in/auth/callback?code=4%2F0AfgeXvu...&state=xyz987", resolved)
  }

  @Test
  fun testResolveCustomSchemeOAuthCallbackWithoutQuery() {
    val input = "quantmail://oauth/callback"
    val resolved = MainActivity.resolveDeepLinkUrl(input)
    assertEquals("https://quantmail.in/auth/callback", resolved)
  }

  @Test
  fun testResolveAppLinksOAuthCallback() {
    val input = "https://quantmail.in/auth/callback?token=jwt_session_token_123"
    val resolved = MainActivity.resolveDeepLinkUrl(input)
    assertEquals("https://quantmail.in/auth/callback?token=jwt_session_token_123", resolved)
  }

  @Test
  fun testRejectUntrustedDeepLinks() {
    val untrusted1 = "https://evil.com/auth/callback?token=stolen"
    assertNull(MainActivity.resolveDeepLinkUrl(untrusted1))

    val untrusted2 = "quantmail://malicious/path"
    assertNull(MainActivity.resolveDeepLinkUrl(untrusted2))

    val untrusted3 = "javascript:alert(1)"
    assertNull(MainActivity.resolveDeepLinkUrl(untrusted3))
  }

  @Test
  fun testExternalOAuthUrlInterception() {
    // Google OAuth
    assertTrue(MainActivity.isExternalAuthUrl("https://accounts.google.com/o/oauth2/v2/auth?client_id=123&redirect_uri=quantmail%3A%2F%2Foauth%2Fcallback"))
    assertTrue(MainActivity.isExternalAuthUrl("https://accounts.google.com/signin/oauth"))

    // GitHub OAuth
    assertTrue(MainActivity.isExternalAuthUrl("https://github.com/login/oauth/authorize?client_id=gh_123"))

    // Apple ID
    assertTrue(MainActivity.isExternalAuthUrl("https://appleid.apple.com/auth/authorize"))

    // Microsoft / Azure AD
    assertTrue(MainActivity.isExternalAuthUrl("https://login.microsoftonline.com/common/oauth2/v2.0/authorize"))
  }

  @Test
  fun testInternalUrlsNotFlaggedAsExternalAuth() {
    assertFalse(MainActivity.isExternalAuthUrl("https://quantmail.in/"))
    assertFalse(MainActivity.isExternalAuthUrl("https://quantmail.in/calendar"))
    assertFalse(MainActivity.isExternalAuthUrl("https://quantmail.in/auth/callback"))
  }
}
