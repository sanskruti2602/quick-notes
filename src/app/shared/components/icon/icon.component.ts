import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  Check,
  CircleAlert,
  CircleCheck,
  Download,
  EllipsisVertical,
  Inbox,
  Info,
  LayoutGrid,
  List,
  LucideAngularModule,
  Menu,
  Monitor,
  Moon,
  NotebookPen,
  PanelLeftClose,
  PanelLeftOpen,
  Pin,
  PinOff,
  Plus,
  RotateCcw,
  Save,
  Search,
  SearchX,
  Settings,
  StickyNote,
  Sun,
  Tag,
  Tags,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from 'lucide-angular';

/** The single place where Lucide icons are registered, so names stay consistent app-wide. */
const ICONS = {
  archive: Archive,
  'archive-restore': ArchiveRestore,
  back: ArrowLeft,
  check: Check,
  'circle-alert': CircleAlert,
  'circle-check': CircleCheck,
  close: X,
  download: Download,
  inbox: Inbox,
  info: Info,
  grid: LayoutGrid,
  list: List,
  logo: StickyNote,
  menu: Menu,
  monitor: Monitor,
  moon: Moon,
  more: EllipsisVertical,
  note: NotebookPen,
  'panel-close': PanelLeftClose,
  'panel-open': PanelLeftOpen,
  pin: Pin,
  'pin-off': PinOff,
  plus: Plus,
  restore: RotateCcw,
  save: Save,
  search: Search,
  'search-x': SearchX,
  settings: Settings,
  sun: Sun,
  tag: Tag,
  tags: Tags,
  trash: Trash2,
  warning: TriangleAlert,
  upload: Upload,
} as const;

export type IconName = keyof typeof ICONS;

/** Decorative icon. Always pair it with visible text or an `aria-label` on the parent control. */
@Component({
  selector: 'qn-icon',
  imports: [LucideAngularModule],
  template: `<lucide-icon [img]="icon()" [size]="size()" [strokeWidth]="strokeWidth()" />`,
  styleUrl: './icon.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
})
export class IconComponent {
  readonly name = input.required<IconName>();
  readonly size = input(18);
  readonly strokeWidth = input(2);

  protected readonly icon = computed(() => ICONS[this.name()]);
}
