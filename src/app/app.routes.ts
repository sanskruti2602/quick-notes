import { Routes } from '@angular/router';

import { unsavedChangesGuard } from './core/guards/unsaved-changes.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'notes' },
  {
    path: 'notes',
    pathMatch: 'full',
    title: 'All Notes · Quick Notes',
    data: { view: 'all' },
    loadComponent: () =>
      import('./features/notes/pages/notes-page/notes-page.component').then((m) => m.NotesPageComponent),
  },
  {
    path: 'notes/:id',
    title: 'Edit note · Quick Notes',
    canDeactivate: [unsavedChangesGuard],
    loadComponent: () =>
      import('./features/notes/pages/note-editor-page/note-editor-page.component').then(
        (m) => m.NoteEditorPageComponent,
      ),
  },
  {
    path: 'pinned',
    title: 'Pinned · Quick Notes',
    data: { view: 'pinned' },
    loadComponent: () =>
      import('./features/notes/pages/notes-page/notes-page.component').then((m) => m.NotesPageComponent),
  },
  {
    path: 'archived',
    title: 'Archived · Quick Notes',
    data: { view: 'archived' },
    loadComponent: () =>
      import('./features/notes/pages/notes-page/notes-page.component').then((m) => m.NotesPageComponent),
  },
  {
    path: 'trash',
    title: 'Trash · Quick Notes',
    data: { view: 'trash' },
    loadComponent: () =>
      import('./features/notes/pages/notes-page/notes-page.component').then((m) => m.NotesPageComponent),
  },
  {
    path: 'tags',
    pathMatch: 'full',
    title: 'Tags · Quick Notes',
    loadComponent: () =>
      import('./features/notes/pages/tags-page/tags-page.component').then((m) => m.TagsPageComponent),
  },
  {
    path: 'tags/:tag',
    title: 'Tag · Quick Notes',
    data: { view: 'tag' },
    loadComponent: () =>
      import('./features/notes/pages/notes-page/notes-page.component').then((m) => m.NotesPageComponent),
  },
  {
    path: 'settings',
    title: 'Settings · Quick Notes',
    loadComponent: () =>
      import('./features/settings/settings-page/settings-page.component').then(
        (m) => m.SettingsPageComponent,
      ),
  },
  { path: '**', redirectTo: 'notes' },
];
