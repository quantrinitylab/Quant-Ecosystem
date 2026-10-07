# QuantMail Backend — Universal Search API

## Query: search.global

Input:

~~~ts
{
  query: string;
  domains?: ("mail"|"people"|"calendar"|"drive"|"git")[];
  cursor?: string;
  limit?: number;
  filters?: {
    unreadOnly?: boolean;
    starredOnly?: boolean;
    from?: string;
    after?: string;
    before?: string;
    type?: string;
  };
}
~~~

Output:

~~~ts
{
  results: SearchResult[];
  nextCursor?: string;
  domainStatus: DomainSearchStatus[];
  requestId: string;
}
~~~

## Search result

~~~ts
{
  resultId: string;
  domain: Domain;
  objectType: string;
  objectId: string;
  title: string;
  primaryText?: string;
  secondaryText?: string;
  timestamp?: string;
  route: string;
  matchedFields: string[];
}
~~~

## Errors

- INVALID_QUERY
- INVALID_CURSOR
- RATE_LIMITED
- UNAUTHENTICATED
- SEARCH_UNAVAILABLE
- INTERNAL_ERROR

Domain-specific failures belong in domainStatus rather than failing the entire search.

## Pagination

Use a signed/opaque continuation token.
Do not expose search-engine offsets directly.
