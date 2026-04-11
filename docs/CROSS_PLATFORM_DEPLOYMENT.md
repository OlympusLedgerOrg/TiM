# Cross-Platform Deployment Guide

## Mobile Access for Trelleborg Rutherfordton NC

TiM Production Manager is accessible on Android, Apple iOS, and Windows devices as a Progressive Web App (PWA).

## Access Methods

### Option 1: Web Browser (All Platforms)

Simply navigate to the TiM URL in any modern browser:
- **URL**: `https://your-tim-domain.com`
- **Supported Browsers**:
  - Android: Chrome, Samsung Internet, Edge
  - iOS: Safari, Chrome
  - Windows: Edge, Chrome, Firefox

### Option 2: Install as Mobile App (Recommended)

#### Android Installation

1. Open Chrome or Samsung Internet
2. Navigate to `https://your-tim-domain.com`
3. Tap the menu (⋮) → **"Add to Home Screen"** or **"Install app"**
4. Confirm installation
5. Find the TiM icon on your home screen

**Alternative via Chrome:**
- Look for the "Install" banner at the bottom of the screen
- Tap "Install" when prompted

#### iOS / iPadOS Installation

1. Open Safari browser (required for installation)
2. Navigate to `https://your-tim-domain.com`
3. Tap the Share button (□↑) at the bottom
4. Scroll down and tap **"Add to Home Screen"**
5. Tap "Add" in the top right
6. Find the TiM icon on your home screen

**Note**: iOS requires Safari for PWA installation. Other browsers cannot install PWAs on iOS.

#### Windows Installation

1. Open Edge (recommended) or Chrome
2. Navigate to `https://your-tim-domain.com`
3. Look for the install icon (⊕) in the address bar
4. Click **"Install TiM Production Manager"**
5. Confirm installation
6. Find TiM in your Start Menu

**Alternative:**
- Click the menu (⋯) → Apps → **"Install this site as an app"**

## Features When Installed

### All Platforms
- ✅ Full-screen experience (no browser UI)
- ✅ Appears in app switcher
- ✅ Launch from home screen/Start menu
- ✅ Faster loading with service worker caching
- ✅ Works offline for cached pages
- ✅ Push notifications (if configured)

### Platform-Specific Features

#### Android
- App drawer icon
- Recent apps with TiM icon
- Notification support
- Background sync
- Share target capability

#### iOS
- Home screen icon
- App Library integration
- Splash screen
- Status bar customization

#### Windows
- Start Menu tile
- Taskbar pinning
- Desktop shortcut
- System tray integration (optional)

## Network Requirements

### Minimum Requirements
- **Connection**: 3G/4G/5G or WiFi
- **Speed**: 1 Mbps minimum (5 Mbps recommended)
- **Latency**: < 500ms (< 100ms recommended)

### Offline Support
Once installed, the PWA caches:
- Application shell (UI framework)
- Static assets (CSS, JavaScript)
- Recently viewed data

**Limitations**: Data updates require network connectivity.

## Device Requirements

### Android
- **OS Version**: Android 8.0 (Oreo) or later
- **Browser**: Chrome 45+, Samsung Internet 5+
- **RAM**: 2GB minimum, 4GB recommended
- **Screen**: 5" minimum (phone), 7"+ (tablet)

### iOS
- **OS Version**: iOS 14.0 or later, iPadOS 14.0+
- **Browser**: Safari 14+
- **RAM**: 2GB minimum, 3GB recommended
- **Device**: iPhone 7 or later, iPad 5th gen or later

### Windows
- **OS Version**: Windows 10 (version 1809+) or Windows 11
- **Browser**: Edge 79+, Chrome 70+
- **RAM**: 4GB minimum, 8GB recommended
- **Screen**: 1366x768 minimum resolution

## SAP Integration Access

### Required Permissions
Users need appropriate roles to access SAP integration features:
- **View Data**: Tech, Supervisor, Admin roles
- **Sync Materials**: Supervisor, Admin roles only

### VPN Requirements
If accessing from outside the corporate network:
- Connect to company VPN before opening TiM
- Ensure VPN allows access to TiM backend (port 443/4000)

## Troubleshooting

### Installation Issues

#### "Add to Home Screen" option missing (Android)
- Ensure you're using Chrome or Samsung Internet
- Clear browser cache and try again
- Check that site is served over HTTPS

#### Cannot install on iOS
- Use Safari browser (not Chrome)
- Check iOS version is 14.0+
- Ensure website uses HTTPS

#### Install option not appearing (Windows)
- Use Edge or Chrome
- Check browser is up to date
- Clear cache and reload page

### Performance Issues

#### Slow loading
- Check network connection strength
- Clear app cache (Settings → Storage)
- Reinstall the app

#### Data not updating
- Pull down to refresh
- Check network connectivity
- Verify VPN connection (if required)

### Authentication Issues

#### Cannot log in
- Verify username and password
- Check if JWT token is valid
- Contact IT for account status

#### Session expired
- Log out and log back in
- Clear browser/app data
- Check token expiration settings

## Security Best Practices

### For End Users
1. **Lock your device**: Use PIN/password/biometrics
2. **Log out when done**: Especially on shared devices
3. **Keep OS updated**: Install security updates promptly
4. **Don't jailbreak/root**: Compromises security
5. **Report lost devices**: Contact IT immediately

### For IT Administrators
1. Enable MFA (Multi-Factor Authentication)
2. Configure JWT token expiration (recommended: 8 hours)
3. Implement session timeout (recommended: 30 minutes idle)
4. Use HTTPS with valid SSL certificate
5. Enable CORS only for authorized domains
6. Monitor access logs for suspicious activity

## Support Contacts

### Technical Support
- **Email**: it-support@trelleborg.com
- **Phone**: (XXX) XXX-XXXX
- **Hours**: Monday-Friday, 8 AM - 5 PM EST

### SAP Integration Issues
- **Email**: sap-team@trelleborg.com
- **Escalation**: Contact SAP BASIS team

## Updating the App

### Android/iOS
PWAs auto-update when you visit the site. No manual updates needed.

To force update:
1. Open the installed app
2. Pull down to refresh
3. Close and reopen if needed

### Windows
Similar to mobile - auto-updates on next launch.

Manual update:
1. Open app
2. Ctrl+R to refresh
3. Close and reopen

## Uninstalling

### Android
1. Long-press the TiM icon
2. Tap "Uninstall" or drag to trash
3. Confirm removal

### iOS
1. Long-press the TiM icon
2. Tap "Remove App"
3. Choose "Delete App"
4. Confirm deletion

### Windows
1. Right-click the TiM icon
2. Select "Uninstall"
3. Confirm removal

## Additional Resources

- **SAP Integration Guide**: `/docs/SAP_INTEGRATION.md`
- **User Manual**: `/docs/how-to-complete-a-work-order-step.md`
- **API Documentation**: Available at `/api/v1/docs` (if configured)

---

**Document Version**: 1.0.0  
**Last Updated**: April 11, 2026  
**Prepared For**: Trelleborg Rutherfordton NC
