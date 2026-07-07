const express = require("express");
const cors = require("cors");
const path = require("path");
const serverless = require('serverless-http');

// PayOS SDK (try multiple common exports)
let PayOSModule;
try {
  PayOSModule = require("@payos/node");
} catch (e) {
  PayOSModule = null;
}
const PayOS = PayOSModule ? (PayOSModule.PayOS || PayOSModule.default || PayOSModule) : null;

const app = express();

// ==========================
// CORS
// ==========================
const corsOptions = {
  origin: function (origin, callback) {
    // Allow if no origin (curl / server-side) or allow preview domains
    if (!origin || origin.includes("github.dev") || origin.includes("app.github.dev")) {
      callback(null, true);
    } else {
      // allow same origin requests (when served from same host)
      callback(null, true);
    }
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (index.html, script.js) from project root so Codespace preview can load them
app.use(express.static(path.join(__dirname)));

// Simple request logger
app.use((req, res, next) => {
  console.log(new Date().toISOString(), req.method, req.url);
  next();
});

// ==========================
// PayOS configuration - support MOCK when env not present
// ==========================
require("dotenv").config();

let payosClient = null;
const payments = {}; // in-memory store for mock mode

if (process.env.PAYOS_CLIENT_ID && process.env.PAYOS_API_KEY && process.env.PAYOS_CHECKSUM_KEY && PayOS) {
  try {
    payosClient = new PayOS(
      process.env.PAYOS_CLIENT_ID,
      process.env.PAYOS_API_KEY,
      process.env.PAYOS_CHECKSUM_KEY
    );
    console.log("PayOS SDK initialized.");
  } catch (e) {
    console.error("Không thể khởi tạo PayOS SDK:", e);
    payosClient = null;
  }
}

if (!payosClient) {
  console.warn("PAYOS credentials missing or SDK not installed. Running in MOCK mode.");
  // Mock payosClient with minimal API used by frontend
  payosClient = {
    async createPaymentLink({ orderCode, amount, description }) {
      // create a QR image URL via api.qrserver.com for demo
      const code = orderCode || Date.now();
      payments[code] = {
        orderCode: code,
        amount: Number(amount),
        description: description || "",
        status: "PENDING",
        createdAt: Date.now()
      };
      const qrData = encodeURIComponent(`PAYMENT|${code}|${payments[code].amount}|${payments[code].description}`);
      return {
        checkoutUrl: `https://example.com/checkout/${code}`,
        qrCode: `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${qrData}`,
        data: payments[code]
      };
    },
    async getPaymentLinkInformation(orderCode) {
      const code = Number(orderCode);
      const info = payments[code];
      if (!info) {
        return { status: "NOT_FOUND", data: null };
      }
      // For demo: if older than 10s, mark as PAID (optional)
      if (Date.now() - info.createdAt > 60000 && info.status === "PENDING") {
        info.status = "PAID";
      }
      return { status: info.status, data: info };
    }
  };
}

// ==========================
// Routes
// ==========================

// Serve index.html by default (allow static middleware above to handle)
// Provide a health check API
app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "Server is running", mockMode: !!process.env.PAYOS_CLIENT_ID ? false : true });
});

// Create payment link
app.post("/create-payment-link", async (req, res) => {
  try {
    const { amount, description } = req.body;
    if (!amount) {
      return res.status(400).json({ success: false, message: "Thiếu thông tin amount" });
    }

    const orderCode = Date.now(); // use timestamp as order code (unique enough for demo)

    // Build data expected by real SDK; for mock we accept same shape
    const paymentData = {
      orderCode,
      amount: Number(amount),
      description: (description || "Thanh toan").substring(0, 100)
      // cancelUrl / returnUrl could be added if real SDK needs
    };

    // If using real SDK, call its method; the mock also exposes same method
    const result = await payosClient.createPaymentLink(paymentData);

    // If mock, the mock returns data as defined above
    res.json({
      success: true,
      orderCode,
      checkoutUrl: result.checkoutUrl,
      qrCode: result.qrCode,
      data: result.data || result
    });
  } catch (err) {
    console.error("Error create-payment-link:", err);
    res.status(500).json({ success: false, message: err.message || "Internal server error", error: err });
  }
});

// Check order
app.get("/check-order/:orderCode", async (req, res) => {
  try {
    const orderCode = req.params.orderCode;
    const info = await payosClient.getPaymentLinkInformation(orderCode);
    res.json({ success: true, status: info.status, data: info.data || info });
  } catch (err) {
    console.error("Error check-order:", err);
    res.status(500).json({ success: false, message: err.message || "Internal server error" });
  }
});

// Simulate payment (useful for testing on Codespace) - marks order as PAID
app.post("/simulate-pay/:orderCode", (req, res) => {
  const code = Number(req.params.orderCode);
  if (!payments[code]) {
    return res.status(404).json({ success: false, message: "Order not found in mock store" });
  }
  payments[code].status = "PAID";
  return res.json({ success: true, orderCode: code, status: "PAID" });
});

// ==========================
// Start server or export handler for serverless
// ==========================
const PORT = process.env.PORT || 3000;

if (process.env.NETLIFY) {
  module.exports.handler = serverless(app);
} else {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} locally or preview the port in Codespaces at :${PORT}`);
  });
}