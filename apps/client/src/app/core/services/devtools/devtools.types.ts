export interface ComponentTreeNode {
  ongId: string;
  tag: string;
  componentName: string;
  selector: string;
  displayName: string;
  file: string;
  line: number;
  isComponent: boolean;
  directives: string[];
  children: ComponentTreeNode[];
  expanded: boolean;
}

export interface PropertyInfo {
  name: string;
  value: string;
  type: 'signal' | 'readonly' | 'property';
  valueType: string;
  editable: boolean;
}

export interface ComponentDetail {
  ongId: string;
  componentName: string;
  selector: string;
  displayName: string;
  file: string;
  line: number;
  properties: PropertyInfo[];
  inputs: PropertyInfo[];
  outputs: string[];
  directives: string[];
  inLoop: boolean;
  conditional: boolean;
}

export interface ProfilerCycle {
  id: number;
  timestamp: number;
  duration: number;
  components: { name: string; duration: number }[];
}

export interface SignalNode {
  id: string;
  label: string;
  type: 'signal' | 'computed' | 'effect';
  value?: string;
}

export interface SignalEdge {
  from: string;
  to: string;
}

export interface RouteNode {
  path: string;
  component: string;
  active: boolean;
  guards: string[];
  lazy: boolean;
  children: RouteNode[];
}

export interface ToolHistoryEntry {
  tool: string;
  args: Record<string, unknown>;
  result: string;
  timestamp: number;
  isError: boolean;
}
