# M12 Backend — Search API

## Query
search.query

Input:
- q
- domains
- filters
- cursor
- limit
- mode: lexical | semantic | hybrid

## Response
- results
- cursor
- domainStatus
- queryId
- indexFreshness
- tookMs

Result:
- resultId
- source
- objectType
- objectId
- title
- primaryText
- secondaryText
- timestamp
- routeRef
- matchedFields
- rankingReason

Authorization filters are server-side.
Canonical object fetch remains mandatory before sensitive action.
