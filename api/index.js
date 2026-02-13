// Vercel Serverless Function Entry Point
// This wraps the Express app and handles routing

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
    // Debug: Log what Vercel sends us
    const debugInfo = {
      originalUrl: req.url,
      path: req.path,
      baseUrl: req.baseUrl,
      method: req.method
    };
    
    console.log('📥 Received:', debugInfo);
    
    // Load the Express app
    const expressApp = await getApp();
    
    // When accessing /api/health, Vercel route "/api/(.*)" matches and forwards to this function
    // Vercel strips /api prefix, so req.url becomes "/health"
    // But we need to confirm this assumption
    
    // Let's keep the URL as-is and let Express handle it
    console.log('🔀 Forwarding to Express with URL:', req.url);
    
    // Forward the request to Express
    return expressApp(req, res);
  } catch (error) {
    console.error('❌ Serverless function error:', error);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
