/**
 * @description
 * 小程序项目源码中所有可被识别的文件类型。
 *
 * @remark
 * - `wxs` 文件不直接构成组件或页面，但可被 `wxml` 引用，因此也包含在此列表中。
 * - `less` 被视为 `wxss` 的一种方言，等同处理。
 */
export const MINI_PROGRAM_FILE_TYPES = ['json', 'js', 'ts', 'wxml', 'wxs', 'wxss', 'less'] as const;

/**
 * @description
 * 组件/页面的核心源码文件类型。
 * 这组文件定义了组件的行为、结构和样式，但不包含配置文件。
 */
export const COMPONENT_IMPLEMENTATION_FILE_TYPES = ['js', 'ts', 'wxml', 'wxss', 'less'] as const;

/**
 * @description
 * 完整的组件/页面定义文件类型。
 * 它在核心源码文件的基础上加上了 `.json` 配置文件。
 */
export const COMPONENT_DEFINITION_FILE_TYPES = [
  'json',
  ...COMPONENT_IMPLEMENTATION_FILE_TYPES,
] as const;

/** 图片文件类型 */
export const IMAGE_FILE_TYPES = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'] as const;

/** TypeScript 声明文件类型 */
const DECLARATION_FILE_TYPES = ['d.ts'] as const;

/**
 * @description
 * 分析器能够解析的所有受支持文件类型的综合列表。
 * 包括小程序源文件、图片和 TypeScript 声明文件。
 */
export const ALL_SUPPORTED_FILE_TYPES = [
  ...MINI_PROGRAM_FILE_TYPES,
  ...IMAGE_FILE_TYPES,
  ...DECLARATION_FILE_TYPES,
] as const;

/**
 * @description
 * 表示分析器可以处理的任何受支持文件类型的联合类型。
 */
export type SupportedFileType = (typeof ALL_SUPPORTED_FILE_TYPES)[number];
