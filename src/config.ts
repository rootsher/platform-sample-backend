export interface Config {
  port: number;
  host: string;
  logLevel: string;
  databaseUrl: string;
  faultErrorRate: number;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function port(): number {
  const value = Number(process.env.PORT ?? 8080);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`PORT must be a port number, got ${String(process.env.PORT)}`);
  }
  return value;
}

function faultErrorRate(): number {
  const value = Number(process.env.FAULT_ERROR_RATE ?? 0);
  if (!(value >= 0 && value <= 1)) {
    throw new Error(
      `FAULT_ERROR_RATE must be between 0 and 1, got ${String(process.env.FAULT_ERROR_RATE)}`,
    );
  }
  return value;
}

export function loadConfig(): Config {
  return {
    port: port(),
    host: process.env.HOST ?? '0.0.0.0',
    logLevel: process.env.LOG_LEVEL ?? 'info',
    databaseUrl: required('DATABASE_URL'),
    faultErrorRate: faultErrorRate(),
  };
}
