const express = require('express');
const axios = require('axios');
const app = express();
const PORT = process.env.PORT || 3000;

const BASE_URL = 'https://internship.cse.hcmut.edu.vn/home/company';

// Middleware để xử lý CORS và JSON
app.use(express.json());
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
});

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

// Hàm tính tỷ lệ studentAccepted / maxAcceptedStudent (gọi song song)
async function calculateAcceptanceRatio() {
    try {
        const allCompanies = await getAllCompanies();
        if (!allCompanies || allCompanies.length === 0) {
            return {
                error: "Không có dữ liệu công ty"
            };
        }

        const companyDetailPromises = allCompanies.map(company => {
            return getCompanyDetail(company._id);
        });

        const companyDetails = await Promise.all(companyDetailPromises);

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

        const acceptanceRatio = totalMaxAcceptedStudent > 0 
            ? totalStudentAccepted / totalMaxAcceptedStudent 
            : 0;
        const registerRatio = totalMaxRegister > 0
            ? totalStudentRegister / totalMaxRegister
            : 0;

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

// Endpoint chính
app.get('/api/companies', async (req, res) => {
    try {
        const companies = await getAllCompanies();
        const availableCompanies = [];
        const allCompaniesDetails = [];

        const acceptanceStats = await calculateAcceptanceRatio();

        for (const company of companies) {
            const detail = await getCompanyDetail(company._id);
            if (detail) {
                const { studentRegister, maxRegister, studentAccepted, maxAcceptedStudent, fullname, shortname } = detail;
                
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

        res.json({
            success: true,
            availableCompanies,
            allCompaniesDetails,
            acceptanceStats,
            lastUpdated: new Date().toISOString()
        });

    } catch (error) {
        console.error("Lỗi handler:", error);
        res.status(500).json({
            success: false,
            error: "Internal Server Error"
        });
    }
});

// Endpoint kiểm tra hoạt động
app.get('/', (req, res) => {
    res.send('Server đang hoạt động. Truy cập /api/companies để lấy dữ liệu.');
});

// Khởi động server
app.listen(PORT, () => {
    console.log(`Server đang chạy trên port ${PORT}`);
});