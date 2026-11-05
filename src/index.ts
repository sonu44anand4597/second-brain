import mongoose from 'mongoose';
import { app } from './app.js';
import { config } from './config.js';
import { connectDatabase } from './db.js';

try {
  await connectDatabase(config.mongoUrl);
  const server = app.listen(config.port, () => console.log(`Commonplace API: http://localhost:${config.port}`));
  const shutdown = () => { server.close(() => { void mongoose.disconnect().then(() => process.exit(0)); }); };
  process.once('SIGTERM', shutdown); process.once('SIGINT', shutdown);
} catch {
  console.error('Cannot connect to MongoDB. Set MONGODB_URI and start your database.');
  process.exitCode = 1;
}
