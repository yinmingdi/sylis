// src/types/express.d.ts
import 'express';

declare module 'express' {
  interface Request {
    user?: { id: string; email: string };
  }
}
