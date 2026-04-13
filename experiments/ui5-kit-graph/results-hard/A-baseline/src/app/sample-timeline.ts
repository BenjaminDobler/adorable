export interface TimelineEntry {
  title: string;
  subtitle: string;
  icon: string;
  timestamp: string;
}

export const SAMPLE_TIMELINE: TimelineEntry[] = [
  {
    title: 'Project Kick-off',
    subtitle: 'Initial planning session with all stakeholders',
    icon: 'flag',
    timestamp: '2026-01-10 09:00'
  },
  {
    title: 'Architecture Review',
    subtitle: 'Cloud-native architecture approved by tech board',
    icon: 'building',
    timestamp: '2026-02-14 14:30'
  },
  {
    title: 'Sprint 1 Complete',
    subtitle: 'Core data-model and API layer delivered',
    icon: 'accept',
    timestamp: '2026-03-28 17:00'
  },
  {
    title: 'UAT Started',
    subtitle: 'User-acceptance testing phase begins with pilot team',
    icon: 'person-placeholder',
    timestamp: '2026-05-05 10:00'
  },
  {
    title: 'Go-Live Target',
    subtitle: 'Production deployment and hypercare period',
    icon: 'rocket',
    timestamp: '2026-06-30 08:00'
  }
];
