# QuantMail Backend — Drive / Attachment Context

## Ownership

Mail owns:
- message attachment reference
- filename as received
- provider attachment metadata
- message relationship

Drive/storage owns:
- canonical file object
- object lifecycle
- sharing
- versions
- download capability
- retention
- scan pipeline where applicable

## Attachment retrieval

1. authorize message
2. authorize attachment
3. return safe metadata
4. request scoped object capability for preview/download

Never expose raw object-store credentials.

## Save-to-Drive orchestration

Mail emits/requests a Drive command.
Drive returns canonical file identity.
Mail stores only a relationship reference if needed.

## Failure isolation

Drive unavailable:
- existing email/attachment metadata remains visible
- preview/download/save actions degrade independently
