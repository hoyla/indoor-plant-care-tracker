# Indoor Plant Care Tracker

A mobile-first, printable care guide and lightweight journal for individual indoor plants. A curated catalogue of common UK indoor plants is kept in `data/care-profiles.json`; a generic three-plant sample inventory is kept in `data/inventory.json`; and example room-light context is kept in `data/rooms.json`.

In production, the editable inventory is synchronized through an authenticated Edge Function and EdgeOne KV. Care profiles remain reviewed, sourced and version-controlled, while room assignments and newly added specimens can change without editing the repository. The **Browse care catalogue** dialog lists and filters every available profile; the add-plant dialog searches the same common names, scientific names, familiar aliases and categories. A genuinely unlisted species remains clearly marked as pending research.

The catalogue is a practical selection, not a claimed sales ranking. Its UK care baseline comes from the Royal Horticultural Society, current plant names are cross-checked through Kew's Plants of the World Online, and pet-safety references point to the ASPCA database. Individual profiles retain their source links so advice can be reviewed as horticultural guidance or taxonomy changes.

Watering sections include approximate targets for a 0–10 moisture meter. These are comparison aids rather than absolute measurements: probe at root depth in several places and confirm with compost feel and pot weight. Chunky orchid bark is explicitly excluded because a conventional soil probe is not dependable in that medium.

Light sections include a daily light integral (DLI) target in mol/m²/day. DLI
combines photosynthetically active light intensity with its duration across the
day, making it more useful for plant growth than an instantaneous lux reading.
Measure at leaf level with Photone set to the correct light source and follow its
diffuser instructions. Natural window light varies with weather, obstructions
and season, so log a representative full day rather than relying on one peak.

The broad ranges follow Iowa State University Extension's indoor-plant
[DLI guidance](https://yardandgarden.extension.iastate.edu/how-to/growing-indoor-plants-under-supplemental-lights/important-considerations-providing-supplemental-light-indoor-plants):
3–6 mol/m²/day for low-light foliage plants, 6–10 for medium-light foliage and
flowering plants, 12–16 for high-light flowering plants and succulents, and
18–30 for very-high-light herbs, fruit and vegetables. Purdue Extension's guide
to [measuring DLI](https://www.extension.purdue.edu/extmedia/ho/ho-238-w.pdf)
provides the underlying definition and explains why the accumulated daily
measurement matters. Plant-by-plant band selection follows the authoritative
sources already recorded on each care profile.

The DLI target is deliberately not changed by the summer/winter switch for
ordinary evergreen houseplants: winter often reduces the light available, not
the plant's underlying light requirement. Seasonal rest, annual cropping and
overwintering exceptions remain explicit in each profile's seasonal prose.

## Preview locally

From this directory, start any static web server. For example:

```sh
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Manage plants

Choose **Manage plants** in the guide to rename a specimen, link or correct its care profile, move it, add dated photos, edit its accessible main-photo description, add a new specimen, or remove an existing specimen after confirmation. Removing a specimen does not remove its reusable catalogue profile. Inventory changes and photo paths are saved to KV; uploaded photo files are saved to EdgeOne Blob. A photo can also be chosen while adding a plant. Without one, the new specimen uses its care profile’s default photo when available, otherwise `images/placeholder.svg`. When a catalogue search has exactly one result, the add-plant form selects that care profile automatically.

Each specimen has its own **Photo history**, opened from its plant card. Photos are displayed newest first with an optional note, while the existing `image` field remains the explicit current/main image for backward compatibility. The browser reads EXIF `DateTimeOriginal` from JPEG source files when available; otherwise it suggests the file-modified date, and the date always remains editable before saving. A visible preview distinguishes a selected photo from an uploaded-but-not-yet-saved photo, and closing the dialog warns before discarding either. A saved entry can be deleted in Manage mode; deleting the main upload selects a safe replacement. Replacing an undated main image first preserves it as an undated timeline entry so its link is never silently lost. Stable photo IDs, optional capture dates and added timestamps make the timeline suitable for later care-event markers and before/after selection without introducing a database.

Each plant card also opens a compact **Recovery log**. It keeps moisture readings alongside dated observations, pest checks, treatments, growth notes, repotting notes and other short entries. Schedule work as a separate **Future action** with its own due date and clear instruction; due and overdue actions appear on the plant card and in **Needs checking**, and can be marked done or reopened. Older entry-attached follow-up dates are migrated into future actions automatically. Use **Needs attention**, **Recovering** or **Monitoring** as the plant status while an issue is active. The log deliberately stays lightweight: it does not try to model every pest, product or maintenance task as a separate record.

The open-source Uppy photo editor lets you crop every new image to a 3:4 portrait, rotate, flip and zoom it before upload. Its browser-side compressor limits the result to 900 × 1200 pixels, converts it to JPEG, keeps it below the Edge Function request limit and removes embedded metadata. Capture metadata is read before that privacy-preserving conversion. Plant cards show the upper 75% of that portrait as a square and continue the lower 25% beneath a plain, 50%-transparent identity panel. Existing landscape files fill the portrait frame by cropping their sides. For an existing plant, the editor uploads the prepared image privately and the photo-history form then commits its date, optional note and main-photo choice. Deleting a specimen removes all of its uploaded timeline Blobs after the inventory change has saved successfully; closing a timeline with an unattached upload cleans it up. A repository-managed image path remains available under the collapsed **Advanced photo option** for deliberately public assets.

The Uppy editor is bundled into `vendor/photo-uploader.js` and `vendor/photo-uploader.css` so EdgeOne can continue deploying the repository root as an ordinary static site. After changing `photo-uploader-entry.js` or its dependencies, run `npm run build:photo-uploader` and commit the rebuilt vendor files.

To add care for a new species:

1. Add a profile to `data/care-profiles.json`, following `data/care-profile.schema.json`.
2. Link the specimen to that profile in the seed inventory or synchronized inventory.
3. Upload personal photographs through the authenticated application rather than committing them.
4. Record identification uncertainty explicitly. Do not add species-specific care until identification is sufficiently reliable.
5. Base advice on authoritative horticultural sources and keep the source URLs in the profile.

Update `data/rooms.json` when a room’s window aspect, screening or glazing changes. Plant cards draw their shared room-light description from that file, while `placement` in the inventory records the individual plant’s position within the room.

Original full-resolution photographs belong outside the repository. Both `source_photos/` and new files under `images/` are ignored by Git; `images/placeholder.svg` is the only bundled image. The authenticated uploader stores personal photos in private EdgeOne Blob storage after removing embedded metadata. Deliberately public demonstration assets can still be added explicitly after checking their contents and metadata.

## Privacy and deployment

- The source repository can be public because it contains only generic sample records and a placeholder image. Keep real household inventory, environment configuration and photographs out of public commits.
- Deploy the repository to EdgeOne Pages.
- `middleware.js` protects every route at the EdgeOne edge, including HTML, JSON, photographs and other static assets.
- `edge-functions/api/inventory.js` provides the same-origin inventory API. It is protected by the all-route middleware and rejects cross-origin updates.
- `edge-functions/api/photos/` accepts compressed JPEG uploads over the authenticated, same-origin application route and serves them back through authenticated routes. Raw storage URLs are not saved in the inventory.
- Unauthenticated visitors receive a self-contained password page. A successful login sets a signed, secure, HTTP-only cookie for 60 days; visit `/logout` to clear it.
- Authentication fails closed with HTTP 503 until both required environment variables exist, so a newly connected deployment cannot accidentally expose the guide.
- Do not commit passwords, API keys, session secrets or `.env` files.

Configure these variables in the EdgeOne project under **Settings → Environment Variables**:

- `PLANT_GUIDE_PASSWORD`: a strong password of at least 12 characters, stored in your password manager.
- `PLANT_GUIDE_SESSION_SECRET`: a separate random value of at least 32 characters, used to sign login cookies.

Environment variable changes apply only to new deployments, so redeploy after saving them. The password is checked only by middleware and is never sent to the static site or stored in browser JavaScript.

### Connect synchronized inventory storage

1. In EdgeOne Makers, open **Storage → KV** and activate KV if necessary.
2. Create a namespace such as `indoor-plant-inventory`.
3. In this project, open **KV Storage**, bind that namespace, and use the variable name `plant_inventory`.
4. Redeploy the project after binding it.

The first room change or newly added plant initializes the `plant_inventory_v1` record. EdgeOne KV is eventually consistent, so a different device routed to another edge node can take up to about 60 seconds to see a recent change. The checked-in seed inventory remains the fallback until the first synchronized edit.

### Uploaded photo storage

The photo functions use the EdgeOne Blob store named `plant-photos`. The store is obtained through EdgeOne's Pages Blob SDK and does not use a KV-style project binding. On the first upload, EdgeOne creates or opens that named store for the deployed project. Uppy compresses the prepared JPEG below 900 KiB and posts it through the same-origin `/api/photos` Edge Function, avoiding a separate cross-origin storage request. Reads use `/api/photos/…`, where the existing middleware requires a valid login.

The ordinary static preview displays all photo controls, but it cannot complete a Blob upload because Edge Functions and their deployment credentials are unavailable there. Test real uploads on an EdgeOne preview deployment after the PR is deployed.

The ordinary `python3 -m http.server` preview does not execute EdgeOne middleware. Run the automated checks with `npm test`; use `edgeone makers dev` after linking the EdgeOne project when an end-to-end local authentication preview is needed.

The implementation follows EdgeOne's documented middleware, Edge Functions and KV APIs:

- <https://pages.edgeone.ai/document/middleware>
- <https://pages.edgeone.ai/document/agents-authentication>
- <https://pages.edgeone.ai/document/edge-functions>
- <https://pages.edgeone.ai/document/kv-storage>
- <https://pages.edgeone.ai/document/blob-storage>
