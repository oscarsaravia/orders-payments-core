import { Pool } from 'pg';

export const createPool = (connectionString: string): Pool =>
  new Pool({ connectionString, max: 10 });