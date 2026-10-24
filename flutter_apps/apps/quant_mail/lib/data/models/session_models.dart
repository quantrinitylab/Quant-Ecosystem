/// Signed-in account as the session knows it (from the login response).
class SessionUser {
  const SessionUser({required this.id, required this.email, required this.displayName});

  final String id;
  final String email;
  final String displayName;
}

/// What the session layer currently believes. [endedMessage] is set when the
/// session was ended by the app (refresh failed) so Sign in can say why.
class SessionState {
  const SessionState.signedIn(SessionUser this.user) : endedMessage = null;
  const SessionState.signedOut({this.endedMessage}) : user = null;

  final SessionUser? user;
  final String? endedMessage;

  bool get isSignedIn => user != null;
}

/// Shown on Sign in after a refresh failure.
const String kSessionEndedMessage = 'Your session ended. Sign in again.';
