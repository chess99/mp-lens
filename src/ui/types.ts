// 树状图数据类型
export interface TreeNodeData {
  id: string;
  label: string;
  type: string;
  properties?: {
    fileCount?: number;
    totalSize?: number;
    fileTypes?: Record<string, number>;
    sizeByType?: Record<string, number>;
    [key: string]: any;
  };
  children?: TreeNodeData[];
  parent?: string;
  collapsed?: boolean;
}

// 图表类型
export interface ChartData {
  labels: string[];
  values: number[];
  colors?: string[];
}

// 统计数据类型
interface Statistics {
  totalFiles: number;
  totalCodeSize: number;
  totalPages: number;
  totalComponents: number;
  fileTypes: Record<string, number>;
  sizeByType: Record<string, number>;
}

// 应用程序Props类型
export interface AppProps {
  data: TreeNodeData;
  statistics?: Statistics;
}

// 树状图组件Props类型
export interface TreeViewProps {
  data: TreeNodeData;
  onNodeSelect: (node: TreeNodeData) => void;
  selectedNodeId?: string;
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
}

// 节点详情Props类型
export interface NodeDetailsProps {
  node: TreeNodeData;
}

// 图表组件Props类型
interface ChartProps {
  title: string;
  data: ChartData;
  type: 'pie' | 'bar';
  isBytes?: boolean;
}

// Tab组件Props类型
export interface TabsProps {
  tabs: {
    id: string;
    label: string;
    content: any;
  }[];
}

// 全局window接口扩展
declare global {
  interface Window {
    __TREE_DATA__: TreeNodeData;
    __STATISTICS__: Statistics;
    preactApp: {
      hydrate: () => void;
    };
  }
}
