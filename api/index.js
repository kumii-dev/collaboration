// Vercel Serverless Function Entry Point
// This wraps the Express app and adds /api prefix to incoming requests

import app from '../apps/api/dist/index.js';

export default async (req, res) => {
  // Vercel strips /api from the URL, so we need to add it back
  // because our Express app expects routes like /api/users, /api/chat, etc.
  req.url = '/api' + req.url;
  
  return app(req, res);
};
