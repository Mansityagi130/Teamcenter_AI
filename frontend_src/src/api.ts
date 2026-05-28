import axios from 'axios';

// Create Axios instance. Uses VITE_API_BASE_URL or defaults to relative url.
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Inject JWT token and API Key from localStorage
apiClient.interceptors.request.use(
  (config) => {
    const jwt = localStorage.getItem('teamcenter.jwt');
    const apiKey = localStorage.getItem('teamcenter.apiKey');

    if (jwt) {
      config.headers.Authorization = `Bearer ${jwt}`;
    }
    if (apiKey) {
      config.headers['X-API-Key'] = apiKey;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response Interceptor: Catch auth errors and redirect
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response ? error.response.status : null;
    
    if (status === 401) {
      // Clear credentials
      localStorage.removeItem('teamcenter.jwt');
      localStorage.removeItem('teamcenter.apiKey');
      localStorage.removeItem('teamcenter.username');
      localStorage.removeItem('teamcenter.currentSessionId');
      
      // If we are not already on the login page, redirect
      if (window.location.pathname !== '/login' && window.location.pathname !== '/') {
        window.location.href = '/login';
      }
    }
    
    return Promise.reject({
      status: status,
      message: error.response?.data?.detail || error.response?.data?.message || error.message || 'Request error'
    });
  }
);

export default apiClient;
