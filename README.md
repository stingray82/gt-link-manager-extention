# GT Link Quick Shortener

A Chrome extension for creating and copying short links through the [GT Link Manager](https://gauravtiwari.org/product/gt-link-manager/) WordPress plugin. Quickly shorten the current page, customise individual links, and manage a small local history without opening the WordPress dashboard.

> **Status:** Pre-release testing. The extension remains at version **1.0.0** while features are being refined.

**Repository:** [stingray82/gt-link-manager-extention](https://github.com/stingray82/gt-link-manager-extention)

## Features

- **Quick shorten and copy:** Create a short URL from the current tab using saved defaults, then copy it to the clipboard.
- **Custom link creation:** Choose a link mode for each link and edit its destination, name, slug, redirect type, and metadata before creating it.
- **Link modes:** Use Standard (with your configured prefix), Direct (without the prefix), or Regex (pattern match). Set a default for quick actions and override it for an individual link.
- **Short random slugs:** Generate compact random slugs (six characters by default); choose title-based, domain-based, manual or server-generated slugs instead.
- **Keyboard shortcut:** Assign your own combination in Chrome's extension shortcut settings; no fixed shortcut is required.
- **Context menu:** Right-click a page or link to shorten it.
- **Separate history page:** Review up to 20 recently created links with copy, open and reuse/edit actions.
- **Duplicate checking:** Check previously created links to avoid unnecessary duplicates; the extension verifies locally remembered links with the server before reusing them.
- **Click counts:** Refresh supported statistics for saved links from GT Link Manager.
- **Connection diagnostics:** Test WordPress authentication and troubleshoot API responses.
- **Credential controls:** Save a WordPress Application Password without showing it again in the settings field, replace it when needed, or forget saved credentials.

## Requirements

- Google Chrome or a compatible Chromium-based browser supporting Manifest V3 extensions.
- A WordPress site with [GT Link Manager](https://gauravtiwari.org/product/gt-link-manager/) installed and its REST API available.
- An **HTTPS** WordPress site URL.
- A WordPress user with permission to manage GT Link Manager links (the default API capability is `edit_posts`).
- A WordPress **Application Password** for that user. **Do not use your normal WordPress login password.**

## Install (unpacked extension)

Until a packaged release is available, install the extension as an unpacked Chrome extension:

1. Download the extension source from this repository (or a release ZIP containing the extension files) and extract it.
2. In Chrome, open `chrome://extensions`.
3. Enable **Developer mode** (top-right).
4. Select **Load unpacked** and choose the folder containing `manifest.json`.
5. Pin **GT Link Quick Shortener** to your browser toolbar if you want easy access.

**Updating an unpacked installation:** Replace the files in the *same* extension directory, then choose **Reload** on `chrome://extensions`. Loading another directory may create a separate installation with different local settings.

## WordPress setup

1. Install and activate GT Link Manager on your WordPress website.
2. In the WordPress dashboard, go to **Users → Profile** (or edit the intended user's profile).
3. Scroll to **Application Passwords**.
4. Enter a name such as `GT Link Quick Shortener` and select **Add New Application Password**.
5. Copy the generated password immediately; WordPress will not display it again.
6. Ensure that account has the capability required by GT Link Manager's REST API (`edit_posts` by default).

If the Application Password section is missing, check that the site is served over HTTPS and that application passwords have not been disabled by site policy or another plugin.

## Configure the extension

1. Click the extension icon and open **Settings**.
2. Enter your **WordPress base URL**, such as `https://short.example.com` — **not** the `/wp-json/...` API path.
3. Enter your WordPress **username** and the **Application Password** generated above.
4. Set your preferred short-link prefix to match your GT Link Manager configuration (for example, `/go/` or `/g/`).
5. Choose the default link mode for quick actions. It saves automatically when changed.
6. Choose defaults for redirect type and slug generation, then click **Save settings** to save those and your connection details. **Random short string** with a length of **6** is a useful starting point for social sharing.

Standard mode uses the configured prefix, Direct mode omits it, and Regex mode uses pattern matching. The create form opens with the saved default mode; choose another mode there to override it for one link. Redirect type and link metadata can also be changed per link under **More options**, and the slug can be edited in the main form.

The password field is intentionally left blank when you reopen Settings. **Blank means keep the previously saved password**; enter a new value only to replace it. Hiding the field does not encrypt the stored credential.

## Create a short link

### Customise a link

1. Browse to the page you want to share.
2. Click the extension icon.
3. Review or change the destination URL, link name, slug, and link mode. Use **More options** to override the default redirect type and metadata for this link.
4. Click **Create short link**.
5. The resulting URL is automatically copied to your clipboard when Chrome permits clipboard access. A manual copy control is available as a fallback.

### Quick shorten using defaults

Click **Quick shorten & copy** in the popup to create a link with the saved defaults. You can also use the keyboard shortcut or the right-click context menu. Quick actions use your saved defaults, including link mode. Use the creation form whenever you want to choose a per-link mode, custom slug, redirect, or metadata.

An optional **Instant shorten when popup opens** preference triggers quick creation on opening the popup. Leave this off if you often want to customise links before creating them.

### Change the keyboard shortcut

1. Open `chrome://extensions/shortcuts` in Chrome.
2. Find **GT Link Quick Shortener**.
3. Assign a key combination to **Quick shorten the current page**.
4. Avoid combinations already in use by Chrome, the operating system or other extensions.

Chrome manages shortcut assignments; the extension cannot reliably set arbitrary shortcuts on your behalf.

### Recent links and stats

Choose **View history** from the popup to open the dedicated history page. It holds up to 20 locally remembered links and supports copying, opening, and reusing/editing a saved link. Refresh statistics to request current click counts where supported by the API.

Local history is **not** a complete inventory of links on your WordPress site. Clearing history does **not** delete links from GT Link Manager. Links removed from WordPress may also become invalid; the extension checks the server before reusing local matches during quick shortening.

## Troubleshooting

| Problem                                               | What to check                                                |
| ----------------------------------------------------- | ------------------------------------------------------------ |
| `HTTP 401` or `Sorry, you are not allowed to do that` | Verify the username and **Application Password**, then run **Test Connection**. Check the user's required WordPress capabilities and whether security software blocks REST authentication. |
| Connection works, but creation fails                  | Check the detailed API error; a successful `GET` does not by itself prove `POST` link-creation permission. |
| The shortcut does nothing                             | Confirm it is assigned at `chrome://extensions/shortcuts`, then check the popup's **Last keyboard / right-click action** diagnostic. Reload the extension after updates. If Chrome reports that service worker registration failed, inspect the worker error for a JavaScript syntax error, fix it, and reload. |
| Link created but not copied                           | Check Chrome clipboard permissions and the quick-action diagnostic. Use the manual **Copy** button if necessary. |
| A short URL is wrong or returns 404                   | Verify your configured short-link prefix matches GT Link Manager's prefix and confirm that the link is active on WordPress. |
| A previously created link was deleted                 | Recreate the link. Local history and the live server can differ until the extension verifies the saved record. |
| Password field looks empty                            | This is intentional after saving: leave it blank to retain the stored password. |

For an independent API check, use your credentials locally (never post them in issues):

```bash
curl -i -u "USERNAME:APPLICATION_PASSWORD" \
  "https://short.example.com/wp-json/wp/v2/users/me"
```

See the [GT Link Manager REST API guide](https://gauravtiwari.org/gt-link-manager-rest-api-guide-ai-tools/) for API details.

## Privacy and security

- Requests go from the extension to the WordPress site you configure; use **HTTPS**.
- Use a dedicated WordPress Application Password, ideally for an account with only the capabilities it needs, and revoke the password in WordPress if it is compromised.
- The saved password is not re-displayed in Settings, but Chrome extension storage is **not an encrypted secrets vault**. Anyone with sufficient access to your browser profile or development tools may be able to inspect it.
- The extension maintains a limited, local history of links. Clearing that history does not affect server-side records.
- Review requested browser permissions before installing, especially when loading an unpacked extension.

## Alpha 2 changes

- Added Standard, Direct, and Regex link modes, with a saved default and a per-link override.
- Quick shorten, keyboard shortcut, and context-menu actions use the saved link-mode default.
- The default link mode saves automatically; other settings continue to use **Save settings**.
- Fixed a service worker syntax error that prevented the background worker and keyboard shortcut from starting.

## Contributing

Bug reports, feedback and pull requests are welcome through [GitHub Issues](https://github.com/stingray82/gt-link-manager-extention/issues). For bug reports, include the extension build, Chrome version, steps to reproduce and any visible diagnostic message. **Remove credentials, private URLs and other secrets before posting logs.**

## Credits

Built to work with [GT Link Manager](https://gauravtiwari.org/product/gt-link-manager/) by Gaurav Tiwari. This browser extension is an independent companion project.

## License

Released under the **MIT License**. See [LICENSE](LICENSE) for the full license text.
