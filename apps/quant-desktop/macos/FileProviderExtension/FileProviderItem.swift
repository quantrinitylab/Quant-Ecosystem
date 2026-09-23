//
//  FileProviderItem.swift
//  QuantDrive macOS FileProvider Extension
//
//  Implements NSFileProviderItemProtocol for native Finder integration.
//

import FileProvider
import UniformTypeIdentifiers

final class QuantFileProviderItem: NSObject, NSFileProviderItem {
    let identifier: NSFileProviderItemIdentifier
    let parentIdentifier: NSFileProviderItemIdentifier
    let filename: String
    let contentType: UTType
    let fileSize: NSNumber?
    let isDownloaded: Bool
    let modifiedDate: Date?

    init(
        identifier: NSFileProviderItemIdentifier,
        parentIdentifier: NSFileProviderItemIdentifier,
        filename: String,
        contentType: UTType,
        fileSize: NSNumber?,
        isDownloaded: Bool,
        modifiedDate: Date?
    ) {
        self.identifier = identifier
        self.parentIdentifier = parentIdentifier
        self.filename = filename
        self.contentType = contentType
        self.fileSize = fileSize
        self.isDownloaded = isDownloaded
        self.modifiedDate = modifiedDate
        super.init()
    }

    var itemIdentifier: NSFileProviderItemIdentifier {
        return identifier
    }

    var parentItemIdentifier: NSFileProviderItemIdentifier {
        return parentIdentifier
    }

    var capabilities: NSFileProviderItemCapabilities {
        return [.allowsReading, .allowsWriting, .allowsRenaming, .allowsDeleting]
    }

    var itemVersion: NSFileProviderItemVersion {
        return NSFileProviderItemVersion(contentVersion: "1".data(using: .utf8)!, metadataVersion: "1".data(using: .utf8)!)
    }

    var documentSize: NSNumber? {
        return fileSize
    }

    var isUploaded: Bool {
        return true
    }

    var isUploading: Bool {
        return false
    }

    var isMostRecentVersionDownloaded: Bool {
        return isDownloaded
    }
}
