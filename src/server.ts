import pg from 'pg';
import { buildApp } from './app.ts';
import { loadConfig } from './config.ts';

const config = loadConfig();
const pool = new pg.Pool({ connectionString: config.databaseUrl });
const app = buildApp({ pool, logLevel: config.logLevel });

await app.listen({ port: config.port, host: config.host });
