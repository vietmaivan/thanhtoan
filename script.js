const CURRENT_HOST = window.location.hostname;
let API_URL ="https://yourcodespace-3000.app.github.dev";

// Cấu hình tự động cho Codespaces / github.dev / app.github.dev / localhost
if (CURRENT_HOST.includes("localhost") || CURRENT_HOST.includes("127.0.0.1")) {
    API_URL = "http://localhost:3000";
} else if (CURRENT_HOST.includes("github.dev") || CURRENT_HOST.includes("app.github.dev")) {
    // Trỏ về host hiện tại (Codespaces preview uses <workspace>-3000.app.github.dev)
    API_URL = `${window.location.protocol}//${window.location.host}`;
} else {
    // Nếu được serve cùng server (ví dụ node server sẽ serve static), dùng đường dẫn tương đối
    API_URL = "";
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
        console.log(result);

        if (!result.success) {
            throw new Error(result.message || result.error || "Không tạo được link thanh toán");
        }

        currentOrderCode = result.orderCode;

        document.getElementById("inputForm").style.display = "none";
        document.getElementById("qrSection").style.display = "block";

        document.getElementById("displayAmount").innerText =
            Number(amount).toLocaleString("vi-VN") + " đ";

        document.getElementById("orderMemo").innerText = memo;
        document.getElementById("successStudentInfo").innerText = rawName;

        if (result.qrCode) {
            document.getElementById("qrImage").src = result.qrCode;
        } else if (result.data && result.data.qrCode) {
            document.getElementById("qrImage").src = result.data.qrCode;
        } else {
            Swal.fire({
                icon: "error",
                title: "Không nhận được QR từ server"
            });
            return;
        }

        document.getElementById("labelText").innerText = "Đang chờ thanh toán...";
        clearInterval(checkInterval);
        checkInterval = setInterval(verifyPaymentRealTime, 2000);

    } catch (err) {
        console.error(err);
        Swal.close();
        Swal.fire({
            icon: "error",
            title: "Lỗi kết nối",
            text: err.message || "Không thể kết nối tới máy chủ API. Vui lòng kiểm tra lại cấu hình."
        });
    }
}

async function verifyPaymentRealTime() {
    if (!currentOrderCode) return;

    try {
        const response = await fetch(`${API_URL}/check-order/${currentOrderCode}`);
        if (!response.ok) {
            console.warn("Kiểm tra trạng thái trả lỗi:", response.status);
            return;
        }
        const result = await response.json();
        console.log("check-order:", result);

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

function triggerMockSuccess() {
    showSuccessNotification();
}

// Hook buttons
document.getElementById("payBtn").addEventListener("click", generatePaymentQR);
document.getElementById("testServerPay").addEventListener("click", () => {
    // client-side immediate success (keeps server untouched)
    triggerMockSuccess();
});