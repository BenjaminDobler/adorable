import { setTheme } from '@ui5/webcomponents-base/dist/config/Theme.js';
setTheme('sap_horizon_dark');

import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
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
import { TitleComponent, LabelComponent } from '@ui5/webcomponents-ngx/main';

import { SAMPLE_TIMELINE } from './sample-timeline';

export type NavItem = 'Overview' | 'Tasks' | 'Timeline' | 'Team';

const NAV_ITEMS: { text: NavItem; icon: string }[] = [
  { text: 'Overview', icon: 'home' },
  { text: 'Tasks',    icon: 'task' },
  { text: 'Timeline', icon: 'timeline' },
  { text: 'Team',     icon: 'group' },
];

const ILLUSTRATION_MAP: Record<Exclude<NavItem, 'Timeline'>, string> = {
  Overview: 'NoData',
  Tasks:    'NoTasks',
  Team:     'NoSearchResults',
};

const ILLUSTRATION_TITLE_MAP: Record<Exclude<NavItem, 'Timeline'>, string> = {
  Overview: 'No overview data yet',
  Tasks:    'No tasks assigned',
  Team:     'No team members found',
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

    /* ── Dynamic Page Title heading / subheading ── */
    .dp-heading {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    /* ── Header info strip ── */
    .header-strip {
      display: flex;
      gap: 2.5rem;
      padding: 0.75rem 1rem;
      align-items: flex-start;
    }

    .header-pair {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .header-value {
      font-family: var(--sapFontFamily, '72', sans-serif);
      font-size: var(--sapFontSize, 0.875rem);
      color: var(--sapTextColor);
      font-weight: 600;
    }

    /* ── FCL fills remaining height ── */
    .fcl-wrapper {
      height: 100%;
      box-sizing: border-box;
    }

    ui5-flexible-column-layout {
      height: 100%;
    }

    /* ── Start column — side nav ── */
    .start-col {
      height: 100%;
      box-sizing: border-box;
      border-right: 1px solid var(--sapGroup_ContentBorderColor, var(--sapNeutralBorderColor));
      background-color: var(--sapList_Background);
    }

    ui5-side-navigation {
      height: 100%;
    }

    /* ── Mid column ── */
    .mid-col {
      height: 100%;
      box-sizing: border-box;
      padding: 1.5rem;
      background-color: var(--sapBackgroundColor);
      overflow-y: auto;
    }

    .mid-col-title {
      margin-bottom: 1.25rem;
    }

    /* ── Timeline ── */
    ui5-timeline {
      width: 100%;
    }

    /* ── Illustrated message centering ── */
    ui5-illustrated-message {
      margin-top: 3rem;
    }
  `],
  template: `
    <ui5-dynamic-page>
      <!-- Title Area -->
      <ui5-dynamic-page-title slot="titleArea">
        <div class="dp-heading" slot="heading">
          <ui5-title [level]="'H2'" [size]="'H2'">Project Atlas Migration</ui5-title>
        </div>
        <div slot="subheading" style="color: var(--sapContent_LabelColor); font-size: var(--sapFontSize)">
          Q2 2026 deliverables
        </div>
      </ui5-dynamic-page-title>

      <!-- Header Area -->
      <ui5-dynamic-page-header slot="headerArea">
        <div class="header-strip">
          <div class="header-pair">
            <ui5-label [showColon]="true">Owner</ui5-label>
            <span class="header-value">Jane Doe</span>
          </div>
          <div class="header-pair">
            <ui5-label [showColon]="true">Status</ui5-label>
            <span class="header-value" style="color: var(--sapInformativeColor)">In Progress</span>
          </div>
          <div class="header-pair">
            <ui5-label [showColon]="true">Due</ui5-label>
            <span class="header-value">2026-06-30</span>
          </div>
        </div>
      </ui5-dynamic-page-header>

      <!-- Page Content — FCL -->
      <div class="fcl-wrapper">
        <ui5-flexible-column-layout [layout]="'TwoColumnsMidExpanded'">

          <!-- START COLUMN: Side Navigation -->
          <div slot="startColumn" class="start-col">
            <ui5-side-navigation
              [accessibleName]="'Project Navigation'"
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

          <!-- MID COLUMN: Contextual content -->
          <div slot="midColumn" class="mid-col">
            @if (activeNav() === 'Timeline') {
              <ui5-title class="mid-col-title" [level]="'H3'" [size]="'H4'">Project Timeline</ui5-title>
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
                [name]="illustrationName()"
                [titleText]="illustrationTitle()">
              </ui5-illustrated-message>
            }
          </div>

        </ui5-flexible-column-layout>
      </div>
    </ui5-dynamic-page>
  `,
})
export class ProjectDashboardPage {
  readonly navItems = NAV_ITEMS;
  readonly timelineEntries = SAMPLE_TIMELINE;

  activeNav = signal<NavItem>('Overview');

  illustrationName = () =>
    this.activeNav() !== 'Timeline'
      ? ILLUSTRATION_MAP[this.activeNav() as Exclude<NavItem, 'Timeline'>]
      : 'NoData';

  illustrationTitle = () =>
    this.activeNav() !== 'Timeline'
      ? ILLUSTRATION_TITLE_MAP[this.activeNav() as Exclude<NavItem, 'Timeline'>]
      : '';

  onNavSelect(event: CustomEvent): void {
    const item = event.detail?.item;
    if (item?.text) {
      this.activeNav.set(item.text as NavItem);
    }
  }
}
