/**
 * 依赖图数据结构
 * 用于存储文件之间的依赖关系，支持节点和边的操作
 */
export class DependencyGraph {
  private _nodes: Set<string> = new Set();
  private _outEdges: Map<string, Set<string>> = new Map();
  private _inEdges: Map<string, Set<string>> = new Map();

  /**
   * 向图中添加节点
   * @param node 节点名称（文件路径）
   */
  addNode(node: string): void {
    this._nodes.add(node);
    
    // 确保每个节点都有对应的边集合
    if (!this._outEdges.has(node)) {
      this._outEdges.set(node, new Set());
    }
    
    if (!this._inEdges.has(node)) {
      this._inEdges.set(node, new Set());
    }
  }

  /**
   * 向图中添加边（依赖关系）
   * @param from 源文件
   * @param to 目标文件（被依赖）
   */
  addEdge(from: string, to: string): void {
    // 确保两个节点都存在
    this.addNode(from);
    this.addNode(to);
    
    // 添加边
    this._outEdges.get(from)!.add(to);
    this._inEdges.get(to)!.add(from);
  }

  /**
   * 获取所有节点
   */
  nodes(): string[] {
    return [...this._nodes];
  }

  /**
   * 获取节点的所有出边（依赖）
   * @param node 节点名称
   */
  outEdges(node: string): string[] {
    if (!this._outEdges.has(node)) {
      return [];
    }
    return [...this._outEdges.get(node)!];
  }

  /**
   * 获取节点的所有入边（被谁依赖）
   * @param node 节点名称
   */
  inEdges(node: string): string[] {
    if (!this._inEdges.has(node)) {
      return [];
    }
    return [...this._inEdges.get(node)!];
  }

  /**
   * 获取节点的出度（依赖了多少文件）
   * @param node 节点名称
   */
  outDegree(node: string): number {
    if (!this._outEdges.has(node)) {
      return 0;
    }
    return this._outEdges.get(node)!.size;
  }

  /**
   * 获取节点的入度（被多少文件依赖）
   * @param node 节点名称
   */
  inDegree(node: string): number {
    if (!this._inEdges.has(node)) {
      return 0;
    }
    return this._inEdges.get(node)!.size;
  }

  /**
   * 检查图中是否存在节点
   * @param node 节点名称
   */
  hasNode(node: string): boolean {
    return this._nodes.has(node);
  }

  /**
   * 检查图中是否存在从from到to的边
   * @param from 源节点
   * @param to 目标节点
   */
  hasEdge(from: string, to: string): boolean {
    if (!this._outEdges.has(from)) {
      return false;
    }
    return this._outEdges.get(from)!.has(to);
  }

  /**
   * 获取图中的节点数量
   */
  get nodeCount(): number {
    return this._nodes.size;
  }

  /**
   * 获取图中的边数量
   */
  get edgeCount(): number {
    let count = 0;
    for (const edges of this._outEdges.values()) {
      count += edges.size;
    }
    return count;
  }

  /**
   * 将图转换为JSON格式
   */
  toJSON() {
    const nodes = this.nodes();
    const links = nodes.flatMap(from => 
      this.outEdges(from).map(to => ({ source: from, target: to }))
    );
    
    return {
      nodes: nodes.map(id => ({ id })),
      links
    };
  }
} 