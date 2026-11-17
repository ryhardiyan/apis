// Entry point for both local development and Vercel Serverless Functions.
import app from './src/index.js';

const port = process.env.PORT || 3000;

if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`RyharDev API running at http://localhost:${port}/docs`);
  });
}

export default app;
