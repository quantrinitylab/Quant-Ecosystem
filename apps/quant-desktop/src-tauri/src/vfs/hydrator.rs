//! Desktop On-Demand Background Chunk Hydration Daemon
//!
//! Intercepts read faults on offline files in ProjFS / FileProvider.
//! Calculates required 64KB chunk byte ranges, fetches in parallel,
//! and streams bytes into OS file buffer while populating LRU disk cache.

use super::cache::LruChunkCache;
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone)]
pub struct ChunkRangeRequest {
    pub file_id: String,
    pub chunk_hash: String,
    pub chunk_offset: u64,
    pub chunk_length: u32,
    pub requested_offset: u64,
    pub requested_length: u32,
}

pub struct ChunkHydrator {
    cache: Arc<Mutex<LruChunkCache>>,
    concurrent_workers: usize,
    chunk_size: u64,
}

impl ChunkHydrator {
    pub fn new(max_cache_bytes: u64, concurrent_workers: usize) -> Self {
        Self {
            cache: Arc::new(Mutex::new(LruChunkCache::new(max_cache_bytes))),
            concurrent_workers,
            chunk_size: 64 * 1024, // 64 KB
        }
    }

    /// Determines which chunk hashes are required to satisfy a read fault for `offset..offset+len`
    pub fn calculate_required_chunks(
        &self,
        file_id: &str,
        file_chunks: &[(String, u64, u32)], // (hash, offset, length)
        read_offset: u64,
        read_length: u32,
    ) -> Vec<ChunkRangeRequest> {
        let read_end = read_offset + read_length as u64;
        let mut required = Vec::new();

        for (hash, offset, length) in file_chunks {
            let chunk_end = *offset + *length as u64;

            // Check if chunk overlaps with requested range
            if *offset < read_end && chunk_end > read_offset {
                required.push(ChunkRangeRequest {
                    file_id: file_id.to_string(),
                    chunk_hash: hash.clone(),
                    chunk_offset: *offset,
                    chunk_length: *length,
                    requested_offset: read_offset,
                    requested_length: read_length,
                });
            }
        }

        required
    }

    /// Hydrates a read fault by fetching missing chunks and returning the reconstructed slice
    pub async fn hydrate_range<F, Fut>(
        &self,
        file_id: &str,
        file_chunks: &[(String, u64, u32)],
        read_offset: u64,
        read_length: u32,
        chunk_fetcher: F,
    ) -> Result<Vec<u8>, String>
    where
        F: Fn(String) -> Fut + Send + Sync + 'static,
        Fut: std::future::Future<Output = Result<Vec<u8>, String>> + Send + 'static,
    {
        let required = self.calculate_required_chunks(file_id, file_chunks, read_offset, read_length);
        let mut result_buffer = vec![0u8; read_length as usize];

        for req in required {
            // 1. Check cache first
            let mut chunk_bytes: Option<Vec<u8>> = {
                let mut c = self.cache.lock().unwrap();
                c.get(&req.chunk_hash).cloned()
            };

            // 2. Fetch if not in cache
            if chunk_bytes.is_none() {
                let fetched = chunk_fetcher(req.chunk_hash.clone()).await?;
                let mut c = self.cache.lock().unwrap();
                c.put(req.chunk_hash.clone(), fetched.clone());
                chunk_bytes = Some(fetched);
            }

            let bytes = chunk_bytes.unwrap();

            // 3. Slice the intersection into result buffer
            let chunk_start = req.chunk_offset;
            let chunk_end = req.chunk_offset + req.chunk_length as u64;

            let overlap_start = read_offset.max(chunk_start);
            let overlap_end = (read_offset + read_length as u64).min(chunk_end);

            if overlap_start < overlap_end {
                let src_start = (overlap_start - chunk_start) as usize;
                let src_end = (overlap_end - chunk_start) as usize;
                let dst_start = (overlap_start - read_offset) as usize;
                let dst_end = (overlap_end - read_offset) as usize;

                result_buffer[dst_start..dst_end].copy_from_slice(&bytes[src_start..src_end]);
            }
        }

        Ok(result_buffer)
    }

    pub fn cache(&self) -> Arc<Mutex<LruChunkCache>> {
        self.cache.clone()
    }
}
