# Quick Notes

A fast, responsive notes app built with **Angular 20** (standalone components, signals), **strict TypeScript** and **SCSS**. Notes are stored in your browser's LocalStorage — no backend, no account, works offline.

## Features

- **Notes CRUD** — create, view, edit and delete notes. Empty titles display as *Untitled Note*; line breaks are preserved.
- **Autosave or explicit save** — autosave (default) saves ~0.7 s after you stop typing; turn it off in Settings to use **Save** or **Ctrl+S / ⌘S**. A status indicator shows *Saving…*, *Saved*, *Unsaved changes* or a storage error.
- **Organisation** — pin/unpin, archive/unarchive, Trash with restore and permanent delete, colour labels, tags.
- **Search & filters** — live, case- and accent-insensitive search across titles, content and tags; tag filter; *Pinned only*; sort by last modified, newest, oldest or title; grid or list layout.
- **Safety nets** — confirmation dialogs for destructive actions, **Undo** on archive/trash toasts, unsaved-change guards for in-app navigation and tab close, graceful handling of corrupt or full storage.
- **Themes** — light, dark or follow the system; persisted.
- **Responsive** — sidebar on desktop, collapsible icon rail on tablets, off-canvas drawer on phones.
- **Accessible** — semantic landmarks, labelled controls, keyboard-operable menus and dialogs, visible focus, live-region announcements, reduced-motion support.
- **Data tools** — export all notes to JSON, import a previous export, delete everything.

## Getting started

Requirements: **Node.js 20.19+ or 22.12+** (LTS) and npm. Tests need Chrome or Chromium installed.

```bash
npm install          # install dependencies
ng serve             # dev server at http://localhost:4200 (or: npm start)
ng test              # unit tests with Karma + Jasmine (watch mode)
ng build             # production build into dist/quick-notes
```

If the Angular CLI is not installed globally, prefix commands with `npx` (for example `npx ng serve`) or use the npm scripts: `npm start`, `npm test`, `npm run build`. For a single headless test run (CI): `npm run test:ci`.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `/` | Focus search (when not typing in a field) |
| `Esc` (in search) | Clear search |
| `Ctrl+S` / `⌘S` | Save the open note |
| `Enter` or `,` (tag field) | Add tag; `Backspace` on an empty tag field removes the last tag |
| `↑` `↓` `Home` `End` | Move through a note's actions menu |
| `Esc` | Close menus, dialogs and the mobile navigation |

## Business rules

| Rule | Behaviour |
| --- | --- |
| Active notes | A note that is neither archived nor in Trash. Only active notes appear in All Notes, Pinned, tag views and search there. |
| Pinning | Only active notes can be pinned. Archiving or trashing a note unpins it. |
| Archive | Archived notes stay editable but are hidden from All Notes and its search. |
| Trash | Trashed notes are read-only and excluded from normal search. Restoring returns a note to where it was (Archive or All Notes). |
| Permanent delete | Only possible from Trash, always after confirmation. |
| Modified date | `updatedAt` changes only when title, content, tags or colour change — not when pinning, archiving or trashing. It always strictly increases, even for edits in the same millisecond. |
| IDs | Notes get a UUID (`crypto.randomUUID`, with a fallback). Uniqueness is checked on create, load and import. Duplicate titles are fine. |
| Tags | Trimmed, inner whitespace collapsed, leading `#` removed, max 30 characters, max 20 per note, de-duplicated case-insensitively. |
| Validation | A note needs a title or content (a title with empty content is valid). Title ≤ 200, content ≤ 20,000 characters. |
| Sorting | Ties are broken by last modified, then title, then id, so equal timestamps never reorder randomly. |

## Persistence and error handling

- Notes are saved under `quick-notes:notes` as `{ "version": 1, "notes": [...] }`; settings under `quick-notes:settings`.
- **Malformed data**: unreadable JSON is copied to a `quick-notes:notes:backup:<timestamp>` key before starting fresh. Partially invalid data is repaired field by field (missing tags, bad dates, invalid colours, duplicate IDs) and you are told how much was fixed.
- **Storage full (quota)**: edits stay in memory, a persistent error toast and banner appear, the editor shows *Not saved to browser storage*, and closing the tab triggers a warning. The next change (or *Try again* in Settings) retries automatically. Export your notes from Settings to keep a copy.
- **Storage unavailable** (blocked cookies/site data, some private modes): the app keeps working in memory and shows a banner explaining that notes won't survive closing the tab.
- **Multiple tabs**: changes written in another tab are picked up automatically, unless this tab has unsaved changes of its own.
- **Rapid edits**: every change is applied synchronously to the latest state, so a slower autosave can never overwrite newer text.

## Project structure

```
src/
├── app/
│   ├── core/
│   │   ├── guards/unsaved-changes.guard.ts      # CanDeactivate for routed editors
│   │   └── services/                            # storage, notifications, confirm dialog,
│   │                                            # settings, theme, layout, navigation history
│   ├── features/
│   │   ├── notes/
│   │   │   ├── components/                      # note-card, note-list, note-editor,
│   │   │   │                                    # note-filters, note-search
│   │   │   ├── models/note.model.ts             # Note type, limits, labels
│   │   │   ├── pages/                           # notes-page (All/Pinned/Archived/Trash/tag),
│   │   │   │                                    # note-editor-page, tags-page
│   │   │   ├── services/                        # notes-state (signals store), note-actions,
│   │   │   │                                    # note-query (search text)
│   │   │   └── utils/note.utils.ts              # pure business rules (framework-free)
│   │   └── settings/settings-page/
│   ├── layout/                                  # header, sidebar
│   ├── shared/                                  # icon, action menu, empty state, toasts,
│   │                                            # confirm dialog, tooltip directive, date pipe
│   ├── app.ts / app.html / app.scss             # application shell
│   ├── app.config.ts
│   └── app.routes.ts
├── styles/                                      # _tokens, _mixins, _themes, _base, _controls, _core
├── styles.scss                                  # global styles entry
├── testing/                                     # test helpers (in-memory Storage, note factory)
├── index.html
└── main.ts
```

### Architecture notes

- **State**: `NotesStateService` holds notes in a signal and exposes `computed()` views (counts, tags, lookup map). Every mutation goes through one `commit()` that updates the signal and persists.
- **Business rules** live in `note.utils.ts` as pure functions (create, update, pin/archive/trash transitions, search, sort, validation, sanitising stored data). They are shared by the store, the editor and the tests.
- **UI orchestration**: `NoteActionsService` adds confirmations, toasts and Undo on top of the store, keeping the store free of UI concerns.
- **One list page, many views**: All Notes, Pinned, Archived, Trash and tag views are the same `NotesPageComponent`, configured through route data and bound with `withComponentInputBinding()`.
- **Editor**: `NoteEditorComponent` is a reusable reactive form (validation, dirty tracking, tags, colours, Ctrl/⌘+S). `NoteEditorPageComponent` owns saving, autosave, the leave guard and note-level actions.
- **Components** are standalone, `OnPush`, use signal inputs/outputs, `@if`/`@for` with `track`, and `inject()`.

### Styling

SCSS only — there are no `.css` source files. Design tokens (spacing, type scale, radii, z-layers, breakpoints) are Sass maps with accessor functions; themes are Sass maps compiled to CSS custom properties under `[data-theme]` so switching theme is instant. Component styles `@use 'styles/core'` for tokens and mixins (`respond-above`, `focus-ring`, `visually-hidden`, `line-clamp`, `surface`, …). Layout is mobile-first.

## Testing

Unit tests (Jasmine + Karma, ~125 specs) cover:

- business rules: creation, updates that preserve `id`/`createdAt`, pin/archive/trash/restore rules, search (case/accent-insensitive, scoped by view, never returning trashed notes), sorting with equal timestamps and duplicate titles, tag normalisation, validation, date formatting;
- persistence: refresh/restore, malformed JSON with backup, partial repair, quota errors keeping edits in memory and retrying, unavailable storage, import/export with ID collisions;
- services: notifications, confirm dialog, settings sanitising, note actions (confirmation, Undo);
- components: editor validation, dirty tracking, character count, Ctrl/⌘+S, tags, read-only Trash mode; note card actions and menu keyboard behaviour; list page empty states, pinned sections and live search; editor page create/edit, autosave, and the unsaved-changes guard.

```bash
ng test                 # watch mode
npm run test:ci         # single headless run
```

## Browser support

Current versions of Chrome, Edge, Firefox and Safari. The app uses the native `<dialog>` element, CSS `:has()` and `color-mix()`.
