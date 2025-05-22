const axios = require('axios');
const BASE_URL = 'https://internship.cse.hcmut.edu.vn/home/company';

// Hàm lấy tất cả công ty (giữ nguyên)
async function getAllCompanies() {
    const url = `${BASE_URL}/all?nocache=${Math.random()}`;
    const response = await axios.get(url);
    return response.data.items || [];
}

// Hàm lấy chi tiết công ty (giữ nguyên)
async function getCompanyDetail(id) {
    const url = `${BASE_URL}/id/${id}?nocache=${Math.random()}`;
    const response = await axios.get(url);
    return response.data.item || null;
}

// Hàm mới: Tính tỷ lệ studentAccepted / maxAcceptedStudent (gọi song song)
async function calculateAcceptanceRatio() {
    try {
        // Bước 1: Lấy danh sách tất cả công ty
        const allCompanies = await getAllCompanies();
        if (!allCompanies || allCompanies.length === 0) {
            return {
                error: "Không có dữ liệu công ty"
            };
        }

        // Bước 2: Tạo mảng các promise gọi API chi tiết công ty (song song)
        const companyDetailPromises = allCompanies.map(company => {
            return getCompanyDetail(company._id);
        });

        // Bước 3: Đợi tất cả promise hoàn thành
        const companyDetails = await Promise.all(companyDetailPromises);

        // Bước 4: Tính tổng studentAccepted và maxAcceptedStudent
        let totalStudentAccepted = 0;
        let totalMaxAcceptedStudent = 0;
        let totalStudentRegister = 0;
        let totalMaxRegister = 0;
        let validCompanyCount = 0;

        companyDetails.forEach(detail => {
            if (detail && detail.studentAccepted !== undefined && detail.maxAcceptedStudent !== undefined) {
                totalStudentAccepted += detail.studentAccepted;
                totalMaxAcceptedStudent += detail.maxAcceptedStudent;
                totalStudentRegister += detail.studentRegister || 0;
                totalMaxRegister += detail.maxRegister || 0;
                validCompanyCount++;
            }
        });

        // Bước 5: Tính toán tỷ lệ
        const acceptanceRatio = totalMaxAcceptedStudent > 0 
            ? totalStudentAccepted / totalMaxAcceptedStudent 
            : 0;
        const registerRatio = totalMaxRegister > 0
            ? totalStudentRegister / totalMaxRegister
            : 0;

        // Bước 6: Trả kết quả chi tiết
        return {
            totalCompanies: allCompanies.length,
            validCompanyCount,
            totalStudentAccepted,
            totalMaxAcceptedStudent,
            totalStudentRegister,
            totalMaxRegister,
            acceptanceRatio: acceptanceRatio.toFixed(4),
            registerRatio: registerRatio.toFixed(4),
            acceptancePercentage: `${(acceptanceRatio * 100).toFixed(2)}%`,
            registerPercentage: `${(registerRatio * 100).toFixed(2)}%`,
            summary: `Tổng số công ty: ${allCompanies.length} | Tỷ lệ chấp nhận: ${(acceptanceRatio * 100).toFixed(2)}% | Tỷ lệ đăng ký: ${(registerRatio * 100).toFixed(2)}%`
        };

    } catch (error) {
        console.error("Lỗi khi tính tỷ lệ:", error);
        return {
            error: "Có lỗi xảy ra khi tính tỷ lệ",
            details: error.message
        };
    }
}

// Handler chính (đã sửa để trả thêm thông tin)
exports.handler = async () => {
    try {
        // Lấy danh sách công ty còn slot
        const companies = await getAllCompanies();
        const availableCompanies = [];
        const allCompaniesDetails = [];

        // Lấy thống kê tỷ lệ (sử dụng hàm mới)
        const acceptanceStats = await calculateAcceptanceRatio();

        // Kiểm tra công ty còn slot và thu thập thông tin chi tiết
        for (const company of companies) {
            const detail = await getCompanyDetail(company._id);
            if (detail) {
                const { studentRegister, maxRegister, studentAccepted, maxAcceptedStudent, fullname, shortname } = detail;
                
                // Thêm thông tin chi tiết công ty vào mảng
                allCompaniesDetails.push({
                    fullname,
                    shortname,
                    registerInfo: `${studentRegister}/${maxRegister}`,
                    acceptanceInfo: `${studentAccepted}/${maxAcceptedStudent}`,
                    isAvailable: studentAccepted < maxAcceptedStudent
                });
                
                if (studentAccepted < maxAcceptedStudent) {
                    availableCompanies.push({ 
                        fullname, 
                        shortname,
                        registerInfo: `${studentRegister}/${maxRegister}`,
                        acceptanceInfo: `${studentAccepted}/${maxAcceptedStudent}`
                    });
                }
            }
        }

        // Trả về kết quả đầy đủ
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            },
            body: JSON.stringify({
                success: true,
                availableCompanies,
                allCompaniesDetails,
                acceptanceStats,
                lastUpdated: new Date().toISOString()
            }),
        };

    } catch (error) {
        console.error("Lỗi handler:", error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({
                success: false,
                error: "Internal Server Error"
            }),
        };
    }
};