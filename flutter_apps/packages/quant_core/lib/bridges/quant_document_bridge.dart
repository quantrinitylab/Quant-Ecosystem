// Sovereign Quant Ecosystem - Document & PDF Viewing Architectural Bridge
// Connects mobile document viewing to FastCDC chunk storage and attachment previewers.
// Strictly ZERO raw Unicode emojis throughout this file.

/// Document source location type.
enum QuantDocumentSourceType {
  localFile,
  remoteUrl,
  fastCdcStream,
  memoryBytes,
}

/// Abstract specification of a document to be rendered.
class QuantDocumentDescriptor {
  final String id;
  final String title;
  final String uri;
  final QuantDocumentSourceType sourceType;
  final int? fileSizeBytes;
  final String mimeType;
  final bool isEncrypted;

  const QuantDocumentDescriptor({
    required this.id,
    required this.title,
    required this.uri,
    required this.sourceType,
    this.fileSizeBytes,
    this.mimeType = 'application/pdf',
    this.isEncrypted = false,
  });

  bool get isPdf => mimeType == 'application/pdf' || uri.toLowerCase().endsWith('.pdf');

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'uri': uri,
        'sourceType': sourceType.name,
        'fileSizeBytes': fileSizeBytes,
        'mimeType': mimeType,
        'isEncrypted': isEncrypted,
      };
}

/// Display and interaction configuration for sovereign document viewer.
class QuantDocumentViewerConfig {
  final bool enableDoubleTapZoom;
  final bool enableTextSelection;
  final bool showPageIndicator;
  final bool enableScrollHead;
  final double initialZoomLevel;
  final double maxZoomLevel;
  final bool darkModeInversion;

  const QuantDocumentViewerConfig({
    this.enableDoubleTapZoom = true,
    this.enableTextSelection = true,
    this.showPageIndicator = true,
    this.enableScrollHead = true,
    this.initialZoomLevel = 1.0,
    this.maxZoomLevel = 3.0,
    this.darkModeInversion = false,
  });
}
