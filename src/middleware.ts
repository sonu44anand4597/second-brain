
import { type NextFunction, type Request, type Response } from "express";
import jwt from "jsonwebtoken";

import { JWT_PASSWORD } from "./config.js";

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export const userMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const token = authHeader.slice("Bearer ".length);
    const decoded = jwt.verify(token, JWT_PASSWORD) as { id?: string };

    if (!decoded.id) {
      res.status(401).json({ message: "Invalid token" });
      return;
    }

    req.userId = decoded.id;
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};