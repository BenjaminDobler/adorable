import {
  Component,
  OnInit,
  signal,
  ChangeDetectionStrategy,
  CUSTOM_ELEMENTS_SCHEMA,
} from '@angular/core';
import { CommonModule } from '@angular/common';

// ── UI5 Web Components ───────────────────────────────────────────────────────
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

// ── Apply Horizon Dark theme at module load ───────────────────────────────────
setTheme('sap_horizon_dark');

// ── Sample data ───────────────────────────────────────────────────────────────
import { SAMPLE_TIMELINE, TimelineEntry } from './sample-timeline';

export type NavItem = 'Overview' | 'Tasks' | 'Timeline' | 'Team';

const NAV_ILLUSTRATIONS: Record<Exclude<NavItem, 'Timeline'>, string> = {
  Overview: 'NoData',
  Tasks: 'NoTasks',
  Team: 'NoSearchResults',
};

@Component({
  selector: 'app-project-dashboard-page',
  standalone: true,
  imports: [CommonModule],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host {
        display: block;
        height: 100vh;
        background-color: var(--sapBackgroundColor);
        font-family: var(--sapFontFamily);
        color: var(--sapTextColor);
      }

      /* ── Dynamic Page fills the host ─────────────────────────────────── */
      ui5-dynamic-page {
        height: 100%;
        --_ui5_dynamic_page_title_area_background: var(--sapObjectHeader_Background);
      }

      /* ── Page header pairs ───────────────────────────────────────────── */
      .header-grid {
        display: flex;
        gap: var(--sapContent_GridGutter, 1.5rem);
        flex-wrap: wrap;
        padding: var(--sapContent_GridGutter, 1rem) 0;
      }

      .header-pair {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        min-width: 10rem;
      }

      .header-pair ui5-label {
        font-size: var(--sapFontSmallSize);
        color: var(--sapContent_LabelColor);
        font-weight: 600;
        letter-spacing: 0.02em;
        text-transform: uppercase;
      }

      .header-pair .value {
        font-size: var(--sapFontSize);
        color: var(--sapTextColor);
        font-weight: 500;
      }

      /* ── FCL fills remaining height ──────────────────────────────────── */
      .fcl-wrapper {
        display: flex;
        height: 100%;
        overflow: hidden;
      }

      ui5-flexible-column-layout {
        flex: 1;
        height: 100%;
        --_ui5_fcl_separator_color: var(--sapObjectHeader_BorderColor, var(--sapGroup_TitleBorderColor));
      }

      /* ── Start column – Side Navigation ─────────────────────────────── */
      .start-col {
        height: 100%;
        display: flex;
        flex-direction: column;
        background: var(--sapGroup_ContentBackground);
        border-right: 1px solid var(--sapGroup_TitleBorderColor);
        overflow: hidden;
      }

      .start-col-header {
        padding: 1rem 1.25rem 0.75rem;
        font-size: var(--sapFontSmallSize);
        color: var(--sapContent_LabelColor);
        font-weight: 700;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        border-bottom: 1px solid var(--sapGroup_TitleBorderColor);
        flex-shrink: 0;
      }

      ui5-side-navigation {
        flex: 1;
        overflow-y: auto;
        --_ui5_sn_item_active_bg: var(--sapContent_Selected_Background);
      }

      /* ── Mid column ──────────────────────────────────────────────────── */
      .mid-col {
        height: 100%;
        overflow-y: auto;
        background: var(--sapBackgroundColor);
        padding: 1.5rem;
        box-sizing: border-box;
      }

      .mid-col-title {
        font-size: var(--sapFontHeader3Size);
        color: var(--sapTextColor);
        font-weight: 700;
        margin: 0 0 1.5rem;
        padding-bottom: 0.75rem;
        border-bottom: 2px solid var(--sapAccentColor6, var(--sapHighlightColor));
      }

      /* ── Timeline ────────────────────────────────────────────────────── */
      .timeline-wrapper {
        padding: 0.5rem 0;
      }

      ui5-timeline {
        --_ui5_timeline_connector_border_color: var(--sapAccentColor6, var(--sapHighlightColor));
      }

      /* ── Illustrated Message empty state ─────────────────────────────── */
      .empty-state-wrapper {
        display: flex;
        justify-content: center;
        align-items: center;
        height: calc(100% - 4rem);
        min-height: 22rem;
      }

      ui5-illustrated-message {
        --_ui5_illustrated_message_title_color: var(--sapTextColor);
        --_ui5_illustrated_message_subtitle_color: var(--sapContent_LabelColor);
      }
    `,
  ],
  template: `
    <ui5-dynamic-page show-header-content>
      <!-- ── Title ─────────────────────────────────────────────────────── -->
      <ui5-dynamic-page-title slot="titleArea">
        <ui5-title slot="heading" level="H3">Project Atlas Migration</ui5-title>
        <span slot="subheading" style="color: var(--sapContent_LabelColor); font-size: var(--sapFontSize)">
          Q2 2026 deliverables
        </span>
      </ui5-dynamic-page-title>

      <!-- ── Header ────────────────────────────────────────────────────── -->
      <ui5-dynamic-page-header slot="headerArea">
        <div class="header-grid">
          <div class="header-pair">
            <ui5-label>Owner</ui5-label>
            <span class="value">Jane Doe</span>
          </div>
          <div class="header-pair">
            <ui5-label>Status</ui5-label>
            <span class="value" style="color: var(--sapPositiveColor);">In Progress</span>
          </div>
          <div class="header-pair">
            <ui5-label>Due</ui5-label>
            <span class="value">2026-06-30</span>
          </div>
        </div>
      </ui5-dynamic-page-header>

      <!-- ── Page Content ──────────────────────────────────────────────── -->
      <div class="fcl-wrapper" slot="content">
        <ui5-flexible-column-layout [attr.layout]="fclLayout">

          <!-- ── START: Side Navigation ────────────────────────────────── -->
          <div slot="startColumn" class="start-col">
            <div class="start-col-header">Navigation</div>
            <ui5-side-navigation
              (selection-change)="onNavSelect($event)"
            >
              @for (item of navItems; track item) {
                <ui5-side-navigation-item
                  [attr.text]="item"
                  [attr.icon]="navIcons[item]"
                  [attr.selected]="selectedNav() === item ? true : null"
                ></ui5-side-navigation-item>
              }
            </ui5-side-navigation>
          </div>

          <!-- ── MID: Dynamic Content ───────────────────────────────────── -->
          <div slot="midColumn" class="mid-col">
            <h2 class="mid-col-title">{{ selectedNav() }}</h2>

            @if (selectedNav() === 'Timeline') {
              <div class="timeline-wrapper">
                <ui5-timeline layout="Vertical">
                  @for (entry of timelineEntries; track entry.title) {
                    <ui5-timeline-item
                      [attr.title-text]="entry.title"
                      [attr.subtitle-text]="entry.subtitle"
                      [attr.icon]="entry.icon"
                      [attr.name]="entry.timestamp"
                    ></ui5-timeline-item>
                  }
                </ui5-timeline>
              </div>
            } @else {
              <div class="empty-state-wrapper">
                <ui5-illustrated-message
                  [attr.name]="illustrationFor(selectedNav())"
                  [attr.title-text]="selectedNav() + ' — coming soon'"
                  subtitle-text="This section is under construction. Check back later."
                ></ui5-illustrated-message>
              </div>
            }
          </div>

        </ui5-flexible-column-layout>
      </div>
    </ui5-dynamic-page>
  `,
})
export class ProjectDashboardPageComponent implements OnInit {
  // ── Nav config ────────────────────────────────────────────────────────────
  readonly navItems: NavItem[] = ['Overview', 'Tasks', 'Timeline', 'Team'];

  readonly navIcons: Record<NavItem, string> = {
    Overview: 'home',
    Tasks: 'task',
    Timeline: 'timeline',
    Team: 'group',
  };

  // ── Reactive state ────────────────────────────────────────────────────────
  selectedNav = signal<NavItem>('Overview');

  /** FCL layout: StartColumnFull for no-mid, TwoColumnsMidExpanded otherwise */
  get fclLayout(): string {
    return 'TwoColumnsMidExpanded';
  }

  // ── Timeline data ─────────────────────────────────────────────────────────
  readonly timelineEntries: TimelineEntry[] = SAMPLE_TIMELINE;

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit(): void {
    // Theme is set at module load via setTheme(); nothing extra needed here.
  }

  // ── Handlers ──────────────────────────────────────────────────────────────
  onNavSelect(event: Event): void {
    const customEvent = event as CustomEvent;
    const selectedItem = customEvent.detail?.item;
    if (selectedItem) {
      const text = selectedItem.getAttribute('text') as NavItem;
      if (text && this.navItems.includes(text)) {
        this.selectedNav.set(text);
      }
    }
  }

  illustrationFor(nav: NavItem): string {
    return NAV_ILLUSTRATIONS[nav as Exclude<NavItem, 'Timeline'>] ?? 'NoData';
  }
}
