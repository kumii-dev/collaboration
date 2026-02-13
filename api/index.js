// Vercel Serverless Function Entry Point
// This wraps the Express app and adds /api prefix to incoming requests

import app from '../apps/api/dist/index.js';

export default async (req, res) => {
  // Log the incoming request for debugging
  console.log('Serverless function received:', {
    url: req.url,
    method: req.method,
    headers: req.headers
  });
  
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
  
  return app(req, res);
};
