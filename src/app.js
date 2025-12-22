import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import session from "express-session";

import authRoutes from "./routes/authRoutes.js";
import holdingsRoutes from "./routes/holdingsRoutes.js";
import sipRoutes from "./routes/sipRoutes.js";
import adminPriceRoutes from "./routes/adminPriceRoutes.js"
import kycRoutes from "./routes/kycRoutes.js"
import sipPaymentsRoutes from "./routes/sipPaymentRoutes.js"
import userRoutes from "./routes/userRoutes.js"
import transactionRoutes from "./routes/transactionRoutes.js"
import notificationRoutes from "./routes/notificationRoutes.js"
import adminRoutes from "./routes/adminRoutes.js"
import { errorHandler } from "./middlewares/errorMiddleware.js";
import { securityHeaders, limiter } from "./middlewares/securityMiddleware.js";

dotenv.config();

const corsOptions = {
  origin: 'http://localhost:3000',
  credentials: true
};

const app = express();

// Security Middleware
app.use(securityHeaders);
app.use(limiter);

app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

app.use(cors(corsOptions));
app.use(express.json());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/holdings", holdingsRoutes);
app.use("/api/sip", sipRoutes);
app.use("/api/price", adminPriceRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/kyc", kycRoutes);
app.use("/api/sip/payments", sipPaymentsRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/notifications", notificationRoutes);

app.use("/api/user", userRoutes);

// Global Error Handler
app.use(errorHandler);

export default app;
