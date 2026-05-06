import { Queue } from 'bullmq';
import IORedis from 'ioredis';
console.log('bullmq imported OK');
console.log('ioredis imported OK');
const conn = new IORedis('redis://localhost:1', { maxRetriesPerRequest: null, lazyConnect: true });
console.log('IORedis instance created');
conn.disconnect();
console.log('done');
process.exit(0);
