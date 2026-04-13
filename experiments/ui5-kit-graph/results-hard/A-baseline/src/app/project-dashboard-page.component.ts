import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  signal,
  CUSTOM_ELEMENTS_SCHEMA
} from '@angular/core';
import { CommonModule } from '@angular/common';

// ── UI5 Web Components ────────────────────────────────────────────────────────
import { setTheme } from '@ui5/webcomponents-base/dist/config/Theme.js';
import '@ui5/webcomponents-fiori/dist/DynamicPage.js';
import '@ui5/webcomponents-fiori/dist/DynamicPageTitle.js';
import '@ui5/webcomponents-fiori/dist/DynamicPageHeader.js';
import '@ui5/webcomponents-fiori/dist/FlexibleColumnLayout.js';
import '@ui5/webcomponents-fiori/dist/SideNavigation.js';
import '@ui5/webcomponents-fiori/dist/SideNavigationItem.js';
import '@ui5/webcomponents-fiori/dist/Timeline.js';
import '@ui5/webcomponents-fiori/dist/TimelineItem.js';
import '@ui5/webcomponents-fiori/dist/IllustratedMessage.js';
import '@ui5/webcomponents/dist/Label.js';
import '@ui5/webcomponents/dist/Title.js';

// ── Apply SAP Horizon Dark theme at module load ───────────────────────────────
setTheme('sap_horizon_dark');

// ── Sample data ───────────────────────────────────────────────────────────────
import { SAMPLE_TIMELINE } from './sample-timeline';

export type NavItem = 'Overview' | 'Tasks' | 'Timeline' | 'Team';

const NAV_ITEMS: { key: NavItem; icon: string }[] = [
  { key: 'Overview',  icon: 'home'             },
  { key: 'Tasks',     icon: 'task'             },
  { key: 'Timeline',  icon: 'history'          },
  { key: 'Team',      icon: 'group'            }
];

const ILLUSTRATION_MAP: Record<Exclude<NavItem, 'Timeline'>, string> = {
  Overview : 'TntDashboard',
  Tasks    : 'EmptyList',
  Team     : 'NoActivities'
};

@Component({
  selector: 'app-project-dashboard-page',
  standalone: true,
  imports: [CommonModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    /* ── Host shell ──────────────────────────────────────────── */
    :host {
      display: block;
      width: 100%;
      height: 100vh;
      background: var(--sapBackgroundColor, #1c1c1c);
      font-family: var(--sapFontFamily, '72', Arial, sans-serif);
    }

    /* ── Dynamic Page fills the viewport ────────────────────── */
    ui5-dynamic-page {
      height: 100%;
      width: 100%;
    }

    /* ── Header label/value pairs ────────────────────────────── */
    .header-grid {
      display: flex;
      gap: var(--sapContent_IconWidth, 2rem);
      flex-wrap: wrap;
      padding: var(--sapElement_Compact_Height, 0.5rem) 0;
    }
    .header-pair {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .header-label {
      font-size: var(--sapFontSmallSize, 0.75rem);
      color: var(--sapContent_LabelColor, #8c8c8c);
      font-family: var(--sapFontFamily);
    }
    .header-value {
      font-size: var(--sapFontSize, 0.875rem);
      color: var(--sapTextColor, #e5e5e5);
      font-weight: var(--sapContent_FontWeight, 600);
      font-family: var(--sapFontFamily);
    }
    .status-badge {
      display: inline-block;
      padding: 0.125rem 0.5rem;
      border-radius: var(--sapButton_BorderCornerRadius, 0.375rem);
      background: var(--sapIndicationColor_5_Background, #0d3f6c);
      color: var(--sapIndicationColor_5_TextColor, #7fc6f7);
      border: 1px solid var(--sapIndicationColor_5_BorderColor, #1a6ea8);
      font-size: var(--sapFontSmallSize, 0.75rem);
      font-family: var(--sapFontFamily);
    }

    /* ── Flexible column layout fills remaining height ───────── */
    ui5-flexible-column-layout {
      height: 100%;
      --_ui5_fcl_separator_display: none;
    }

    /* ── Column wrappers ─────────────────────────────────────── */
    .column-wrapper {
      height: 100%;
      overflow: auto;
      background: var(--sapBackgroundColor, #1c1c1c);
    }
    .start-column {
      border-right: 1px solid var(--sapGroup_ContentBorderColor, #3d3d3d);
      padding: var(--sapContent_IconWidth, 1rem) 0;
    }
    .mid-column {
      padding: var(--sapContent_IconWidth, 1.5rem);
    }

    /* ── Mid-column heading ──────────────────────────────────── */
    .mid-heading {
      margin: 0 0 1rem 0;
      font-size: var(--sapFontHeader3Size, 1.25rem);
      color: var(--sapTitleColor, #e5e5e5);
      font-family: var(--sapFontFamily);
      font-weight: 600;
      border-bottom: 2px solid var(--sapHighlightColor, #0070f2);
      padding-bottom: 0.5rem;
    }

    /* ── Illustrated message centering ──────────────────────── */
    .empty-state-wrapper {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 60%;
      min-height: 300px;
    }

    /* ── Timeline spacing ────────────────────────────────────── */
    ui5-timeline {
      --_ui5_tl_indicator_before_color: var(--sapHighlightColor, #0070f2);
    }
  `],
  template: `
    <ui5-dynamic-page show-header-content="true" background-design="Transparent">

      <!-- ══ Title slot ══════════════════════════════════════════════════════ -->
      <ui5-dynamic-page-title slot="titleArea">
        <ui5-title slot="heading" level="H3">Project Atlas Migration</ui5-title>
        <span slot="subheading"
              style="color: var(--sapContent_LabelColor, #8c8c8c);
                     font-size: var(--sapFontSmallSize, 0.75rem);
                     font-family: var(--sapFontFamily)">
          Q2 2026 deliverables
        </span>
      </ui5-dynamic-page-title>

      <!-- ══ Header slot ═════════════════════════════════════════════════════ -->
      <ui5-dynamic-page-header slot="headerArea">
        <div class="header-grid">
          <div class="header-pair">
            <span class="header-label">Owner</span>
            <span class="header-value">Jane Doe</span>
          </div>
          <div class="header-pair">
            <span class="header-label">Status</span>
            <span class="status-badge">In Progress</span>
          </div>
          <div class="header-pair">
            <span class="header-label">Due</span>
            <span class="header-value">2026-06-30</span>
          </div>
        </div>
      </ui5-dynamic-page-header>

      <!-- ══ Content slot ════════════════════════════════════════════════════ -->
      <ui5-flexible-column-layout
        slot="content"
        layout="TwoColumnsStartExpanded"
        style="height:100%">

        <!-- ── START column: Side Navigation ─────────────────────────────── -->
        <div slot="startColumn" class="column-wrapper start-column">
          <ui5-side-navigation
            collapsed="false"
            (selectionChange)="onNavSelect($event)">

            @for (item of navItems; track item.key) {
              <ui5-side-navigation-item
                [attr.text]="item.key"
                [attr.icon]="item.icon"
                [attr.selected]="activeItem() === item.key ? true : null">
              </ui5-side-navigation-item>
            }

          </ui5-side-navigation>
        </div>

        <!-- ── MID column: contextual content ────────────────────────────── -->
        <div slot="midColumn" class="column-wrapper mid-column">

          <h2 class="mid-heading">{{ activeItem() }}</h2>

          <!-- Timeline view -->
          @if (activeItem() === 'Timeline') {
            <ui5-timeline layout="Vertical">
              @for (entry of timelineEntries; track entry.title) {
                <ui5-timeline-item
                  [attr.title-text]="entry.title"
                  [attr.subtitle-text]="entry.subtitle"
                  [attr.icon]="entry.icon"
                  [attr.timestamp]="entry.timestamp">
                </ui5-timeline-item>
              }
            </ui5-timeline>
          }

          <!-- Empty-state / illustrated message for other items -->
          @if (activeItem() !== 'Timeline') {
            <div class="empty-state-wrapper">
              <ui5-illustrated-message
                [attr.name]="illustrationName()"
                [attr.title-text]="activeItem() + ' — Coming Soon'"
                subtitle-text="This section is under construction. Check back later.">
              </ui5-illustrated-message>
            </div>
          }

        </div>
      </ui5-flexible-column-layout>
    </ui5-dynamic-page>
  `
})
export class ProjectDashboardPageComponent implements OnInit {

  readonly navItems = NAV_ITEMS;
  readonly timelineEntries = SAMPLE_TIMELINE;

  /** Currently active navigation item */
  readonly activeItem = signal<NavItem>('Overview');

  ngOnInit(): void {
    // Theme is already set at module load via setTheme() above.
    // Any additional runtime init can go here.
  }

  onNavSelect(event: Event): void {
    const customEvent = event as CustomEvent;
    const selectedText = customEvent.detail?.item?.text as NavItem | undefined;
    if (selectedText && NAV_ITEMS.some(n => n.key === selectedText)) {
      this.activeItem.set(selectedText);
    }
  }

  illustrationName(): string {
    const key = this.activeItem() as Exclude<NavItem, 'Timeline'>;
    return ILLUSTRATION_MAP[key] ?? 'TntDashboard';
  }
}
