import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { setTheme } from '@ui5/webcomponents-base/dist/config/Theme.js';

// Fiori components
import { DynamicPageComponent }       from '@ui5/webcomponents-ngx/fiori';
import { DynamicPageTitleComponent }  from '@ui5/webcomponents-ngx/fiori';
import { DynamicPageHeaderComponent } from '@ui5/webcomponents-ngx/fiori';
import { FlexibleColumnLayoutComponent } from '@ui5/webcomponents-ngx/fiori';
import { SideNavigationComponent }    from '@ui5/webcomponents-ngx/fiori';
import { SideNavigationItemComponent } from '@ui5/webcomponents-ngx/fiori';
import { TimelineComponent }          from '@ui5/webcomponents-ngx/fiori';
import { TimelineItemComponent }      from '@ui5/webcomponents-ngx/fiori';
import { IllustratedMessageComponent } from '@ui5/webcomponents-ngx/fiori';

// Main components
import { TitleComponent } from '@ui5/webcomponents-ngx/main';
import { LabelComponent } from '@ui5/webcomponents-ngx/main';

import { SAMPLE_TIMELINE } from './sample-timeline';

// Set Horizon Dark theme once at module load
setTheme('sap_horizon_dark');

type NavItem = 'Overview' | 'Tasks' | 'Timeline' | 'Team';

const NAV_ITEMS: { text: NavItem; icon: string }[] = [
  { text: 'Overview',  icon: 'home'         },
  { text: 'Tasks',     icon: 'task'          },
  { text: 'Timeline',  icon: 'appointment'   },
  { text: 'Team',      icon: 'group'         },
];

const ILLUSTRATIONS: Record<Exclude<NavItem, 'Timeline'>, { name: string; title: string; subtitle: string }> = {
  Overview: {
    name: 'tnt/DataLoading',
    title: 'Project Overview',
    subtitle: 'High-level metrics and KPIs will appear here once data is loaded.',
  },
  Tasks: {
    name: 'tnt/EmptyList',
    title: 'No Tasks Yet',
    subtitle: 'Create your first task to start tracking project progress.',
  },
  Team: {
    name: 'tnt/Team',
    title: 'Team Members',
    subtitle: 'Invite team members to collaborate on Project Atlas Migration.',
  },
};

@Component({
  selector: 'app-project-dashboard-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DynamicPageComponent,
    DynamicPageTitleComponent,
    DynamicPageHeaderComponent,
    FlexibleColumnLayoutComponent,
    SideNavigationComponent,
    SideNavigationItemComponent,
    TimelineComponent,
    TimelineItemComponent,
    IllustratedMessageComponent,
    TitleComponent,
    LabelComponent,
  ],
  styles: [`
    :host {
      display: block;
      height: 100vh;
      background-color: var(--sapBackgroundColor);
    }

    ui5-dynamic-page {
      height: 100%;
    }

    .dp-heading {
      display: flex;
      flex-direction: column;
      gap: .25rem;
    }

    .dp-subheading {
      color: var(--sapContent_LabelColor);
      font-size: var(--sapFontSmallSize, .75rem);
      margin: 0;
    }

    .header-pairs {
      display: flex;
      flex-wrap: wrap;
      gap: 2rem;
      padding: .75rem 1rem;
    }

    .header-pair {
      display: flex;
      flex-direction: column;
      gap: .25rem;
    }

    .header-pair ui5-label {
      color: var(--sapContent_LabelColor);
      font-size: var(--sapFontSmallSize, .75rem);
    }

    .header-value {
      color: var(--sapTextColor, var(--sapContent_ForegroundTextColor));
      font-size: var(--sapFontSize, .875rem);
      font-weight: 600;
    }

    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: .375rem;
      padding: .125rem .5rem;
      border-radius: .75rem;
      background: var(--sapInformativeColor, #0064d9);
      color: #fff;
      font-size: var(--sapFontSmallSize, .75rem);
      font-weight: 600;
    }

    .status-dot {
      width: .5rem;
      height: .5rem;
      border-radius: 50%;
      background: #fff;
      opacity: .85;
    }

    /* FCL fills the page content area */
    .fcl-wrapper {
      display: flex;
      height: 100%;
      overflow: hidden;
    }

    ui5-flexible-column-layout {
      flex: 1;
      height: 100%;
      --ui5-fcl-column-border: 1px solid var(--sapContent_ForegroundBorderColor);
    }

    /* Side navigation column */
    .side-nav-wrapper {
      height: 100%;
      background: var(--sapGroup_ContentBackground, var(--sapBackgroundColor));
      border-right: 1px solid var(--sapContent_ForegroundBorderColor);
      overflow-y: auto;
    }

    /* Mid column */
    .mid-col-wrapper {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: var(--sapBackgroundColor);
      overflow-y: auto;
    }

    .mid-col-header {
      display: flex;
      align-items: center;
      padding: 1rem 1.5rem .75rem;
      border-bottom: 1px solid var(--sapContent_ForegroundBorderColor);
      background: var(--sapGroup_ContentBackground, var(--sapBackgroundColor));
    }

    .mid-col-header ui5-title {
      flex: 1;
    }

    .mid-col-body {
      flex: 1;
      padding: 1.5rem;
      overflow-y: auto;
    }

    ui5-timeline {
      width: 100%;
    }

    ui5-illustrated-message {
      margin-top: 2rem;
    }
  `],
  template: `
    <ui5-dynamic-page>

      <!-- ═══ TITLE AREA ═══ -->
      <ui5-dynamic-page-title slot="titleArea">
        <div slot="heading" class="dp-heading">
          <ui5-title [level]="'H2'" [size]="'H2'">Project Atlas Migration</ui5-title>
          <p class="dp-subheading">Q2 2026 deliverables</p>
        </div>
      </ui5-dynamic-page-title>

      <!-- ═══ HEADER AREA ═══ -->
      <ui5-dynamic-page-header slot="headerArea">
        <div class="header-pairs">

          <div class="header-pair">
            <ui5-label [showColon]="true">Owner</ui5-label>
            <span class="header-value">Jane Doe</span>
          </div>

          <div class="header-pair">
            <ui5-label [showColon]="true">Status</ui5-label>
            <span class="status-badge">
              <span class="status-dot"></span>
              In Progress
            </span>
          </div>

          <div class="header-pair">
            <ui5-label [showColon]="true">Due</ui5-label>
            <span class="header-value">2026-06-30</span>
          </div>

        </div>
      </ui5-dynamic-page-header>

      <!-- ═══ PAGE CONTENT ═══ -->
      <div class="fcl-wrapper">
        <ui5-flexible-column-layout [layout]="'TwoColumnsMidExpanded'">

          <!-- START: Side Navigation -->
          <div slot="startColumn" class="side-nav-wrapper">
            <ui5-side-navigation
              (ui5SelectionChange)="onNavSelect($event)">
              @for (item of navItems; track item.text) {
                <ui5-side-navigation-item
                  [text]="item.text"
                  [icon]="item.icon"
                  [selected]="activeNav() === item.text">
                </ui5-side-navigation-item>
              }
            </ui5-side-navigation>
          </div>

          <!-- MID: Content panel -->
          <div slot="midColumn" class="mid-col-wrapper">

            <div class="mid-col-header">
              <ui5-title [level]="'H3'" [size]="'H4'">{{ activeNav() }}</ui5-title>
            </div>

            <div class="mid-col-body">

              @if (activeNav() === 'Timeline') {
                <ui5-timeline>
                  @for (entry of timelineEntries; track entry.titleText) {
                    <ui5-timeline-item
                      [titleText]="entry.titleText"
                      [subtitleText]="entry.subtitleText"
                      [icon]="entry.icon"
                      [name]="entry.name">
                    </ui5-timeline-item>
                  }
                </ui5-timeline>
              } @else {
                <ui5-illustrated-message
                  [name]="illustration().name"
                  [titleText]="illustration().title"
                  [subtitleText]="illustration().subtitle">
                </ui5-illustrated-message>
              }

            </div>
          </div>

        </ui5-flexible-column-layout>
      </div>

    </ui5-dynamic-page>
  `,
})
export class ProjectDashboardPageComponent {
  readonly navItems = NAV_ITEMS;
  readonly timelineEntries = SAMPLE_TIMELINE;

  activeNav = signal<NavItem>('Overview');

  illustration() {
    const key = this.activeNav() as Exclude<NavItem, 'Timeline'>;
    return ILLUSTRATIONS[key];
  }

  onNavSelect(event: CustomEvent): void {
    const item = event.detail?.item;
    if (item?.text) {
      this.activeNav.set(item.text as NavItem);
    }
  }
}
