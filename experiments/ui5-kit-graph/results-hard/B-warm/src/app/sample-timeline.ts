export interface TimelineEntry {
  titleText: string;
  subtitleText: string;
  icon: string;
  timestamp: string;
  name: string;
}

export const TIMELINE_ENTRIES: TimelineEntry[] = [
  {
    name: 'Jane Doe',
    titleText: 'Project Kickoff',
    subtitleText: 'Initial planning session and team alignment',
    icon: 'flag',
    timestamp: '2026-03-01 · 09:00 AM',
  },
  {
    name: 'Carlos Rivera',
    titleText: 'Architecture Review',
    subtitleText: 'Cloud infrastructure blueprint approved by stakeholders',
    icon: 'building',
    timestamp: '2026-03-15 · 02:30 PM',
  },
  {
    name: 'Priya Sharma',
    titleText: 'Data Migration – Phase 1',
    subtitleText: 'Legacy database export and schema transformation completed',
    icon: 'database',
    timestamp: '2026-04-10 · 11:00 AM',
  },
  {
    name: 'Tom Nguyen',
    titleText: 'Integration Testing',
    subtitleText: 'End-to-end API tests passed with 98 % coverage',
    icon: 'test',
    timestamp: '2026-05-05 · 04:00 PM',
  },
  {
    name: 'Jane Doe',
    titleText: 'Staging Deployment',
    subtitleText: 'Release candidate promoted to staging environment',
    icon: 'cloud-upload',
    timestamp: '2026-05-28 · 10:15 AM',
  },
];
