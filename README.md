# Quick Notes

Quick Notes is a modern, responsive note-taking application built with Angular 20, featuring autosave, advanced search and filtering, smart organization, and light/dark themes. Built with standalone components, signals, and strict TypeScript, it emphasizes clean architecture, data integrity, accessibility, and reliable local persistence — all without a backend or user account.

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
