// Allow-list sanitiser for received HTML mail (design-spec 4.2).
//
// The result is built from scratch: only known-safe tags and attributes are
// copied, everything else is dropped or unwrapped. Remote images are blocked
// unless the reader asked for them ("Show images"), which is also what keeps
// tracking pixels from firing. Sender colours are dropped on purpose so mail
// stays legible on the dark canvas.

import 'package:html/dom.dart' as dom;
import 'package:html/parser.dart' show parseFragment;

/// Output of [sanitizeEmailHtml].
class SanitizedHtml {
  const SanitizedHtml({required this.html, required this.blockedRemoteImages, required this.loadedRemoteImages});

  /// Safe markup, ready for an HTML renderer.
  final String html;

  /// Remote images left out (user has not allowed them).
  final int blockedRemoteImages;

  /// Remote images kept because the reader allowed them.
  final int loadedRemoteImages;
}

/// Removed together with everything inside them.
const Set<String> _dropWithChildren = <String>{
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'link', 'meta',
  'base', 'title', 'head', 'noscript', 'template', 'svg', 'math', 'video', 'audio', 'source',
  'track', 'canvas', 'select', 'option', 'textarea', 'button', 'input', 'datalist', 'dialog',
  'map', 'area', 'picture',
};

const Set<String> _allowedTags = <String>{
  'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'center', 'cite', 'code', 'col', 'colgroup',
  'dd', 'del', 'div', 'dl', 'dt', 'em', 'font', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i',
  'ins', 'li', 'mark', 'ol', 'p', 'pre', 'q', 's', 'small', 'span', 'strike', 'strong', 'sub',
  'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul',
};

const Set<String> _safeLinkSchemes = <String>{'http', 'https', 'mailto', 'tel'};

const Set<String> _tableTags = <String>{'table', 'td', 'th', 'col', 'colgroup'};

/// Style properties that survive. No colours, no backgrounds, no url().
const Set<String> _allowedStyleProps = <String>{
  'font-weight', 'font-style', 'font-size', 'text-align', 'text-decoration', 'width', 'height', 'max-width',
};

final RegExp _safeStyleValue = RegExp(r'^[#a-zA-Z0-9\s%.,()\-]+$');
final RegExp _dataImage = RegExp(r'^data:image/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=\s]+$', caseSensitive: false);
final RegExp _controlChars = RegExp(r'[\u0000-\u0020\u007f-\u009f]');

SanitizedHtml sanitizeEmailHtml(String input, {bool allowRemoteImages = false}) {
  final dom.DocumentFragment fragment = parseFragment(input);
  final dom.Element out = dom.Element.tag('div');
  int blocked = 0;
  int loaded = 0;

  void walk(dom.Node source, dom.Node target) {
    for (final dom.Node node in source.nodes) {
      if (node is dom.Text) {
        target.append(dom.Text(node.data));
        continue;
      }
      if (node is! dom.Element) continue; // comments and the like are dropped
      final String tag = node.localName ?? '';
      if (_dropWithChildren.contains(tag)) continue;
      if (tag == 'img') {
        final dom.Element? image = _sanitizeImage(node, allowRemoteImages, () => blocked++, () => loaded++);
        if (image != null) target.append(image);
        continue;
      }
      if (!_allowedTags.contains(tag)) {
        walk(node, target); // unknown wrapper: keep its text, lose the tag
        continue;
      }
      final dom.Element copy = dom.Element.tag(tag);
      _copyAttributes(node, copy);
      target.append(copy);
      walk(node, copy);
    }
  }

  walk(fragment, out);
  return SanitizedHtml(html: out.innerHtml, blockedRemoteImages: blocked, loadedRemoteImages: loaded);
}

dom.Element? _sanitizeImage(dom.Element img, bool allowRemote, void Function() onBlocked, void Function() onLoaded) {
  final String src = (img.attributes['src'] ?? '').trim();
  final String squashed = src.replaceAll(_controlChars, '').toLowerCase();
  final bool remote = squashed.startsWith('http://') || squashed.startsWith('https://') || squashed.startsWith('//');
  if (remote) {
    // Only https is ever loaded, and only after the reader said yes.
    if (!allowRemote || !squashed.startsWith('https://')) {
      onBlocked();
      return null;
    }
    onLoaded();
  } else if (!_dataImage.hasMatch(src)) {
    return null; // cid:, file:, javascript: and anything else
  }
  final dom.Element copy = dom.Element.tag('img');
  copy.attributes['src'] = src;
  final String? alt = img.attributes['alt'];
  if (alt != null) copy.attributes['alt'] = alt;
  for (final String name in <String>['width', 'height']) {
    final String? v = img.attributes[name];
    if (v != null && RegExp(r'^\d{1,4}(px|%)?$').hasMatch(v.trim())) copy.attributes[name] = v.trim();
  }
  return copy;
}

void _copyAttributes(dom.Element from, dom.Element to) {
  final String tag = to.localName ?? '';
  from.attributes.forEach((Object key, String value) {
    final String name = key.toString().toLowerCase();
    if (tag == 'a' && name == 'href') {
      final String? safe = _safeHref(value);
      if (safe != null) to.attributes['href'] = safe;
    } else if (name == 'title' || name == 'dir') {
      to.attributes[name] = value;
    } else if ((name == 'colspan' || name == 'rowspan') && RegExp(r'^\d{1,3}$').hasMatch(value.trim())) {
      to.attributes[name] = value.trim();
    } else if (name == 'align' && RegExp(r'^(left|right|center)$', caseSensitive: false).hasMatch(value.trim())) {
      to.attributes[name] = value.trim().toLowerCase();
    } else if ((name == 'width' || name == 'height') &&
        _tableTags.contains(tag) &&
        RegExp(r'^\d{1,4}(px|%)?$').hasMatch(value.trim())) {
      to.attributes[name] = value.trim();
    } else if (name == 'style') {
      final String style = _safeStyle(value);
      if (style.isNotEmpty) to.attributes['style'] = style;
    }
  });
}

String? _safeHref(String raw) {
  final String value = raw.trim();
  final String squashed = value.replaceAll(_controlChars, '').toLowerCase();
  final int colon = squashed.indexOf(':');
  if (colon < 0) return null; // relative links have no meaning in mail
  if (!_safeLinkSchemes.contains(squashed.substring(0, colon))) return null;
  return value;
}

String _safeStyle(String raw) {
  final List<String> kept = <String>[];
  for (final String declaration in raw.split(';')) {
    final int colon = declaration.indexOf(':');
    if (colon < 0) continue;
    final String prop = declaration.substring(0, colon).trim().toLowerCase();
    final String value = declaration.substring(colon + 1).trim();
    if (!_allowedStyleProps.contains(prop)) continue;
    if (!_safeStyleValue.hasMatch(value)) continue;
    final String lower = value.toLowerCase();
    if (lower.contains('url(') || lower.contains('expression(')) continue;
    kept.add('$prop: $value');
  }
  return kept.join('; ');
}
