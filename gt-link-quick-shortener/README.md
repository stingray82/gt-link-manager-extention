# GT Link Quick Shortener — pre-release 1.0.0

Click the toolbar icon to customise destination, slug, redirect and metadata, or use the **Quick shorten & copy** button (uses saved defaults). Optional setting: **Instant shorten when popup opens**. Turn this *off* when you want to customise on click.

Additional quick methods: a user-assigned keyboard shortcut and right-click a page or link → Shorten with GT Link. Background shortcuts display a Chrome notification and attempt to copy the new URL through an offscreen document. No shortcut is assigned by default to avoid conflicts with other extensions (such as Bitwarden). Open extension Settings → Configure shortcut in Chrome, then assign your preferred key combination under GT Link Quick Shortener. Alternatively visit `chrome://extensions/shortcuts` directly.

## Features
- Secure random slugs by default, 6 characters, configurable 4–20
- Customisable slug, redirect and metadata in popup
- Duplicate destination check: local recent cache then exact-match API search in popup. Reuse or create a new link. Background actions reuse local history, not a full remote duplicate search.
- 20 recent links saved locally, shown on a separate History page with copy/open/reuse and click-stat refresh
- Click counters refresh on demand (GET links/{id}); requires server support and permissions
- WordPress Application Password is not shown after saving, with Forget Credentials control
- Website permissions requested when saving settings; HTTPS only
- Existing saved preferences persist when installing over the same Chrome extension ID

## Install
Extract archive, visit chrome://extensions, enable Developer mode, choose Load unpacked and select folder. Save settings (and allow host permissions). Confirm Test Connection.

## Notes
Settings and Application Password are stored in Chrome extension local storage, not encrypted at rest. Use a dedicated least-privilege WordPress Application Password. Some Chrome builds may block clipboard writes from offscreen/background execution; use popup history to copy if needed. Avoid enabling 'instant shorten when popup opens' if accidental creation is a concern. Currently the popup auto-create can be triggered whenever the popup opens in that mode.

API reference: https://gauravtiwari.org/gt-link-manager-rest-api-guide-ai-tools/

## History and keyboard settings
The popup has a **View history** button that opens a full-size page displaying up to 20 links, with Copy, Open, and Reuse/edit actions. Reuse/edit opens the editor in its own tab and preloads the selected link values; choose a different slug before creating. Stats refresh and local history deletion are available on the history page.

The quick-shorten keyboard shortcut has **no default**; choose your own at `chrome://extensions/shortcuts`, also accessible from Settings.

### Keyboard shortcut troubleshooting
The toolbar popup shows **Last keyboard / right-click action**, including failures and whether clipboard copying succeeded. Chrome shortcuts are configured at `chrome://extensions/shortcuts`. Reload the extension after upgrading. The shortcut handler now accepts Chrome's supplied tab and reliably reads the active tab URL; browser tab access is required for this. Notifications can be suppressed by the OS, so diagnostic status is kept locally instead.


### Pre-release fix: background clipboard and stale history
- Keyboard and context-menu actions verify cached duplicate links against GET /links/{id} before reusing them. Deleted, inactive or changed links are discarded from local history and replaced.
- WordPress verification failures stop the quick action rather than silently reusing an unverified link.
- Offscreen clipboard copying uses a selected textarea with document.execCommand('copy'), plus navigator.clipboard fallback; failures are detailed under Last keyboard / right-click action.
- Version remains 1.0.0.
