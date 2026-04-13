export interface TimelineEntry {
  title: string;
  subtitle: string;
  icon: string;
  timestamp: string;
}

export const SAMPLE_TIMELINE: TimelineEntry[] = [
  {
    title: 'Project Kick-off',
    subtitle: 'All stakeholders aligned on scope and goals.',
    icon: 'initiative',
    timestamp: 'Jan 10, 2026 · 09:00',
  },
  {
    title: 'Architecture Review',
    subtitle: 'Cloud-native design approved by the architecture board.',
    icon: 'cloud',
    timestamp: 'Feb 3, 2026 · 14:00',
  },
  {
    title: 'Alpha Release',
    subtitle: 'First internal build deployed to staging environment.',
    icon: 'release',
    timestamp: 'Mar 18, 2026 · 11:30',
  },
  {
    title: 'Security Audit',
    subtitle: 'Penetration testing completed; critical findings resolved.',
    icon: 'shield',
    timestamp: 'Apr 22, 2026 · 10:00',
  },
  {
    title: 'Production Go-Live',
    subtitle: 'Full migration cut-over to the new platform.',
    icon: 'status-positive',
    timestamp: 'Jun 30, 2026 · 08:00',
  },
];
