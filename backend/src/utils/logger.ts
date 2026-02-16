import winston from 'winston';
import { config } from '../config/env';
import * as fs from 'fs';
import * as path from 'path';

// Create logs directory if it doesn't exist
const logsDir = path.dirname(config.logging.file);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'lr-chatbot' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error', dirname: logsDir }),
    new winston.transports.File({ filename: config.logging.file, dirname: logsDir })
  ]
});

// Add console transport in development
if (config.app.nodeEnv === 'development') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.printf(({ level, message, timestamp }) => {
        return `${timestamp} [${level}]: ${message}`;
      })
    )
  }));
}

export default logger;
