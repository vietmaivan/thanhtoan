const CURRENT_HOST = window.location.hostname;
let API_URL = "https://bug-free-dollop-qp94g7w9jg624gx9-3000.app.github.dev";

if (CURRENT_HOST.includes("localhost") || CURRENT_HOST.includes("127.0.0.1")) {
    API_URL = "http://localhost:3000"; 
} else if (CURRENT_HOST.includes("github.dev") || CURRENT_HOST.includes("app.github.dev")) {
    // Tự động lấy link Codespace hiện tại nếu bạn đang test trực tiếp trên tab Codespace preview
    API_URL = `${window.location.protocol}//${window.location.host}`;
} else {
    // KHI CHẠY TRÊN GITHUB PAGES: Thay link chạy thực tế hiện tại của bạn vào đây
    API_URL = "https://bug-free-dollop-qp94g7w9jg624gx9-3000.app.github.dev";
}

console.log("Cấu hình API kết nối tới mục tiêu:", API_URL);

let currentOrderCode = null;
let checkInterval = null;

// Hàm xóa dấu tiếng Việt và ký tự đặc biệt nguy hiểm
function removeSign(str) {
    return str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D")
        .replace(/[^a-zA-Z0-9\s]/g, "") 
        .toUpperCase()
        .replace(/\s+/g, " ")
        .trim();
}

async function generatePaymentQR() {
    const rawName = document.getElementById("studentName").value.trim();
    const rawContent = document.getElementById("paymentContent").value.trim();
    const amountInput = document.getElementById("tuitionAmount").value.trim();

    if (!rawName || !rawContent || !amountInput) {
        Swal.fire({
            icon: "warning",
            title: "Thiếu thông tin",
            text: "Vui lòng nhập đầy đủ thông tin."
        });
        return;
    }

    // Xử lý số tiền: Loại bỏ tất cả ký tự không phải là số (ví dụ: "10.000" -> "10000")
    const cleanAmount = Number(amountInput.replace(/[^0-9]/g, ""));
    if (isNaN(cleanAmount) || cleanAmount <= 0) {
        Swal.fire({
            icon: "error",
            title: "Số tiền không hợp lệ",
            text: "Vui lòng kiểm tra lại số tiền nhập vào."
        });
        return;
    }

    // Giới hạn 25 ký tự để tránh vỡ chuỗi quy định của ngân hàng
    const memo = `${removeSign(rawName)} ${removeSign(rawContent)}`
        .substring(0, 25)
        .trim();

    try {
        Swal.fire({
            title: "Đang tạo mã QR...",
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        const response = await fetch(`${API_URL}/create-payment-link`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                amount: cleanAmount,
                description: memo
            })
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Server trả lỗi: ${response.status} ${text}`);
        }

        const result = await response.json();
        Swal.close();

        if (!result.success) {
            throw new Error(result.message || "Không tạo được link thanh toán");
        }

        currentOrderCode = result.orderCode;

        // Ẩn form nhập, hiện phần QR
        document.getElementById("inputForm").style.display = "none";
        document.getElementById("qrSection").style.display = "block";

        // Hiển thị số tiền định dạng vi-VN định dạng chuẩn lên giao diện
        document.getElementById("displayAmount").innerText = cleanAmount.toLocaleString("vi-VN") + " đ";
        document.getElementById("orderMemo").innerText = memo;
        document.getElementById("successStudentInfo").innerText = rawName;

        const qrImgElement = document.getElementById("qrImage");
        qrImgElement.alt = "Đang tải mã QR..."; // Reset text lỗi cũ

        // --- ĐOẠN XỬ LÝ HIỂN THỊ QR CHUẨN ---
        if (result.data && result.data.qrCode) {
            qrImgElement.src = result.data.qrCode;
        } else if (result.qrCode) {
            qrImgElement.src = result.qrCode;
        } else {
            // Giải pháp dự phòng tối ưu: Tự sinh link VietQR chuẩn nếu API không trả về ảnh trực tiếp
            console.warn("API không trả về link ảnh QR trực tiếp, chuyển sang giải pháp dự phòng VietQR API.");
            const BANK_ID = "MB"; 
            const ACCOUNT_NO = "0937551868"; 
            const ACCOUNT_NAME = "MAI VAN VIET"; 
            
            qrImgElement.src = `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-compact.png?amount=${cleanAmount}&addInfo=${encodeURIComponent(memo)}&accountName=${encodeURIComponent(ACCOUNT_NAME)}`;
        }

        document.getElementById("labelText").innerText = "Đang chờ thanh toán...";
        clearInterval(checkInterval);
        checkInterval = setInterval(verifyPaymentRealTime, 2000);

    } catch (err) {
        console.error("Lỗi tạo QR:", err);
        Swal.close();
        Swal.fire({
            icon: "error",
            title: "Lỗi kết nối",
            text: err.message || "Không thể kết nối tới máy chủ API."
        });
    }
}

async function verifyPaymentRealTime() {
    if (!currentOrderCode) return;

    try {
        const response = await fetch(`${API_URL}/check-order/${currentOrderCode}`);
        if (!response.ok) return;
        
        const result = await response.json();
        if (result.success && (result.status === "PAID" || result.status === "SUCCESS")) {
            showSuccessNotification();
        }
    } catch (err) {
        console.log("Lỗi kiểm tra trạng thái đơn hàng:", err);
    }
}

function showSuccessNotification() {
    clearInterval(checkInterval);
    Swal.fire({
        icon: "success",
        title: "Thanh toán thành công",
        text: "Hệ thống đã nhận được giao dịch.",
        timer: 2000,
        showConfirmButton: false
    }).then(() => {
        document.getElementById("qrSection").style.display = "none";
        document.getElementById("successBox").style.display = "block";
    });
}

// Gắn sự kiện click
document.getElementById("payBtn").addEventListener("click", generatePaymentQR);

// Kiểm tra sự tồn tại của phần tử test trước khi gắn sự kiện tránh lỗi Console
const testBtn = document.getElementById("testServerPay");
if (testBtn) {
    testBtn.addEventListener("click", () => {
        showSuccessNotification();
    });
}