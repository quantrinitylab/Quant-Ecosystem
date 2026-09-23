//! macOS FileProvider Replicated Extension Bridge
//!
//! Integrates QuantDrive with macOS Finder via `NSFileProviderReplicatedExtension`.
//! Files appear in Finder sidebar under Locations with native cloud badges,
//! progressive download hydration, and zero local disk usage when offline.

use super::{FileSyncState, VfsEntry, VfsMountConfig};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MacOsFileProviderItem {
    pub item_identifier: String,
    pub parent_item_identifier: String,
    pub filename: String,
    pub type_identifier: String, // e.g. "public.item" or "public.folder"
    pub document_size: u64,
    pub is_downloaded: bool,
    pub is_most_recent_version_downloaded: bool,
    pub is_shared: bool,
    pub creation_date: i64,
    pub content_modification_date: i64,
}

pub struct MacOsVfsManager {
    config: VfsMountConfig,
    domain_identifier: String,
}

impl MacOsVfsManager {
    pub fn new(config: VfsMountConfig) -> Self {
        Self {
            config,
            domain_identifier: "in.quantmail.QuantDrive.FileProvider".to_string(),
        }
    }

    /// Converts a VfsEntry into a macOS FileProvider item representation
    pub fn create_item(&self, entry: &VfsEntry, parent_id: &str) -> MacOsFileProviderItem {
        let type_id = if entry.is_dir {
            "public.folder".to_string()
        } else {
            "public.data".to_string()
        };

        let is_downloaded = matches!(entry.state, FileSyncState::Cached | FileSyncState::Pinned);

        MacOsFileProviderItem {
            item_identifier: entry.id.clone(),
            parent_item_identifier: parent_id.to_string(),
            filename: entry.name.clone(),
            type_identifier: type_id,
            document_size: entry.size_bytes,
            is_downloaded,
            is_most_recent_version_downloaded: is_downloaded,
            is_shared: false,
            creation_date: entry.modified_timestamp,
            content_modification_date: entry.modified_timestamp,
        }
    }

    pub fn get_mount_location(&self) -> String {
        "~/Library/CloudStorage/QuantDrive-Enterprise".to_string()
    }
}
