import { type NextFunction, type Request, type Response } from "express";
declare global {
    namespace Express {
        interface Request {
            userId?: string;
        }
    }
}
export declare const userMiddleware: (req: Request, res: Response, next: NextFunction) => void;
//# sourceMappingURL=middleware.d.ts.map