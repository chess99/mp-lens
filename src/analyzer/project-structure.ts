export type NodeType = 'App' | 'Package' | 'Page' | 'Component' | 'Module';
export type LinkType =
  | 'Structure'
  | 'Import'
  | 'Style'
  | 'Template'
  | 'Config' // Config for page/component -> json, App -> app.json
  | 'Resource' // Link to assets like images (e.g., from tabBar)
  | 'WorkerEntry'; // Link from App to worker entry point

export interface GraphNode {
  id: string; // File path or logical identifier (e.g., 'app', 'pkg:subPackageRoot')
  type: NodeType;
  label: string; // User-friendly name or path relative to miniapp root
  // Optional metadata
  properties?: Record<string, any>;
}

export interface GraphLink {
  source: string; // Source node id
  target: string; // Target node id
  type: LinkType;
  // Optional metadata
  properties?: Record<string, any>;
}

export interface ProjectStructure {
  nodes: GraphNode[];
  links: GraphLink[];
  rootNodeId: string | null; // ID of the 'App' node
  miniappRoot: string; // Absolute path to miniapp root
}

// Maybe add helper functions here later, e.g., findNodeById, findLinksFrom, etc.
