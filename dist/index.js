import express, {} from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { JWT_PASSWORD } from "./config.js";
import { ContentModel, UserModel } from "./db.js";
import { userMiddleware } from "./middleware.js";
const app = express();
app.use(express.json());
app.post("/api/v1/signup", async (req, res) => {
    const username = String(req.body?.username ?? "").trim();
    const password = String(req.body?.password ?? "");
    if (!username || !password) {
        res.status(400).json({ message: "Username and password are required" });
        return;
    }
    try {
        await UserModel.create({ username, password });
        res.status(201).json({ message: "You have successfully signed up" });
    }
    catch {
        res.status(411).json({ message: "User already exists" });
    }
});
app.post("/api/v1/signin", async (req, res) => {
    const username = String(req.body?.username ?? "").trim();
    const password = String(req.body?.password ?? "");
    if (!username || !password) {
        res.status(400).json({ message: "Username and password are required" });
        return;
    }
    try {
        const existingUser = await UserModel.findOne({ username, password });
        if (!existingUser) {
            res.status(401).json({ message: "Invalid credentials" });
            return;
        }
        const token = jwt.sign({ id: existingUser._id.toString() }, JWT_PASSWORD, {
            expiresIn: "7d",
        });
        res.json({ token });
    }
    catch {
        res.status(500).json({ message: "Something went wrong" });
    }
});
app.post("/api/v1/content", userMiddleware, async (req, res) => {
    const userId = req.userId;
    const link = String(req.body?.link ?? "").trim();
    const type = String(req.body?.type ?? "").trim();
    if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }
    if (!link || !type) {
        res.status(400).json({ message: "Link and type are required" });
        return;
    }
    try {
        await ContentModel.create({
            link,
            type,
            userId: new mongoose.Types.ObjectId(userId),
            tags: [],
        });
        res.json({ message: "Content added" });
    }
    catch {
        res.status(500).json({ message: "Unable to add content" });
    }
});
app.get("/api/v1/content", userMiddleware, async (req, res) => {
    const userId = req.userId;
    if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }
    try {
        const content = await ContentModel.find({ userId: new mongoose.Types.ObjectId(userId) }).populate("userId", "username");
        res.json({ content });
    }
    catch {
        res.status(500).json({ message: "Unable to fetch content" });
    }
});
app.delete("/api/v1/content", userMiddleware, async (req, res) => {
    const userId = req.userId;
    const contentId = String(req.body?.contentId ?? "").trim();
    if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
    }
    if (!contentId) {
        res.status(400).json({ message: "Content ID is required" });
        return;
    }
    try {
        await ContentModel.deleteMany({
            _id: new mongoose.Types.ObjectId(contentId),
            userId: new mongoose.Types.ObjectId(userId),
        });
        res.json({ message: "Deleted" });
    }
    catch {
        res.status(500).json({ message: "Unable to delete content" });
    }
});
app.post("/api/v1/brain/:shareLink", (req, res) => {
    res.json({ message: "Brain share route not implemented yet", shareLink: req.params.shareLink });
});
app.listen(3000, () => {
    console.log("Server listening on http://localhost:3000");
});
//# sourceMappingURL=index.js.map