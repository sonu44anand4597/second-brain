import mongoose, { Schema, model } from "mongoose";

mongoose.connect("mongodb://localhost:27017/brainly").catch((error) => {
  console.error("MongoDB connection error:", error);
});

const UserSchema = new Schema({
  username: { type: String, unique: true, required: true, trim: true },
  password: { type: String, required: true },
});

export const UserModel = model("User", UserSchema);

const ContentSchema = new Schema({
  title: { type: String, default: "" },
  link: { type: String, required: true },
  type: { type: String, required: true },
  tags: [{ type: String }],
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
});

export const ContentModel = model("Content", ContentSchema);