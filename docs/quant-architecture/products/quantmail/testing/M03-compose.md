# QuantMail M03 Compose — Testing

## Unit

- recipient normalization
- draft patch validation
- version conflict
- autosave debounce
- editor document conversion
- preparation expiry

## Integration

- create/update/get draft
- attachment state
- draft persistence during provider outage
- prepare-send validation
- send acceptance idempotency
- provider failure mapping

## E2E

1. create draft
2. type content
3. reload
4. recover draft
5. add recipients
6. add attachment
7. invoke Quanty rewrite
8. undo
9. prepare send
10. confirm
11. verify sent state
12. simulate provider failure
13. verify draft/retry behavior

Security:
- unauthorized draft ID
- recipient manipulation
- cross-account draft access
- unsafe attachment
- prompt injection via pasted content

## Completion

No data loss across refresh, backgrounding or provider outage.
