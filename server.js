require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const serverless = require('serverless-http');

// PayOS SDK
let PayOSModule;
try {
  PayOSModule = require("@payos/node");
} catch (e) {
  PayOSModule = null;
}
const PayOS = PayOSModule ? (PayOSModule.PayOS || PayOSModule.default || PayOSModule) : null;

const app = express();

const corsOptions = {
  origin: "*", // Cho phép tất cả các nguồn truy cập khi đang trong quá trình thử nghiệm
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false // BẮT BUỘC: Khi dùng origin "*" thì credentials phải là false
};

app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

app.use((req, res, next) => {
  console.log(new Date().toISOString(), req.method, req.url);
  next();
});

require("dotenv").config();

let payosClient = null;
const payments = {}; 

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

  payosClient = {
    async createPaymentLink({ orderCode, amount, description }) {
      const code = orderCode || Date.now();
      payments[code] = {
        orderCode: code,
        amount: Number(amount),
        description: description || "",
        status: "PENDING",
        createdAt: Date.now()
      };
      
      // SỬA TẠI ĐÂY: Thay thế "MB BANK" thành mã chuẩn "MB" của VietQR và tối ưu URL
      const BANK_ID = "MB"; 
      const ACCOUNT_NO = "0937551868"; 
      const ACCOUNT_NAME = "MAI VAN VIET"; 
      
      // Sử dụng URL template chuẩn không bị double encode
      const qrUrl = `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-compact.png?amount=${amount}&addInfo=${encodeURIComponent(description)}&accountName=${encodeURIComponent(ACCOUNT_NAME)}`;

      return {
        checkoutUrl: `https://example.com/checkout/${code}`,
        qrCode: qrUrl,
        data: payments[code]
      };
    },

    async getPaymentLinkInformation(orderCode) {
      const code = Number(orderCode);
      const info = payments[code];
      if (!info) {
        return { status: "NOT_FOUND", data: null };
      }
      if (Date.now() - info.createdAt > 60000 && info.status === "PENDING") {
        info.status = "PAID";
      }
      return { status: info.status, data: info };
    }
  };
}

app.get("/api/health", (req, res) => {
  res.json({ success: true, message: "Server is running", mockMode: !process.env.PAYOS_CLIENT_ID });
});

app.post("/create-payment-link", async (req, res) => {
  try {
    const { amount, description } = req.body;
    if (!amount) {
      return res.status(400).json({ success: false, message: "Thiếu thông tin amount" });
    }

    const orderCode = Date.now();
    const paymentData = {
      orderCode,
      amount: Number(amount),
      description: (description || "Thanh toan").substring(0, 25) // Giới hạn đúng 25 ký tự để VietQR không lỗi
    };

    const result = await payosClient.createPaymentLink(paymentData);

    res.json({
      success: true,
      orderCode,
      checkoutUrl: result.checkoutUrl,
      qrCode: result.qrCode,
      data: result.data || result
    });
  } catch (err) {
    console.error("Error create-payment-link:", err);
    res.status(500).json({ success: false, message: err.message || "Internal server error" });
  }
});

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

app.post("/simulate-pay/:orderCode", (req, res) => {
  const code = Number(req.params.orderCode);
  if (!payments[code]) {
    return res.status(404).json({ success: false, message: "Order not found in mock store" });
  }
  payments[code].status = "PAID";
  return res.json({ success: true, orderCode: code, status: "PAID" });
});

const PORT = process.env.PORT || 3000;
if (process.env.NETLIFY) {
  module.exports.handler = serverless(app);
} else {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}