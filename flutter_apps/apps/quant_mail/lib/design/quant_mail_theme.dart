import 'package:flutter/material.dart';

import 'quant_mail_tokens.dart';

/// Adds the Obsidian tokens and the bundled Inter font to [base].
///
/// Colours of [base] are left alone on purpose: the auth screens that already
/// ship keep their look. Mail screens read colours from [QuantMailTokens].
ThemeData buildQuantMailTheme(ThemeData base) {
  return base.copyWith(
    textTheme: base.textTheme.apply(fontFamily: QuantMailTokens.fontFamily),
    primaryTextTheme: base.primaryTextTheme.apply(fontFamily: QuantMailTokens.fontFamily),
    extensions: [
      ...base.extensions.values.where((e) => e is! QuantMailTokens),
      QuantMailTokens.obsidian,
    ],
  );
}