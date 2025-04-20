// API service
// @alias-import { settings } from '@config/settings';

// Using the imported settings
export async function fetchData() {
  // console.log('Using API URL:', settings.apiUrl);
  // console.log('Timeout:', settings.timeout);
  
  return {
    success: true,
    data: {
      message: 'Hello from API'
    }
  };
} 