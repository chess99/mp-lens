/**
 * Standard WXML tags recognized by WeChat Mini Program
 *
 * 官方文档：https://developers.weixin.qq.com/miniprogram/dev/component/
 * - 顺序与官方文档分类完全一致，便于查阅和维护
 * - Skyline/手势系统等专用标签已在注释中标明
 *
 * These tags should not be reported as "used but not declared" when linting component usage
 */

/**
 * Set of standard WXML tags (顺序与官方文档一致)
 */
const STANDARD_WXML_TAGS = new Set<string>([
  // 视图容器
  'cover-image',
  'cover-view',
  'match-media',
  'movable-area',
  'movable-view',
  'page-container',
  'root-portal',
  'scroll-view',
  'swiper',
  'swiper-item',
  'view',

  // 基础内容
  'icon',
  'progress',
  'rich-text',
  'selection',
  'text',

  // 表单组件
  'button',
  'checkbox',
  'checkbox-group',
  'editor',
  'editor-portal',
  'form',
  'input',
  'keyboard-accessory',
  'label',
  'picker',
  'picker-view',
  'picker-view-column',
  'radio',
  'radio-group',
  'slider',
  'switch',
  'textarea',

  // Skyline/手势系统/布局/动画/开放数据等（仅 Skyline 支持）
  'double-tap-gesture-handler', // Skyline
  'force-press-gesture-handler', // Skyline
  'horizontal-drag-gesture-handler', // Skyline
  'long-press-gesture-handler', // Skyline
  'pan-gesture-handler', // Skyline
  'scale-gesture-handler', // Skyline
  'tap-gesture-handler', // Skyline
  'vertical-drag-gesture-handler', // Skyline
  'draggable-sheet', // Skyline
  'grid-builder', // Skyline
  'grid-view', // Skyline
  'list-builder', // Skyline
  'list-view', // Skyline
  'nested-scroll-body', // Skyline
  'nested-scroll-header', // Skyline
  'open-container', // Skyline
  'open-data-item', // Skyline
  'open-data-list', // Skyline
  'share-element', // Skyline
  'snapshot', // Skyline
  'span', // Skyline
  'sticky-header', // Skyline
  'sticky-section', // Skyline

  // 导航
  'functional-page-navigator',
  'navigator',

  // 媒体组件
  'audio',
  'camera',
  'channel-live',
  'channel-video',
  'image',
  'live-player',
  'live-pusher',
  'video',
  'voip-room',

  // 地图
  'map',

  // 画布
  'canvas',

  // 开放能力
  'web-view',
  'ad',
  'ad-custom',
  'official-account',
  'open-data',
  'store-coupon',
  'store-home',
  'store-product',

  // 原生组件
  'native-component',

  // 无障碍访问
  'aria-component',

  // 导航栏
  'navigation-bar',

  // 页面属性配置节点
  'page-meta',

  // 特殊组件
  'import',
  'include',
  'template',
  'block',
  'slot',
  'wxs',
]);

/**
 * Checks if a tag is a standard WXML tag
 * @param tag Tag name to check
 * @returns true if the tag is a standard WXML tag
 */
function isStandardWxmlTag(tag: string): boolean {
  return STANDARD_WXML_TAGS.has(tag);
}

/**
 * Filters out standard WXML tags from a set of tags
 * @param tags Set of tags to filter
 * @returns New set containing only non-standard tags
 */
export function filterStandardWxmlTags(tags: Set<string>): Set<string> {
  return new Set(Array.from(tags).filter((tag) => !isStandardWxmlTag(tag)));
}
