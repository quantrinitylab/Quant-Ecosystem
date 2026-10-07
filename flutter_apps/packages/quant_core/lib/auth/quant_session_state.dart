/// Immutable authentication and tenancy state for the active user session.
class QuantSessionState {
  final String? userId;
  final String? email;
  final String? tenantId;
  final String? accessToken;
  final String? refreshToken;
  final DateTime? expiresAt;
  final List<String> roles;
  final bool isLoading;
  final bool isOffline;

  const QuantSessionState({
    this.userId,
    this.email,
    this.tenantId,
    this.accessToken,
    this.refreshToken,
    this.expiresAt,
    this.roles = const [],
    this.isLoading = false,
    this.isOffline = false,
  });

  /// True if the user has an active, valid authentication token
  bool get isAuthenticated =>
      accessToken != null &&
      accessToken!.isNotEmpty &&
      (expiresAt == null || expiresAt!.isAfter(DateTime.now()));

  /// Factory for an unauthenticated / guest state
  factory QuantSessionState.unauthenticated() {
    return const QuantSessionState();
  }

  /// Factory for a loading state
  factory QuantSessionState.loading() {
    return const QuantSessionState(isLoading: true);
  }

  /// Create a copy with selected fields replaced
  QuantSessionState copyWith({
    String? userId,
    String? email,
    String? tenantId,
    String? accessToken,
    String? refreshToken,
    DateTime? expiresAt,
    List<String>? roles,
    bool? isLoading,
    bool? isOffline,
  }) {
    return QuantSessionState(
      userId: userId ?? this.userId,
      email: email ?? this.email,
      tenantId: tenantId ?? this.tenantId,
      accessToken: accessToken ?? this.accessToken,
      refreshToken: refreshToken ?? this.refreshToken,
      expiresAt: expiresAt ?? this.expiresAt,
      roles: roles ?? this.roles,
      isLoading: isLoading ?? this.isLoading,
      isOffline: isOffline ?? this.isOffline,
    );
  }

  @override
  String toString() {
    return 'QuantSessionState(userId: $userId, email: $email, tenantId: $tenantId, isAuthenticated: $isAuthenticated, isOffline: $isOffline)';
  }
}
