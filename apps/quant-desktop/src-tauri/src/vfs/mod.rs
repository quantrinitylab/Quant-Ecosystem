pub mod cache;
pub mod hydrator;
pub mod macos;
pub mod windows;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FileSyncState {
    /// 0 bytes on local disk; placeholder repoint with FILE_ATTRIBUTE_OFFLINE
    Offline,
    /// Chunks currently streaming from S3/R2
    Hydrating,
    /// Fully cached locally in LRU cache
    Cached,
    /// Explicitly pinned by user to always keep offline copy
    Pinned,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VfsEntry {
    pub id: String,
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub size_bytes: u64,
    pub state: FileSyncState,
    pub blake3_hash: Option<String>,
    pub chunk_count: u32,
    pub modified_timestamp: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VfsMountConfig {
    pub drive_letter: String, // e.g. "G"
    pub mount_point: String,  // e.g. "G:\\" or "/Volumes/QuantDrive"
    pub max_cache_bytes: u64, // e.g. 10 GB
    pub api_endpoint: String,
    pub auth_token: String,
}

impl Default for VfsMountConfig {
    fn default() -> Self {
        Self {
            drive_letter: "G".to_string(),
            mount_point: "G:\\".to_string(),
            max_cache_bytes: 10 * 1024 * 1024 * 1024, // 10 GB
            api_endpoint: "https://quantmail.in".to_string(),
            auth_token: String::new(),
        }
    }
}
