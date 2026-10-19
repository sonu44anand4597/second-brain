import {} from "express";
import jwt from "jsonwebtoken";
import { JWT_PASSWORD } from "./config.js";
export const userMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }
    try {
        const token = authHeader.slice("Bearer ".length);
        const decoded = jwt.verify(token, JWT_PASSWORD);
        if (!decoded.id) {
            res.status(401).json({ message: "Invalid token" });
            return;
        }
        req.userId = decoded.id;
        next();
    }
    catch {
        res.status(401).json({ message: "Invalid token" });
    }
};
//# sourceMappingURL=middleware.js.map