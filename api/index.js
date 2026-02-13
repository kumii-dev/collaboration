// Vercel Serverless Function Entry Point
// This wraps the Express app and adds /api prefix to incoming requests

let app;

// Lazy load the Express app
async function getApp() {
  if (!app) {
    try {
      const module = await import('../apps/api/dist/index.js');
      app = module.default;
      console.log('✅ Express app loaded successfully');
    } catch (error) {
      console.error('❌ Failed to load Express app:', error);
      throw error;
    }
  }
  return app;
}

export default async (req, res) => {
  try {
    // Log the incoming request for debugging
    console.log('Serverless function received:', {
      url: req.url,
      method: req.method
    });
    
    // Load the Express app
    const expressApp = await getApp();
    
    // When Vercel routes /api/health to this function, req.url is /health
    // When Vercel routes /api/forum/categories, req.url is /forum/categories
    // Our Express app has routes at /health and /api/*
    
    // Handle health check (Express has it at /health)
    if (req.url === '/' || req.url === '') {
      req.url = '/health';
    }
    else if (req.url === '/health' || req.url.startsWith('/health')) {
      // Keep as-is, Express has /health at root level
    }
    // For all other paths, add /api prefix
    else if (!req.url.startsWith('/api')) {
      req.url = '/api' + req.url;
    }
    
    console.log('Forwarding to Express app with URL:', req.url);
    
    // Forward the request to Express
    return expressApp(req, res);
  } catch (error) {
    console.error('Serverless function error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
