import { Chart, ChartType, registerables } from 'chart.js'; // Import Chart.js and ChartType
import { render } from 'preact';
import { App } from './components/App';
import './index.css'; // Import the CSS file
import { ChartData, TreeNodeData } from './types';

// Register necessary Chart.js components
Chart.register(...registerables);

// 声明全局Chart类型
declare global {
  interface Window {
    Chart?: any; // 使用any类型来适配Chart.js
    __MP_LENS_DATA__?: TreeNodeData; // Correct data variable name and type
  }
}

let currentCharts: Chart[] = []; // Keep track of chart instances

/**
 * Client-side rendering function
 */
function performRender(): void {
  const data = window.__MP_LENS_DATA__;
  if (!data) {
    console.error('Could not find __MP_LENS_DATA__. Render failed.');
    // Optionally render an error message
    render(<div>Error: Data not found.</div>, document.getElementById('app')!);
    return;
  }

  const rootElement = document.getElementById('app');
  if (!rootElement) {
    console.error('Could not find mount point #app. Render failed.');
    return;
  }

  // Render the app (not hydrate)
  render(<App data={data} />, rootElement);

  // Call initCharts AFTER rendering App, as it relies on elements created by App
  initCharts();

  console.log('Application rendered successfully.');
}

/**
 * 初始化图表
 */
function initCharts(): void {
  // Clear previous chart instances to prevent memory leaks on re-renders
  currentCharts.forEach((chart) => chart.destroy());
  currentCharts = [];

  // Find all canvas elements with chart data
  const chartCanvases = document.querySelectorAll<HTMLCanvasElement>('canvas[data-chart-data]');

  chartCanvases.forEach((canvas) => {
    const chartType = canvas.dataset.chartType as ChartType | undefined;
    const chartDataString = canvas.dataset.chartData;

    if (!chartType || !chartDataString) {
      console.warn('Canvas missing chart type or data', canvas.id);
      return;
    }

    try {
      const data: ChartData = JSON.parse(chartDataString);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('Failed to get canvas context for', canvas.id);
        return;
      }

      const newChart = new Chart(ctx, {
        type: chartType,
        data: {
          labels: data.labels,
          datasets: [
            {
              label: canvas.parentElement?.querySelector('h3')?.innerText || 'Dataset', // Get title from parent h3
              data: data.values,
              backgroundColor: data.colors || '#4285F4',
              borderColor: '#fff',
              borderWidth: chartType === 'pie' ? 1 : 0, // Add border to pie slices
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false, // Allow chart to fill container
          plugins: {
            legend: {
              display: chartType !== 'pie', // Hide legend for pie chart maybe?
            },
          },
          // Add other options as needed
        },
      });
      currentCharts.push(newChart); // Store instance
    } catch (e) {
      console.error('Failed to parse chart data or render chart:', canvas.id, e);
    }
  });

  if (chartCanvases.length > 0) {
    console.log(`Initialized ${currentCharts.length} charts.`);
  } else {
    // console.log('No chart canvases found to initialize.');
  }
}

// Run render when DOM is ready
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', performRender);
  } else {
    performRender();
  }
}
