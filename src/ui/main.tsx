import { render } from 'preact';
import { App } from './components/App';
import { TreeNodeData } from './types';

// 声明全局Chart类型
declare global {
  interface Window {
    Chart?: any; // 使用any类型来适配Chart.js
    __MP_LENS_DATA__?: TreeNodeData; // Correct data variable name and type
  }
}

/**
 * Client-side rendering function
 */
function performRender(): void {
  const data = window.__MP_LENS_DATA__;
  if (!data) {
    console.error('Could not find __MP_LENS_DATA__. Render failed.');
    return;
  }

  const rootElement = document.getElementById('app');
  if (!rootElement) {
    console.error('Could not find mount point #app. Render failed.');
    return;
  }

  // Render the app (not hydrate)
  render(<App data={data} />, rootElement);

  initCharts();

  console.log('Application rendered successfully.');
}

/**
 * 初始化图表
 */
function initCharts(): void {
  // 检查是否存在Chart对象
  if (typeof window.Chart === 'undefined') {
    console.warn('Chart.js未加载，无法初始化图表');
    return;
  }

  // TODO: 初始化图表
  // 这里可以使用Chart.js来初始化图表
}

// Run render when DOM is ready
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', performRender);
  } else {
    performRender();
  }
}
