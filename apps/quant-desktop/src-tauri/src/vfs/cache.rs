//! Local LRU Chunk Cache
//!
//! Stores hydrated 64KB chunks in memory and local disk with strict byte limits (e.g. 10GB).
//! Evicts least-recently-used chunks when disk budget is exceeded.

use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};

pub struct LruChunkCache {
    max_bytes: u64,
    current_bytes: u64,
    cache: HashMap<String, Vec<u8>>,
    access_order: VecDeque<String>,
}

impl LruChunkCache {
    pub fn new(max_bytes: u64) -> Self {
        Self {
            max_bytes,
            current_bytes: 0,
            cache: HashMap::new(),
            access_order: VecDeque::new(),
        }
    }

    pub fn get(&mut self, hash: &str) -> Option<&Vec<u8>> {
        if self.cache.contains_key(hash) {
            // Move to end of access order
            self.access_order.retain(|h| h != hash);
            self.access_order.push_back(hash.to_string());
            self.cache.get(hash)
        } else {
            None
        }
    }

    pub fn put(&mut self, hash: String, data: Vec<u8>) {
        let chunk_len = data.len() as u64;

        // If chunk is already cached, update data and move to back
        if let Some(existing) = self.cache.get_mut(&hash) {
            self.current_bytes = self.current_bytes.saturating_sub(existing.len() as u64) + chunk_len;
            *existing = data;
            self.access_order.retain(|h| h != &hash);
            self.access_order.push_back(hash);
            return;
        }

        // Evict LRU chunks until within limit
        while self.current_bytes + chunk_len > self.max_bytes && !self.access_order.is_empty() {
            if let Some(lru_hash) = self.access_order.pop_front() {
                if let Some(removed) = self.cache.remove(&lru_hash) {
                    self.current_bytes = self.current_bytes.saturating_sub(removed.len() as u64);
                }
            }
        }

        self.current_bytes += chunk_len;
        self.cache.insert(hash.clone(), data);
        self.access_order.push_back(hash);
    }

    pub fn contains(&self, hash: &str) -> bool {
        self.cache.contains_key(hash)
    }

    pub fn current_bytes(&self) -> u64 {
        self.current_bytes
    }

    pub fn max_bytes(&self) -> u64 {
        self.max_bytes
    }

    pub fn len(&self) -> usize {
        self.cache.len()
    }

    pub fn is_empty(&self) -> bool {
        self.cache.is_empty()
    }
}
