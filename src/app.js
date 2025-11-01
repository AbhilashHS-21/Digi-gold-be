import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/authRoutes.js";
import holdingsRoutes from "./routes/holdingsRoutes.js";
import sipRoutes from "./routes/sipRoutes.js";
import adminPriceRoutes from "./routes/adminPriceRoutes.js"

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/holdings", holdingsRoutes);
app.use("/api/sip", sipRoutes);
app.use("/api/price", adminPriceRoutes);

export default app;
