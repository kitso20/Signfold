# Signfold

A private, client-side PDF filler and signer that runs as a static site. Open a PDF in the
browser, click anywhere to type, drag saved signatures and initials onto the page, and capture a
real touch signature from a phone with a QR code. Everything persists in the user's own Google
Drive.

No application backend, no document uploads to a third-party service, and no build-time secrets.

## Features

- **PDF.js rendering** with continuous scrolling, zoom, fit-to-width, and page tracking.
- **Click-to-type text** directly on any page. Text stays editable, selectable, and exportable.
- **Saved stamps** for signatures, initials, and email addresses. Click to place or drag onto a
  page, then move and resize.
- **Sign on phone** with a QR code. The phone opens a mobile drawing canvas and sends the signature
  to the desktop in real time over WebRTC.
- **Google Drive sync** with OAuth 2.0. Signatures, initials, email stamps, recent documents, and
  saved PDFs live in a folder in the user's own Drive.
- **Cross-device restore**. Sign in with the same Google account and folder name on a new device
  to pull down saved marks and recent documents.
- **Export** a flattened signed PDF, download it, or save it back to Drive.
- **Static deployment**. The production build is plain HTML, CSS, JavaScript, and a PDF.js worker.

## Privacy model

Signfold is an entirely client-side application:

- PDFs are read and modified in browser memory.
- Google Drive API calls go directly from the browser to `googleapis.com` using a short-lived
  OAuth access token.
- Access tokens are kept in memory and are never written to `localStorage`.
- The OAuth scope is `drive.file`, which only grants access to files and folders created by this
  app, not the rest of the user's Drive.
- Phone signatures travel over an encrypted WebRTC data channel. The default PeerJS service is
  used only for signaling so the two browsers can find each other. Signature images never pass
  through it.

The only values stored locally are convenience settings: the public OAuth client ID, the Drive
folder name, and a "previously connected" flag used for silent reconnect attempts.

## Drive layout

Signfold creates this structure in the user's Drive:

```
My Drive/
└── Signfold/                  (folder name is configurable)
    ├── settings.json          saved signatures, initials, emails, recent documents
    └── Documents/             PDFs saved from Signfold
```

Signatures are stored as PNG data URLs inside `settings.json`, which makes restoring on a new
device a single request. PDFs opened from the device are only uploaded when **Save to Drive** is
used.

## Local development

Requirements: Node.js 22+ and npm.

```bash
npm install
npm run dev
```

Open the printed local URL, normally `http://localhost:5173`.

Optional environment variables:

```bash
cp .env.example .env
# edit .env
```

| Variable | Purpose |
| --- | --- |
| `VITE_GOOGLE_CLIENT_ID` | Bake the public Google OAuth client ID into the build. Can also be pasted in the app at runtime. |
| `VITE_PEER_HOST` | Optional self-hosted PeerJS signaling host. |
| `VITE_PEER_PORT` | PeerJS port (default `443`). |
| `VITE_PEER_PATH` | PeerJS path (default `/`). |
| `VITE_PEER_SECURE` | `true` or `false` (default `true`). |
| `VITE_TURN_URL` | Optional TURN relay URL for restrictive networks. |
| `VITE_TURN_USERNAME` | TURN username. |
| `VITE_TURN_CREDENTIAL` | TURN credential. |

## Google Drive / OAuth setup

1. Open the [Google Cloud console](https://console.cloud.google.com/) and create a project.
2. Enable **Google Drive API** under *APIs & Services → Library*.
3. Configure the **OAuth consent screen**. For personal use, add your own account as a test user.
   Publish the app later if you want others to use it.
4. Create credentials: *APIs & Services → Credentials → Create credentials → OAuth client ID*.
   - Application type: **Web application**
   - Authorized JavaScript origins:
     - `http://localhost:5173` for local development
     - `https://<your-github-username>.github.io` for GitHub Pages
     - Any custom domain you use, as an origin only (no path)
5. Copy the client ID. It is public configuration, not a secret.

You can provide the client ID in either of two ways:

- Set `VITE_GOOGLE_CLIENT_ID` at build time, or set the `GOOGLE_CLIENT_ID` repository variable for
  the GitHub Actions workflow.
- Leave it unset and paste the client ID into the **Connect Drive** dialog at runtime. It is saved
  in that browser's `localStorage`.

## Deploy to GitHub Pages

1. Push this repository to GitHub as a public repository.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. In **Settings → Secrets and variables → Actions → Variables**, create a repository variable
   named `GOOGLE_CLIENT_ID` with your OAuth client ID. This step is optional if users will paste
   the client ID at runtime.
4. Push to `main`. The workflow in `.github/workflows/deploy.yml` builds and deploys the site.
5. Add the Pages origin to your Google OAuth client's authorized JavaScript origins:
   `https://<your-github-username>.github.io`.

Vite uses a relative base path, so the app works from a project Pages URL such as
`https://username.github.io/pdfeditor/`.

## Using the app

1. Open a PDF from the device or from a recent Drive document.
2. Use the **Text** tool and click anywhere on a page to start typing. Press `Esc` or click away to
   finish. `Select` mode lets you click empty space to deselect.
3. Draw a signature or initials with **Signature** / **Initials**, or use **Sign on phone**.
4. Click a saved mark in the sidebar to place it on the current page, or drag it onto an exact spot.
   Drag stamps to move them and use the corner handle to resize.
5. Use the selection toolbar to change text font, color, or size, or to delete the selected item.
6. Click **Download** for a local copy or **Save to Drive** to store the flattened PDF.

### Restoring on a new device

1. Click **Connect Drive**.
2. Sign in with the same Google account.
3. Use the same folder name, for example `Signfold`.
4. Signfold loads `settings.json` and lists the PDFs in `Documents/`.

## Phone signing details

The QR code points at a hash route in the same static app, for example:

```
https://username.github.io/pdfeditor/#/sign?session=<random-peer-id>
```

The phone creates a WebRTC data connection to the desktop through the peer ID. By default the
public PeerJS broker is used for signaling. To avoid that third-party dependency, self-host a
PeerJS server and set the `VITE_PEER_*` variables. On restrictive networks, add a TURN server with
the `VITE_TURN_*` variables.

## Scripts

```bash
npm run dev        # Vite development server
npm run typecheck  # TypeScript project check
npm run build      # typecheck + production build to dist/
npm run preview    # preview the production build
```

## Technical notes and limitations

- PDF rendering uses PDF.js; exporting uses pdf-lib.
- Annotation coordinates are stored in PDF display space and converted through PDF.js viewports, so
  rotated pages export correctly.
- Export uses the standard PDF fonts Helvetica, Times, and Courier. Characters outside the standard
  encoding are replaced with `?`. Custom font embedding can be added if needed.
- Password-protected/encrypted PDFs are not currently supported.
- Scanned PDFs can be stamped and signed, but the app does not perform OCR.
- The Drive integration uses `drive.file`; it intentionally cannot browse the user's entire Drive.
- Signatures are embedded in `settings.json`. For very large numbers of high-resolution marks,
  storing individual PNGs in Drive would be a good next step.
- Phone signing requires internet access for the signaling handshake even when both devices are on
  the same network, unless you self-host signaling.
