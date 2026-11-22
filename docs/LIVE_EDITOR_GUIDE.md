# 3-Pane Visual Live Editor Guide — Sharm Pharaoh Travel

## 1. Overview & Architecture

The **Live Editor** (`/admin/live-editor`) provides a 3-pane visual workbench for managing all 8 main public pages, legal pages (`/p/privacy`, `/p/terms`, `/p/booking-policy`, `/p/about`), and custom landing pages:

1. **Left Pane — Sections / Layers**:
   - View every section on the active page in visual order.
   - Reorder sections via drag-and-drop or accessible keyboard **Move Up** / **Move Down** controls.
   - Add new sections from the 13 typed block schemas (`Hero`, `SearchBar`, `DestinationGrid`, `TourGrid`, `RichText`, `ImageText`, `ImageGallery`, `VideoHero`, `Benefits`, `FAQ`, `CallToAction`, `ContactForm`, `SpacerDivider`).
   - Show/hide (`hidden`), duplicate, or delete unlocked sections.
   - **Locked Transactional Sections**: Critical conversion blocks (`SearchBar` on Home, `ContactForm` on Contact) are locked so editors cannot accidentally delete them.
2. **Center Pane — Live Interactive Canvas**:
   - Renders the active draft using the exact same `SharedBlockRenderer` component as the public website and `/preview`.
   - Switch responsive canvas presets at the top bar: **Desktop**, **Tablet (`768px`)**, and **Mobile (`390px`)**.
3. **Right Pane — Inspector & Page SEO**:
   - **Section Settings**: Edit typed properties (headlines, gold accent word, body HTML, CTAs, destination/category filters, focal point `x`/`y`, background palette token `petrol`/`turquoise`/`gold`/`ivory`/`white`, container width, vertical padding, responsive visibility toggles).
   - **Page SEO**: Edit the page's `<title>`, meta description, and `noindex` flag.

---

## 2. Draft Isolation, Autosave & Conflict Recovery

- **Draft vs Published Separation**:
  - Edits and debounced autosaves (`1.5s`) update only the page's `DRAFT` revision (`currentDraftId`).
  - Anonymous visitors on the live site continue to see `publishedRevisionId` until a staff member with `cms:publish` (`OWNER`, `MANAGER`, or `CONTENT_EDITOR`) explicitly clicks **Publish**.
- **Signed Shareable Preview (`/preview?token=...`)**:
  - Click **Preview** in the top bar to open a time-limited (`30m`), HMAC-SHA256-signed preview link (`Cache-Control: private, no-store`, `X-Robots-Tag: noindex, nofollow`).
  - Forged or expired preview tokens are rejected (`401 Unauthorized`).
- **Optimistic Concurrency & Conflict Modal**:
  - Every draft save includes `expectedDraftVersion`.
  - If two editors edit the same page simultaneously, the second save returns `409 VERSION_CONFLICT` and opens the **Concurrent Edit Conflict Detected** modal, allowing the editor to either **Reload Server Version** or **Save My Work as Duplicate Draft** (never silently overwriting another editor's work).

---

## 3. Publishing, Cache Revalidation, Scheduling & Rollback

- **Immediate Publish Without Rebuild**:
  - Clicking **Publish** validates the entire block document on the server, advances `publishedRevisionId`, creates a fresh working draft, logs an `AuditLog` entry, and invokes `POST /api/internal/revalidate` (`revalidateTag` + `revalidatePath`) so the live website updates immediately without a rebuild or container restart.
- **Scheduled Publishing**:
  - Click **Schedule** to select a future publication date/time. The durable PostgreSQL background worker (`apps/worker`) automatically executes due schedules and triggers Next.js cache revalidation.
- **One-Click Revision Rollback**:
  - Click **History** to inspect up to 30 immutable revisions (`Revision #1`, `#2`, ...) with author and timestamp.
  - Clicking **Rollback Live to #N** creates a new published revision cloned from `#N` and revalidates the public cache immediately.
