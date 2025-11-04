import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import authRoutes from "./routes/authRoutes.js";
import holdingsRoutes from "./routes/holdingsRoutes.js";
import sipRoutes from "./routes/sipRoutes.js";
import adminPriceRoutes from "./routes/adminPriceRoutes.js"
import kycRoutes from "./routes/kycRoutes.js"

dotenv.config();

const corsOptions = {
  origin: 'http://localhost:3000',
  credentials: true
};

const app = express();
app.use(cors(corsOptions));
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/holdings", holdingsRoutes);
app.use("/api/sip", sipRoutes);
app.use("/api/price", adminPriceRoutes);
app.use("/api/kyc", kycRoutes);

export default app;
