import '../../data/mail_exception.dart';

/// Title and one-line reason for a failed load (design-spec 4.7 copy table).
class ErrorCopy {
  const ErrorCopy(this.title, this.message);

  final String title;
  final String message;
}

ErrorCopy errorCopyFor(MailException e, {String what = 'your mail'}) {
  switch (e.kind) {
    case MailErrorKind.network:
    case MailErrorKind.timeout:
      return const ErrorCopy("Can't reach Quant Mail.", 'Check your connection and try again.');
    case MailErrorKind.server:
      return const ErrorCopy('Something went wrong on our side.', 'Try again in a moment.');
    case MailErrorKind.rateLimited:
      final int? s = e.retryAfter?.inSeconds;
      return ErrorCopy('Too many requests.', s == null ? 'Try again in a moment.' : 'Try again in $s seconds.');
    case MailErrorKind.unauthorized:
      return const ErrorCopy('Your session ended.', 'Sign in again to see your mail.');
    case MailErrorKind.notFound:
      return const ErrorCopy('This conversation was moved or deleted.', 'Go back to your mail.');
    case MailErrorKind.forbidden:
    case MailErrorKind.conflict:
    case MailErrorKind.tooLarge:
    case MailErrorKind.invalidCursor:
    case MailErrorKind.unexpected:
      return ErrorCopy("Couldn't load $what.", 'Try again in a moment.');
  }
}
