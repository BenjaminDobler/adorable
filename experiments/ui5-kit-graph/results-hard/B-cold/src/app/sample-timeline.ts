export interface TimelineEntry {
  titleText: string;
  subtitleText: string;
  icon: string;
  name: string;
}

export const SAMPLE_TIMELINE: TimelineEntry[] = [
  {
    titleText: 'Project Kickoff',
    subtitleText: 'Jan 15, 2026 · 09:00',
    icon: 'flag',
    name: 'Jane Doe',
  },
  {
    titleText: 'Infrastructure Provisioning Complete',
    subtitleText: 'Feb 03, 2026 · 14:30',
    icon: 'cloud',
    name: 'DevOps Team',
  },
  {
    titleText: 'Data Migration — Phase 1',
    subtitleText: 'Mar 12, 2026 · 11:00',
    icon: 'database',
    name: 'Data Engineering',
  },
  {
    titleText: 'UAT Sign-off',
    subtitleText: 'Apr 28, 2026 · 16:00',
    icon: 'accept',
    name: 'QA Lead',
  },
  {
    titleText: 'Production Go-Live',
    subtitleText: 'Jun 30, 2026 · 08:00',
    icon: 'rocket',
    name: 'Project Atlas Team',
  },
];
