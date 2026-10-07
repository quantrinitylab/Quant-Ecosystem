// ============================================================================
// quantube_core - smoke test (W1 verify+fix shift)
// ============================================================================
//
// Compile-safe sanity checks for the two Shift-1 deliverables owned by this
// package: the QuanTube theme (W2) and the OAuth2+PKCE auth surface (W3).
// No network, no secure storage, no provider containers — pure constants
// and static getters, so this stays green while workers iterate around it.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:quantube_core/quantube_core.dart';

void main() {
  group('QuanTubeTheme smoke', () {
    test('darkTheme is a dark ThemeData', () {
      final ThemeData theme = QuanTubeTheme.darkTheme;
      expect(theme.brightness, Brightness.dark);
    });

    test('lightTheme is a light ThemeData', () {
      final ThemeData theme = QuanTubeTheme.lightTheme;
      expect(theme.brightness, Brightness.light);
    });

    test('fallback resolves to the dark theme', () {
      expect(QuanTubeTheme.fallback.brightness, Brightness.dark);
    });
  });

  group('auth contract constants smoke', () {
    test('default redirect URI uses the quantube custom scheme', () {
      expect(
        AuthRepository.defaultRedirectUri,
        'quantube://oauth/callback',
      );
    });

    test('default scopes are non-empty', () {
      expect(AuthRepository.defaultScopes, isNotEmpty);
    });
  });

  group('auth providers smoke', () {
    test('authSessionProvider is registered under its name', () {
      expect(authSessionProvider.name, 'authSessionProvider');
    });
  });
}
