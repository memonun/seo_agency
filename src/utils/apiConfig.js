// API Configuration for both development and production environments

export const getApiConfig = () => {
  const isDevelopment = import.meta.env.DEV;
  const isProduction = import.meta.env.PROD;
  
  // Base URLs for different environments
  const config = {
    development: {
      baseUrl: 'http://localhost:3001',
      useProxy: false
    },
    production: {
      baseUrl: '', // Use relative URLs in production (Vercel handles routing)
      useProxy: true
    }
  };
  
  return isDevelopment ? config.development : config.production;
};

export const getTwitterApiUrl = () => {
  const { baseUrl } = getApiConfig();
  return `${baseUrl}/api/twitter-analytics`;
};

export const getYouTubeApiUrl = () => {
  const { baseUrl } = getApiConfig();
  return `${baseUrl}/api/youtube-search`;
};

// Environment utilities
export const isDev = () => import.meta.env.DEV;
export const isProd = () => import.meta.env.PROD;

// API request wrapper with environment-aware error handling
export const apiRequest = async (url, options = {}) => {
  const config = getApiConfig();
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || `API request failed with status ${response.status}`);
    }
    
    return data;
  } catch (error) {
    // Enhanced error handling for development
    if (isDev()) {
      console.error('🚨 API Request Error:', {
        url,
        error: error.message,
        environment: 'development',
        config
      });
    }
    
    // Re-throw with context
    const enhancedError = new Error(error.message);
    enhancedError.originalError = error;
    enhancedError.url = url;
    enhancedError.environment = isDev() ? 'development' : 'production';
    
    throw enhancedError;
  }
};

// Twitter API wrapper
export const callTwitterApi = async (data) => {
  const url = getTwitterApiUrl();
  
  if (isDev()) {
    console.log('🐦 Twitter API Call:', { url, data });
  }
  
  return apiRequest(url, {
    method: 'POST',
    body: JSON.stringify(data)
  });
};

// YouTube API wrapper  
export const callYouTubeApi = async (data) => {
  const url = getYouTubeApiUrl();
  
  if (isDev()) {
    console.log('📺 YouTube API Call:', { url, data });
  }
  
  return apiRequest(url, {
    method: 'POST', 
    body: JSON.stringify(data)
  });
};

export default {
  getApiConfig,
  getTwitterApiUrl,
  getYouTubeApiUrl,
  isDev,
  isProd,
  apiRequest,
  callTwitterApi,
  callYouTubeApi
};