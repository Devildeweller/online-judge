import { pino } from 'pino';
import { env, isProduction, isTest } from '../config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL ?? (isTest ? 'silent' : isProduction ? 'info' : 'debug'),
  ...(isProduction || isTest
    ? {}
    : { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' } } }),
});
