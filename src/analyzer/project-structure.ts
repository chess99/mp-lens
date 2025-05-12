export type NodeType = 'App' | 'Package' | 'Page' | 'Component' | 'Module';
export type LinkType =
  | 'Structure' // Hierarchical relationship between components (App->Pages->Components) defined in configuration
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
  properties?: {
    // Common properties
    absolutePath?: string; // For Module nodes
    basePath?: string; // For Page/Component nodes
    root?: string; // For Package nodes
    path?: string; // For App node (path to app.json)
    // File properties (for Module)
    fileSize?: number;
    fileExt?: string;
    // Statistics properties (calculated in UI, not populated by backend)
    fileCount?: number;
    totalSize?: number;
    fileTypes?: Record<string, number>; // { ext: count }
    sizeByType?: Record<string, number>; // { ext: size }
    // --- NEW PROPERTIES ---
    structuralParentId?: string; // ID of the Page/Component/Package this Module primarily belongs to
    referredBy?: string[]; // List of node IDs that import/require this node (populated during parsing)
    // --- END NEW PROPERTIES ---
    // Add other relevant properties as needed
    [key: string]: any; // Allow other properties
  };
}

export interface GraphLink {
  source: string; // ID of the source node
  target: string; // ID of the target node
  type: LinkType; // Type of the relationship
  dependencyType?: string; // Specific type of dependency (e.g., 'static', 'dynamic')
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
