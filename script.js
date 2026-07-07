const CURRENT_HOST = window.location.hostname;
let API_URL = "https://bug-free-dollop-qp94g7w9jg624gx9-3000.app.github.dev";

if (CURRENT_HOST.includes("localhost") || CURRENT_HOST.includes("127.0.0.1")) {
    API_URL = "http://localhost:3000"; 
} else if (CURRENT_HOST.includes("github.dev") || CURRENT_HOST.includes("app.github.dev")) {
    // SỬA TẠI ĐÂY: Sử dụng dấu "=" để gán giá trị biến, không dùng dấu ":"
    API_URL = window.location.origin;
} else {
    // KHI CHẠY TRÊN GITHUB PAGES: Link endpoint backend Codespace của bạn
    API_URL = "https://bug-free-dollop-qp94g7w9jg624gx9-3000.app.github.dev";
}

console.log("Cấu hình API kết nối tới mục tiêu:", API_URL);

let currentOrderCode = null;
let checkInterval = null;

// Hàm xóa dấu tiếng Việt và ký tự đặc biệt nguy hiểm cho URL
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

    const cleanAmount = Number(amountInput.replace(/[^0-9]/g, ""));
    if (isNaN(cleanAmount) || cleanAmount <= 0) {
        Swal.fire({
            icon: "error",
            title: "Số tiền không hợp lệ",
            text: "Vui lòng kiểm tra lại số tiền nhập vào."
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

        // Ẩn form nhập, hiện phần hiển thị QR
        document.getElementById("inputForm").style.display = "none";
        document.getElementById("qrSection").style.display = "block";

        // Hiển thị thông tin định dạng chuẩn lên giao diện
        document.getElementById("displayAmount").innerText = cleanAmount.toLocaleString("vi-VN") + " đ";
        document.getElementById("orderMemo").innerText = memo;
        
        const successStudentInfoElem = document.getElementById("successStudentInfo");
        if (successStudentInfoElem) successStudentInfoElem.innerText = rawName;

        const qrImgElement = document.getElementById("qrImage");
        qrImgElement.alt = "Đang tải mã QR...";

        // --- ĐOẠN ĐỔI SANG DÙNG ẢNH TĨNH ĐỂ KHÔNG BỊ TRÌNH DUYỆT HỦY REQUEST ---
        const BANK_ID = "MB"; 
        const ACCOUNT_NO = "0937551868"; 
        const ACCOUNT_NAME = "MAI VAN VIET"; 
        
        // Tạo link ảnh tĩnh trực tiếp từ cổng img.vietqr.io (luôn hiển thị, không sợ lỗi chuỗi)
        const directQrUrl = `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-compact.png?amount=${cleanAmount}&addInfo=${encodeURIComponent(memo)}&accountName=${encodeURIComponent(ACCOUNT_NAME)}`;
        
        // Gán link ảnh tĩnh trực tiếp
        qrImgElement.src = directQrUrl;

        document.getElementById("labelText").innerText = "Đang chờ thanh toán...";
        
        // Xóa interval cũ và delay 3 giây trước khi bắt đầu check real-time để tránh xung đột tải ảnh
        clearInterval(checkInterval);
        setTimeout(() => {
            checkInterval = setInterval(verifyPaymentRealTime, 3000);
        }, 3000);

    } catch (err) {
        console.error("Lỗi tạo QR:", err);
        Swal.close();
        
        // Cơ chế dự phòng khẩn cấp
        document.getElementById("inputForm").style.display = "none";
        document.getElementById("qrSection").style.display = "block";
        document.getElementById("displayAmount").innerText = cleanAmount.toLocaleString("vi-VN") + " đ";
        document.getElementById("orderMemo").innerText = memo;
        
        const BANK_ID = "MB"; 
        const ACCOUNT_NO = "0937551868"; 
        const ACCOUNT_NAME = "MAI VAN VIET"; 
        document.getElementById("qrImage").src = `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-compact.png?amount=${cleanAmount}&addInfo=${encodeURIComponent(memo)}&accountName=${encodeURIComponent(ACCOUNT_NAME)}`;
        document.getElementById("labelText").innerText = "Đang hiển thị mã thanh toán dự phòng...";
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

// Gắn sự kiện click cho nút thanh toán chính
document.getElementById("payBtn").addEventListener("click", generatePaymentQR);

// Kiểm tra nút giả lập thanh toán (nếu có trên giao diện) trước khi gán sự kiện tránh lỗi Console
const testBtn = document.getElementById("testServerPay");
if (testBtn) {
    testBtn.addEventListener("click", () => {
        showSuccessNotification();
    });
}