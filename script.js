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

function removeSign(str) {
    return str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D")
        .replace(/[^a-zA-Z0-9\s]/g, "") // Loại bỏ triệt để ký tự đặc biệt nguy hiểm cho URL
        .toUpperCase()
        .replace(/\s+/g, " ")
        .trim();
}

async function generatePaymentQR() {
    const rawName = document.getElementById("studentName").value.trim();
    const rawContent = document.getElementById("paymentContent").value.trim();
    const amount = document.getElementById("tuitionAmount").value.trim();

    if (!rawName || !rawContent || !amount) {
        Swal.fire({
            icon: "warning",
            title: "Thiếu thông tin",
            text: "Vui lòng nhập đầy đủ thông tin."
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
                amount: Number(amount),
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

        document.getElementById("inputForm").style.display = "none";
        document.getElementById("qrSection").style.display = "block";

        document.getElementById("displayAmount").innerText =
            Number(amount).toLocaleString("vi-VN") + " đ";

        document.getElementById("orderMemo").innerText = memo;
        document.getElementById("successStudentInfo").innerText = rawName;

        const qrImgElement = document.getElementById("qrImage");
        qrImgElement.alt = "Đang tải mã QR..."; // Reset text lỗi cũ trước khi gắn src mới

        // --- ĐOẠN ĐÃ SỬA: Sắp xếp mạch lạc logic, loại bỏ hoàn toàn các lỗi cú pháp lặp khối ---
        if (result.data && result.data.qrCode) {
            qrImgElement.src = result.data.qrCode;
        } else if (result.qrCode) {
            qrImgElement.src = result.qrCode;
        } else if (result.data && result.data.checkoutUrl) {
            qrImgElement.src = result.data.checkoutUrl; 
        } else if (amount && memo) {
            // Giải pháp dự phòng: Tự sinh link VietQR chuẩn nếu không lấy trực tiếp được ảnh từ kết quả
            const BANK_ID = "MB"; 
            const ACCOUNT_NO = "0937551868"; 
            const ACCOUNT_NAME = "MAI VAN VIET"; 
            qrImgElement.src = `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-compact.png?amount=${amount}&addInfo=${encodeURIComponent(memo)}&accountName=${encodeURIComponent(ACCOUNT_NAME)}`;
        } else {
            Swal.fire({
                icon: "error",
                title: "Không nhận được QR từ server",
                text: "Vui lòng kiểm tra lại cấu hình kết nối ứng dụng."
            });
            return;
        }
        // -----------------------------------------------------------------------------------

        document.getElementById("labelText").innerText = "Đang chờ thanh toán...";
        clearInterval(checkInterval);
        checkInterval = setInterval(verifyPaymentRealTime, 2000);

    } catch (err) {
        console.error(err);
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
        console.log(err);
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

document.getElementById("payBtn").addEventListener("click", generatePaymentQR);
document.getElementById("testServerPay").addEventListener("click", () => {
    showSuccessNotification();
});