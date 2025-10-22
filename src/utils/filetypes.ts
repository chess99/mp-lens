/**
 * @description
 * 小程序项目源码中所有可被识别的文件类型 (无点)。
 *
 * @remark
 * - `wxs` 文件不直接构成组件或页面，但可被 `wxml` 引用，因此也包含在此列表中。
 * - `less` 被视为 `wxss` 的一种方言，等同处理。
 */
export const ALL_MINI_PROGRAM_SOURCE_TYPES = ['json', 'js', 'ts', 'wxml', 'wxs', 'wxss', 'less'];

/**
 * @description
 * 组件/页面的核心源码文件扩展名 (带点)。
 * 这组文件定义了组件的行为、结构和样式，但不包含配置文件。
 */
export const COMPONENT_IMPLEMENTATION_EXTENSIONS = ['.js', '.ts', '.wxml', '.wxss', '.less'];

/**
 * @description
 * 完整的组件/页面定义文件扩展名 (带点)。
 * 它在核心源码文件的基础上加上了 `.json` 配置文件。
 */
export const COMPONENT_DEFINITION_EXTENSIONS = ['.json', ...COMPONENT_IMPLEMENTATION_EXTENSIONS];

/** 图片文件类型 (无点) */
export const IMAGE_FILE_TYPES = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'];

/** 图片文件扩展名 (带点) */
export const IMAGE_EXTENSIONS = IMAGE_FILE_TYPES.map((it) => `.${it}`);
