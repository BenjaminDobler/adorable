import { setTheme } from '@ui5/webcomponents-base/dist/config/Theme.js';

// Set Horizon Dark theme at module load time
setTheme('sap_horizon_dark');

import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  Ui5WebcomponentsFioriModule,
} from '@ui5/webcomponents-ngx/fiori';
import { Ui5WebcomponentsMainModule } from '@ui5/webcomponents-ngx/main';
import { SAMPLE_TIMELINE_ENTRIES } from './sample-timeline';

export type NavItem = 'Overview' | 'Tasks' | 'Timeline' | 'Team';

const NAV_ITEMS: { text: NavItem; icon: string }[] = [
  { text: 'Overview', icon: 'home' },
  { text: 'Tasks',    icon: 'task' },
  { text: 'Timeline', icon: 'timeline' },
  { text: 'Team',     icon: 'group' },
];

const ILLUSTRATION_MAP: Record<Exclude<NavItem, 'Timeline'>, { name: string; title: string; subtitle: string }> = {
  Overview: {
    name: 'TntMission',
    title: 'No Summary Yet',
    subtitle: 'Project overview metrics will appear here once data is collected.',
  },
  Tasks: {
    name: 'NoTasks',
    title: 'No Tasks Found',
    subtitle: 'There are currently no tasks assigned to this project.',
  },
  Team: {
    name: 'NoData',
    title: 'No Team Members',
    subtitle: 'Team roster information will be displayed here.',
  },
};

@Component({
  selector: 'app-project-dashboard-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    Ui5WebcomponentsFioriModule,
    Ui5WebcomponentsMainModule,
  ],
  styles: [
    `
      :host {
        display: block;
        height: 100vh;
        background-color: var(--sapBackgroundColor);
        font-family: var(--sapFontFamily, '72', sans-serif);
      }

      ui5-dynamic-page {
        height: 100vh;
      }

      /* ── FCL fills the page content area ── */
      .fcl-wrapper {
        height: 100%;
        display: flex;
        flex-direction: column;
      }

      ui5-flexible-column-layout {
        flex: 1;
        height: 100%;
      }

      /* ── Dynamic page header label/value pairs ── */
      .header-grid {
        display: flex;
        gap: 2.5rem;
        align-items: flex-start;
        padding: 0.5rem 0;
      }

      .header-item {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
      }

      .header-label {
        font-size: var(--sapFontSmallSize, 0.75rem);
        color: var(--sapContent_LabelColor);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .header-value {
        font-size: var(--sapFontSize, 0.875rem);
        color: var(--sapTextColor);
        font-weight: 400;
      }

      .status-badge {
        display: inline-flex;
        align-items: center;
        padding: 0.15rem 0.6rem;
        border-radius: 0.75rem;
        font-size: var(--sapFontSmallSize, 0.75rem);
        font-weight: 600;
        background-color: var(--sapIndicationColor_5b);
        color: var(--sapIndicationColor_5_TextColor);
        border: 1px solid var(--sapIndicationColor_5BorderColor);
      }

      /* ── Side navigation column ── */
      .start-col {
        height: 100%;
        background-color: var(--sapGroup_ContentBackground);
        border-right: 1px solid var(--sapGroup_ContentBorderColor);
        box-sizing: border-box;
        overflow: hidden;
      }

      .start-col-heading {
        padding: 1rem 1rem 0.5rem;
        font-size: var(--sapFontSmallSize, 0.75rem);
        font-weight: 700;
        color: var(--sapContent_LabelColor);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        border-bottom: 1px solid var(--sapGroup_ContentBorderColor);
        margin-bottom: 0.25rem;
      }

      ui5-side-navigation {
        height: calc(100% - 2.5rem);
      }

      /* ── Mid column content ── */
      .mid-col {
        height: 100%;
        background-color: var(--sapBackgroundColor);
        box-sizing: border-box;
        overflow-y: auto;
        padding: 1.5rem;
      }

      .mid-col-title {
        font-size: var(--sapFontHeader4Size, 1.125rem);
        font-weight: 700;
        color: var(--sapTextColor);
        margin: 0 0 1.25rem 0;
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }

      .mid-col-title::after {
        content: '';
        flex: 1;
        height: 1px;
        background: var(--sapGroup_ContentBorderColor);
      }

      /* Timeline section */
      .timeline-wrapper {
        background-color: var(--sapGroup_ContentBackground);
        border: 1px solid var(--sapGroup_ContentBorderColor);
        border-radius: var(--sapElement_BorderCornerRadius, 0.5rem);
        padding: 1.25rem 1rem;
      }

      ui5-timeline {
        width: 100%;
      }

      /* Illustrated message wrapper */
      .illustration-wrapper {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-height: 24rem;
        background-color: var(--sapGroup_ContentBackground);
        border: 1px solid var(--sapGroup_ContentBorderColor);
        border-radius: var(--sapElement_BorderCornerRadius, 0.5rem);
      }
    `,
  ],
  template: `
    <ui5-dynamic-page>
      <!-- ── Title area ── -->
      <ui5-dynamic-page-title slot="titleArea">
        <ui5-title slot="heading" level="H3">Project Atlas Migration</ui5-title>
        <ui5-label slot="subheading">Q2 2026 deliverables</ui5-label>
      </ui5-dynamic-page-title>

      <!-- ── Header area ── -->
      <ui5-dynamic-page-header slot="headerArea">
        <div class="header-grid">
          <div class="header-item">
            <span class="header-label">Owner</span>
            <span class="header-value">Jane Doe</span>
          </div>
          <div class="header-item">
            <span class="header-label">Status</span>
            <span class="status-badge">In Progress</span>
          </div>
          <div class="header-item">
            <span class="header-label">Due</span>
            <span class="header-value">2026-06-30</span>
          </div>
        </div>
      </ui5-dynamic-page-header>

      <!-- ── Page content: Flexible Column Layout ── -->
      <div class="fcl-wrapper">
        <ui5-flexible-column-layout layout="TwoColumnsMidExpanded">

          <!-- START: side navigation -->
          <div slot="startColumn" class="start-col">
            <div class="start-col-heading">Navigation</div>
            <ui5-side-navigation
              accessible-name="Project navigation"
              (selection-change)="onNavSelect($event)">
              @for (item of navItems; track item.text) {
                <ui5-side-navigation-item
                  [attr.text]="item.text"
                  [attr.icon]="item.icon"
                  [attr.selected]="item.text === activeNav() ? true : null">
                </ui5-side-navigation-item>
              }
            </ui5-side-navigation>
          </div>

          <!-- MID: content panel -->
          <div slot="midColumn" class="mid-col">
            <h2 class="mid-col-title">
              <ui5-icon [attr.name]="activeNavMeta().icon"></ui5-icon>
              {{ activeNav() }}
            </h2>

            <!-- Timeline view -->
            @if (activeNav() === 'Timeline') {
              <div class="timeline-wrapper">
                <ui5-timeline accessible-name="Project timeline">
                  @for (entry of timelineEntries; track entry.titleText) {
                    <ui5-timeline-item
                      [attr.title-text]="entry.titleText"
                      [attr.subtitle-text]="entry.subtitleText"
                      [attr.icon]="entry.icon"
                      [attr.name]="entry.name">
                    </ui5-timeline-item>
                  }
                </ui5-timeline>
              </div>
            }

            <!-- Empty state for other views -->
            @if (activeNav() !== 'Timeline') {
              <div class="illustration-wrapper">
                <ui5-illustrated-message
                  [attr.name]="illustrationConfig().name"
                  [attr.title-text]="illustrationConfig().title"
                  [attr.subtitle-text]="illustrationConfig().subtitle">
                </ui5-illustrated-message>
              </div>
            }
          </div>

        </ui5-flexible-column-layout>
      </div>
    </ui5-dynamic-page>
  `,
})
export class ProjectDashboardPageComponent {
  readonly navItems = NAV_ITEMS;
  readonly timelineEntries = SAMPLE_TIMELINE_ENTRIES;

  readonly activeNav = signal<NavItem>('Overview');

  readonly activeNavMeta = computed(
    () => NAV_ITEMS.find((n) => n.text === this.activeNav())!
  );

  readonly illustrationConfig = computed(() => {
    const nav = this.activeNav();
    return nav !== 'Timeline'
      ? ILLUSTRATION_MAP[nav as Exclude<NavItem, 'Timeline'>]
      : ILLUSTRATION_MAP['Overview'];
  });

  onNavSelect(event: CustomEvent): void {
    const item = event.detail?.item;
    const text = item?.text as NavItem | undefined;
    if (text && NAV_ITEMS.some((n) => n.text === text)) {
      this.activeNav.set(text);
    }
  }
}
