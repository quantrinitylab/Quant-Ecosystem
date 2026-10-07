# QuantMail M07 Attachments — Testing

## Unit

- metadata mapping
- scan-state rendering
- capability parsing
- filename normalization
- size formatting

## Integration

- attachment authorization
- preview capability
- download capability
- Drive save
- Drive relationship refresh
- blocked attachment

## E2E

1. open attachment thread
2. inspect metadata
3. preview safe file
4. download
5. save to Drive
6. open canonical Drive file
7. simulate scan block
8. simulate Drive outage

## Security

- unauthorized attachment
- object capability reuse
- path traversal filename
- malicious active content
- cross-user Drive destination

## Completion

No path may expose raw storage credentials or bypass scan/security policy.
