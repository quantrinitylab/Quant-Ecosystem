// ============================================================================
// quant_core - search module barrel
// ============================================================================
//
// Public surface of the Search slice (quantmail-forge, W1 quant_core lane):
// [SearchQuery] (local instant parse), [SearchApi] (the /search endpoints),
// [SearchHit]/[ServerQueryInterpretation], [SearchRepository] (session LRU
// cache + in-flight dedupe) and the Riverpod search providers.

export 'search_query.dart';
export 'search_api.dart';
export 'search_repository.dart';
export 'search_providers.dart';
