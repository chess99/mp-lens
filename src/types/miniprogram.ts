/**
 * 微信小程序 app.json 相关类型定义
 */

/**
 * 页面窗口表现配置
 */
export interface MiniProgramWindowConfig {
  navigationBarBackgroundColor?: string;
  navigationBarTextStyle?: 'black' | 'white';
  navigationBarTitleText?: string;
  navigationStyle?: 'default' | 'custom';
  backgroundColor?: string;
  backgroundTextStyle?: 'light' | 'dark';
  backgroundColorTop?: string;
  backgroundColorBottom?: string;
  enablePullDownRefresh?: boolean;
  onReachBottomDistance?: number;
  pageOrientation?: 'auto' | 'portrait' | 'landscape';
  restartStrategy?: 'homePage' | 'homePageAndLatestPage';
  initialRenderingCache?: 'static' | 'dynamic';
  visualEffectInBackground?: 'hidden' | 'none';
  handleWebviewPreload?: 'static' | 'none';
  [key: string]: any; // 支持自定义字段
}

/**
 * TabBar 配置项
 */
export interface MiniProgramTabBarItem {
  pagePath: string;
  text: string;
  iconPath?: string;
  selectedIconPath?: string;
}

/**
 * TabBar 配置
 */
export interface MiniProgramTabBar {
  color?: string;
  selectedColor?: string;
  backgroundColor?: string;
  borderStyle?: 'black' | 'white';
  position?: 'bottom' | 'top';
  custom?: boolean;
  list: MiniProgramTabBarItem[];
}

/**
 * 网络超时配置
 */
export interface MiniProgramNetworkTimeout {
  request?: number;
  connectSocket?: number;
  uploadFile?: number;
  downloadFile?: number;
}

/**
 * 权限配置
 */
export interface MiniProgramPermission {
  scope: string;
  desc: string;
}

/**
 * 用于声明式组件
 */
export interface MiniProgramUsingComponents {
  [componentName: string]: string;
}

/**
 * Worker 配置
 */
export interface MiniProgramWorkers {
  workers: string;
}

/**
 * 分包配置
 */
export interface MiniProgramSubPackage {
  root: string;
  name?: string;
  pages: string[];
  independent?: boolean;
}

/**
 * 插件配置
 */
export interface MiniProgramPlugins {
  [pluginName: string]: {
    version: string;
    provider: string;
  };
}

/**
 * 预加载规则
 */
export interface MiniProgramPreloadRule {
  [path: string]: {
    network?: 'all' | 'wifi';
    packages: string[];
  };
}

/**
 * 小程序 app.json 配置
 */
export interface MiniProgramAppJson {
  pages: string[];
  subPackages?: MiniProgramSubPackage[];
  subpackages?: MiniProgramSubPackage[]; // 兼容 subpackages 拼写
  window?: MiniProgramWindowConfig;
  tabBar?: MiniProgramTabBar;
  networkTimeout?: MiniProgramNetworkTimeout;
  debug?: boolean;
  functionalPages?: boolean;
  plugins?: MiniProgramPlugins;
  preloadRule?: MiniProgramPreloadRule;
  resizable?: boolean;
  usingComponents?: MiniProgramUsingComponents;
  permission?: { [scope: string]: { desc: string } };
  sitemapLocation?: string;
  style?: string;
  useExtendedLib?: { [libName: string]: boolean };
  entranceDeclare?: { locationId: number; serviceName: string };
  darkmode?: boolean;
  themeLocation?: string;
  lazyCodeLoading?: 'requiredComponents';
  singlePage?: { navigationBarFit?: 'float' };
  supportedMaterials?: { materialType: string }[];
  serviceProviderTicket?: string;
  workers?: string;
  requiredBackgroundModes?: string[];
  requiredPrivateInfos?: string[];
  visualEffectInBackground?: string;
  renderer?: 'webview' | 'skyline';
  rendererOptions?: { skyline?: { defaultDisplayBlock?: boolean } };
  [key: string]: any; // 支持自定义字段
}
