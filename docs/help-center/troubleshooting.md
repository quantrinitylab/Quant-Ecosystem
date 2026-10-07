# Troubleshooting

Common issues and their solutions.

## Sync Issues

### Data not syncing between devices

1. Check your internet connection
2. Verify sync is enabled: Settings > Sync > Status
3. Check available storage (free plan: 5GB limit)
4. Try manual sync: Settings > Sync > Sync Now
5. Check [status.quant.app](https://status.quant.app) for service issues

### Sync conflicts

Quant uses CRDTs for conflict-free sync. If you see unexpected content:

1. Check document version history (File > Version History)
2. Verify all devices are running the latest app version
3. Contact support if conflicts persist

### Sync is slow

- Large initial syncs can take time (especially photos/drive)
- Check Settings > Sync > Bandwidth to ensure limits are not too restrictive
- Verify your network allows WebSocket connections
- Try disabling VPN temporarily to test

## Login Issues

### Cannot log in

1. Verify your email address is correct
2. Check for typos in your passphrase (case-sensitive)
3. If using 2FA, ensure your authenticator time is synced
4. Try the "Forgot Passphrase" flow with your recovery key

### Two-factor authentication not working

- TOTP: Ensure your device clock is accurate (auto-sync time)
- Hardware key: Try a different USB port or NFC position
- Use a backup code if available
- Contact support with account verification

### Session expired unexpectedly

- Sessions expire after 30 days of inactivity
- Check if someone revoked your session (Settings > Security > Sessions)
- Verify your device clock is accurate

## App Performance

### App is slow or unresponsive

1. Clear app cache: Settings > Storage > Clear Cache
2. Restart the app
3. Check available device storage (minimum 500MB free)
4. Disable browser extensions that may interfere
5. Update to the latest app version

### High memory usage

- Close unused tabs/documents
- Reduce the number of open real-time collaborations
- Clear offline cache for apps you do not use frequently
- Restart the app periodically for long sessions

### Desktop app crashes

1. Update to the latest version
2. Clear app data: `~/.quant/cache/`
3. Check system logs for error details
4. Report crash at Settings > Help > Report Issue

## Email Issues

### Not receiving emails

1. Check Spam/Junk folder
2. Verify sender is not blocked (Settings > Mail > Blocked)
3. Check mail filters/rules (Settings > Mail > Rules)
4. Verify DNS records if using custom domain

### Cannot send emails

1. Check your internet connection
2. Verify recipient address is valid
3. Check if you have exceeded sending limits (Free: 100/day)
4. Ensure your account is verified

### Email formatting issues

- Use Quant Mail's built-in composer for best results
- HTML emails from external sources may render differently
- Plain text mode available in Settings > Mail > Compose

## Storage Issues

### Running out of storage

1. Check storage usage: Settings > Storage
2. Empty trash (items in trash count toward quota)
3. Remove large file versions (File > Version History > Clean Up)
4. Upgrade to Pro for 100GB

### File upload fails

- Maximum file size: 5GB per file
- Check available storage quota
- Verify file type is not blocked by admin policy
- Try uploading via the desktop app for large files

## Collaboration Issues

### Cannot see other users' changes

1. Verify you are online
2. Check document sharing permissions
3. Refresh the page/document
4. Verify WebSocket connections in browser DevTools

### Invited user cannot access shared document

- Ensure the invitation email was received
- Verify the user has a Quant account with that email
- Check organization policies (external sharing may be disabled)
- Try re-sharing the document

## Mobile App Issues

### App crashes on launch (iOS)

1. Force quit and relaunch
2. Update to latest version from App Store
3. Restart your device
4. Reinstall the app (data will re-sync)

### App crashes on launch (Android)

1. Force stop and relaunch
2. Clear app cache (Settings > Apps > Quant > Clear Cache)
3. Update from Google Play
4. Reinstall if needed

### Push notifications not working

- iOS: Settings > Notifications > Quant > Allow Notifications
- Android: Settings > Apps > Quant > Notifications > Enable
- Check in-app: Settings > Notifications > Push Notifications

## Still Need Help?

- **Email**: support@quant.app
- **Chat**: In-app support (Settings > Help)
- **Community**: [Discord](https://discord.gg/quant)
- **Status**: [status.quant.app](https://status.quant.app)
