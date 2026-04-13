import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { setTheme } from '@ui5/webcomponents-base/dist/config/Theme.js';

// ── Angular wrappers ── main ──────────────────────────────────────────────────
import { LabelComponent } from '@ui5/webcomponents-ngx/main';
import { TitleComponent } from '@ui5/webcomponents-ngx/main';

// ── Angular wrappers ── fiori ─────────────────────────────────────────────────
import {
  DynamicPageComponent,
  DynamicPageTitleComponent,
  DynamicPageHeaderComponent,
  FlexibleColumnLayoutComponent,
  SideNavigationComponent,
  SideNavigationItemComponent,
  TimelineComponent,
  TimelineItemComponent,
  IllustratedMessageComponent,
} from '@ui5/webcomponents-ngx/fiori';

import { TIMELINE_ENTRIES } from './sample-timeline';

// ── Theme ─────────────────────────────────────────────────────────────────────
setTheme('sap_horizon_dark');

// ── Nav item config ───────────────────────────────────────────────────────────
type NavItem = 'Overview' | 'Tasks' | 'Timeline' | 'Team';

interface NavConfig {
  key: NavItem;
  icon: string;
  illustration: string;
  illustrationTitle: string;
  illustrationSubtitle: string;
}

const NAV_ITEMS: NavConfig[] = [
  {
    key: 'Overview',
    icon: 'home',
    illustration: 'BeforeSearch',
    illustrationTitle: 'Project Overview',
    illustrationSubtitle: 'High-level project summary will appear here.',
  },
  {
    key: 'Tasks',
    icon: 'task',
    illustration: 'NoTasks',
    illustrationTitle: 'No Tasks Yet',
    illustrationSubtitle: 'Task list will be loaded here once available.',
  },
  {
    key: 'Timeline',
    icon: 'time-entry-request',
    illustration: '',          // Not used — we render the real timeline
    illustrationTitle: '',
    illustrationSubtitle: '',
  },
  {
    key: 'Team',
    icon: 'group',
    illustration: 'NoData',
    illustrationTitle: 'Team View',
    illustrationSubtitle: 'Team member details will be displayed here.',
  },
];

@Component({
  selector: 'app-project-dashboard-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LabelComponent,
    TitleComponent,
    DynamicPageComponent,
    DynamicPageTitleComponent,
    DynamicPageHeaderComponent,
    FlexibleColumnLayoutComponent,
    SideNavigationComponent,
    SideNavigationItemComponent,
    TimelineComponent,
    TimelineItemComponent,
    IllustratedMessageComponent,
  ],
  styles: [
    `
      :host {
        display: block;
        height: 100vh;
        background: var(--sapBackgroundColor);
      }

      /* ── Dynamic Page fill ─────────────────────────────────────── */
      .page-root {
        height: 100%;
      }

      /* ── Header info bar ───────────────────────────────────────── */
      .header-info {
        display: flex;
        gap: 2rem;
        padding: 0.75rem 1.5rem;
        flex-wrap: wrap;
        align-items: center;
      }

      .header-pair {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      .header-pair ui5-label {
        font-size: var(--sapFontSmallSize);
        color: var(--sapContent_LabelColor);
      }

      .header-value {
        font-size: var(--sapFontSize);
        font-weight: 600;
        color: var(--sapTextColor);
      }

      .status-badge {
        display: inline-block;
        padding: 0.125rem 0.625rem;
        border-radius: 0.75rem;
        background: var(--sapInformativeColor);
        color: var(--sapButton_Information_TextColor, #fff);
        font-size: var(--sapFontSmallSize);
        font-weight: 600;
      }

      /* ── FCL fill ──────────────────────────────────────────────── */
      .fcl {
        height: 100%;
      }

      /* ── Side-nav column ───────────────────────────────────────── */
      .start-col {
        height: 100%;
        background: var(--sapGroup_ContentBackground);
        border-right: 1px solid var(--sapGroup_TitleBorderColor);
      }

      /* ── Mid column ────────────────────────────────────────────── */
      .mid-col {
        height: 100%;
        display: flex;
        flex-direction: column;
        overflow-y: auto;
        background: var(--sapBackgroundColor);
      }

      .mid-heading {
        padding: 1.25rem 1.5rem 0.5rem;
        border-bottom: 1px solid var(--sapGroup_TitleBorderColor);
        margin-bottom: 1rem;
      }

      /* ── Timeline column ────────────────────────────────────────── */
      .timeline-wrap {
        padding: 0 1.5rem 2rem;
        flex: 1;
      }

      /* ── Illustrated message ────────────────────────────────────── */
      .illustration-wrap {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
      }
    `,
  ],
  template: `
    <ui5-dynamic-page class="page-root" [hidePinButton]="false">

      <!-- ── Title slot ──────────────────────────────────────────────── -->
      <ui5-dynamic-page-title slot="titleArea">
        <ui5-title slot="heading" [level]="'H2'" [size]="'H2'">
          Project Atlas Migration
        </ui5-title>
        <span slot="subheading" style="color: var(--sapContent_LabelColor); font-size: var(--sapFontSize)">
          Q2 2026 deliverables
        </span>
      </ui5-dynamic-page-title>

      <!-- ── Header slot ─────────────────────────────────────────────── -->
      <ui5-dynamic-page-header slot="headerArea">
        <div class="header-info">

          <div class="header-pair">
            <ui5-label [showColon]="true">Owner</ui5-label>
            <span class="header-value">Jane Doe</span>
          </div>

          <div class="header-pair">
            <ui5-label [showColon]="true">Status</ui5-label>
            <span class="header-value">
              <span class="status-badge">In Progress</span>
            </span>
          </div>

          <div class="header-pair">
            <ui5-label [showColon]="true">Due</ui5-label>
            <span class="header-value">2026-06-30</span>
          </div>

        </div>
      </ui5-dynamic-page-header>

      <!-- ── Page content ────────────────────────────────────────────── -->
      <ui5-flexible-column-layout
        class="fcl"
        [layout]="'TwoColumnsMidExpanded'"
      >

        <!-- START column: side navigation -->
        <div slot="startColumn" class="start-col">
          <ui5-side-navigation
            (ui5SelectionChange)="onNavSelect($event)"
          >
            @for (item of navItems; track item.key) {
              <ui5-side-navigation-item
                [text]="item.key"
                [icon]="item.icon"
                [selected]="activeNav() === item.key"
              />
            }
          </ui5-side-navigation>
        </div>

        <!-- MID column: contextual content -->
        <div slot="midColumn" class="mid-col">

          <div class="mid-heading">
            <ui5-title [level]="'H3'" [size]="'H3'">{{ activeNav() }}</ui5-title>
          </div>

          @if (activeNav() === 'Timeline') {
            <!-- ── Timeline view ─────────────────────────────────── -->
            <div class="timeline-wrap">
              <ui5-timeline [layout]="'Vertical'">
                @for (entry of timelineEntries; track entry.titleText) {
                  <ui5-timeline-item
                    [titleText]="entry.titleText"
                    [subtitleText]="entry.timestamp"
                    [icon]="entry.icon"
                    [name]="entry.name"
                  >
                    {{ entry.subtitleText }}
                  </ui5-timeline-item>
                }
              </ui5-timeline>
            </div>
          } @else {
            <!-- ── Illustrated empty state ───────────────────────── -->
            <div class="illustration-wrap">
              @let cfg = activeNavConfig();
              @if (cfg) {
                <ui5-illustrated-message
                  [name]="cfg.illustration"
                  [titleText]="cfg.illustrationTitle"
                  [subtitleText]="cfg.illustrationSubtitle"
                />
              }
            </div>
          }

        </div>

      </ui5-flexible-column-layout>

    </ui5-dynamic-page>
  `,
})
export class ProjectDashboardPageComponent {
  readonly navItems = NAV_ITEMS;
  readonly timelineEntries = TIMELINE_ENTRIES;

  readonly activeNav = signal<NavItem>('Overview');

  activeNavConfig = () =>
    NAV_ITEMS.find((n) => n.key === this.activeNav()) ?? null;

  onNavSelect(event: CustomEvent): void {
    const selectedItem = event.detail?.item;
    const text: NavItem = selectedItem?.text as NavItem;
    if (text) {
      this.activeNav.set(text);
    }
  }
}
