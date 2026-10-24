// Received HTML is rebuilt from an allow-list: no scripts, no handlers, no
// remote images unless the reader asked for them.
import 'package:flutter_test/flutter_test.dart';
import 'package:quant_mail/features/thread/html_sanitizer.dart';

void main() {
  test('scripts, styles, iframes and event handlers are stripped', () {
    final SanitizedHtml r = sanitizeEmailHtml(
      '<p onclick="steal()">Hello <b>there</b></p>'
      '<script>alert(1)</script><style>p{background:url(http://x/y)}</style>'
      '<iframe src="https://evil.example/"></iframe><object data="x"></object>',
    );

    expect(r.html, contains('Hello'));
    expect(r.html, contains('<b>there</b>'));
    expect(r.html.toLowerCase(), isNot(contains('script')));
    expect(r.html.toLowerCase(), isNot(contains('alert')));
    expect(r.html.toLowerCase(), isNot(contains('onclick')));
    expect(r.html.toLowerCase(), isNot(contains('iframe')));
    expect(r.html.toLowerCase(), isNot(contains('<style')));
    expect(r.html.toLowerCase(), isNot(contains('object')));
  });

  test('remote images are blocked and counted by default', () {
    final SanitizedHtml r = sanitizeEmailHtml(
      '<p>Hi</p><img src="https://tracker.example/pixel.gif" width="1" height="1">'
      '<img src="http://tracker.example/a.png"><img src="//tracker.example/b.png">',
    );

    expect(r.html.toLowerCase(), isNot(contains('<img')));
    expect(r.html, isNot(contains('tracker.example')));
    expect(r.blockedRemoteImages, 3);
    expect(r.loadedRemoteImages, 0);
  });

  test('"Load images" keeps https images only', () {
    final SanitizedHtml r = sanitizeEmailHtml(
      '<img src="https://cdn.example/a.png" alt="A"><img src="http://cdn.example/b.png">',
      allowRemoteImages: true,
    );

    expect(r.html, contains('https://cdn.example/a.png'));
    expect(r.html, isNot(contains('http://cdn.example/b.png')));
    expect(r.loadedRemoteImages, 1);
    expect(r.blockedRemoteImages, 1);
  });

  test('inline data images stay, other image sources go', () {
    final SanitizedHtml r = sanitizeEmailHtml(
      '<img src="data:image/png;base64,AAAA"><img src="cid:logo"><img src="javascript:alert(1)">',
    );

    expect(r.html, contains('data:image/png;base64,AAAA'));
    expect(r.html, isNot(contains('cid:')));
    expect(r.html, isNot(contains('javascript')));
    expect(r.blockedRemoteImages, 0);
  });

  test('javascript links are dropped, normal links stay, styles lose url() and colours', () {
    final SanitizedHtml r = sanitizeEmailHtml(
      '<a href="  JaVa\tScript:alert(1)">bad</a><a href="https://example.com/x">ok</a>'
      '<p style="color:#000;background:url(http://x/y);font-weight:700">t</p>',
    );

    expect(r.html.toLowerCase(), isNot(contains('javascript')));
    expect(r.html, contains('href="https://example.com/x"'));
    expect(r.html, isNot(contains('url(')));
    expect(r.html, isNot(contains('color')));
    expect(r.html, contains('font-weight: 700'));
  });
}
