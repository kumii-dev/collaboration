// Vercel Serverless Function Entry Point
// This wraps the Express app and adds /api prefix to incoming requests

import app from '../apps/api/dist/index.js';

export default async (req, res) => {
  // Log the incoming request for debugging
  console.log('Incoming request:', {
    originalUrl: req.url,
    method: req.method
  });
  
  // Handle root path
  if (req.url === '/' || req.url === '') {
    req.url = '/health';
  }
  // For all other paths, add /api prefix since Vercel strips it
  // Express app expects routes like /api/users, /api/chat, etc.
  else if (!req.url.startsWith('/api') && !req.url.startsWith('/health')) {
    req.url = '/api' + req.url;
  }
  
  console.log('Modified URL:', req.url);
  
  return app(req, res);
};
