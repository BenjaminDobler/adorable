export interface TimelineEntry {
  titleText: string;
  subtitleText: string;
  icon: string;
  name: string;
}

export const SAMPLE_TIMELINE: TimelineEntry[] = [
  {
    titleText: 'Project Kickoff',
    subtitleText: 'All stakeholders aligned on scope and goals',
    icon: 'accept',
    name: 'Jan 15, 2026',
  },
  {
    titleText: 'Infrastructure Provisioning',
    subtitleText: 'Cloud environments set up in AWS eu-west-1',
    icon: 'cloud',
    name: 'Feb 03, 2026',
  },
  {
    titleText: 'Data Migration – Phase 1',
    subtitleText: 'Legacy DB schema mapped and ETL pipelines validated',
    icon: 'database',
    name: 'Mar 12, 2026',
  },
  {
    titleText: 'Integration Testing',
    subtitleText: 'End-to-end tests passed for 87 % of critical paths',
    icon: 'lab',
    name: 'Apr 28, 2026',
  },
  {
    titleText: 'Go-Live Preparation',
    subtitleText: 'Cut-over plan approved; rollback procedures documented',
    icon: 'rocket',
    name: 'Jun 10, 2026',
  },
];
