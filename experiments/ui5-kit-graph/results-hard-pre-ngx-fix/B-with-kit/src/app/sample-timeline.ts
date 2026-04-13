export interface TimelineEntry {
  titleText: string;
  subtitleText: string;
  icon: string;
  name: string;
}

export const SAMPLE_TIMELINE_ENTRIES: TimelineEntry[] = [
  {
    titleText: 'Project Kickoff',
    subtitleText: 'Initial planning session with all stakeholders',
    icon: 'flag',
    name: 'Jan 15, 2026',
  },
  {
    titleText: 'Architecture Review',
    subtitleText: 'Cloud infrastructure design approved by tech leads',
    icon: 'cloud',
    name: 'Feb 10, 2026',
  },
  {
    titleText: 'Alpha Release',
    subtitleText: 'Internal alpha delivered to QA team for validation',
    icon: 'lab',
    name: 'Mar 24, 2026',
  },
  {
    titleText: 'Security Audit',
    subtitleText: 'Penetration testing and vulnerability remediation completed',
    icon: 'shield',
    name: 'Apr 18, 2026',
  },
  {
    titleText: 'Beta Deployment',
    subtitleText: 'Feature-complete beta rolled out to pilot customers',
    icon: 'rocket',
    name: 'May 30, 2026',
  },
];
