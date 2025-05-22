const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://internship.cse.hcmut.edu.vn/home/company';
const CACHE_FILE = "companies.json";
const CACHE_EXPIRE_HOURS = 5;

async function saveToJsonFile(data) {
    try {
        const filePath = path.join(__dirname, CACHE_FILE);
        const jsonData = JSON.stringify({
            ...data,
            lastUpdated: new Date().toISOString()
        }, null, 2);
        
        await fs.promises.writeFile(filePath, jsonData, 'utf8');
        return true;
    } catch (error) {
        console.error("Lỗi khi lưu file:", error);
        return false;
    }
}

async function readFromJsonFile() {
    try {
        const filePath = path.join(__dirname, CACHE_FILE);
        
        if (!fs.existsSync(filePath)) {
            return null;
        }
        
        const jsonData = await fs.promises.readFile(filePath, 'utf8');
        return JSON.parse(jsonData);
    } catch (error) {
        console.error("Lỗi khi đọc file cache:", error);
        return null;
    }
}

async function getAllCompanies() {
    try {
        const url = `${BASE_URL}/all?nocache=${Math.random()}`;
        const response = await axios.get(url);
        return response.data.items || [];
    } catch (error) {
        console.error("Lỗi khi lấy danh sách công ty:", error);
        return [];
    }
}

async function getCompanyDetail(id) {
    try {
        const url = `${BASE_URL}/id/${id}?nocache=${Math.random()}`;
        const response = await axios.get(url);
        return response.data.item || null;
    } catch (error) {
        console.error(`Lỗi khi lấy chi tiết công ty ${id}:`, error);
        return null;
    }
}

async function calculateAcceptanceRatio(companyDetails) {
    let totalStudentAccepted = 0;
    let totalMaxAcceptedStudent = 0;
    let totalStudentRegister = 0;
    let totalMaxRegister = 0;
    let validCompanyCount = 0;

    companyDetails.forEach(detail => {
        if (detail && 
            detail.studentAccepted !== undefined && 
            detail.maxAcceptedStudent !== undefined) {
            
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
        totalCompanies: companyDetails.length,
        validCompanyCount,
        totalStudentAccepted,
        totalMaxAcceptedStudent,
        totalStudentRegister,
        totalMaxRegister,
        acceptanceRatio: acceptanceRatio.toFixed(4),
        registerRatio: registerRatio.toFixed(4),
        acceptancePercentage: `${(acceptanceRatio * 100).toFixed(2)}%`,
        registerPercentage: `${(registerRatio * 100).toFixed(2)}%`,
        summary: `Tổng số công ty: ${companyDetails.length} | Tỷ lệ chấp nhận: ${(acceptanceRatio * 100).toFixed(2)}% | Tỷ lệ đăng ký: ${(registerRatio * 100).toFixed(2)}%`
    };
}

async function fetchAllCompaniesData() {
    try {
        const companies = await getAllCompanies();
        if (!companies || companies.length === 0) {
            throw new Error("Không có dữ liệu công ty");
        }

        // Lấy chi tiết tất cả công ty song song
        const companyDetailPromises = companies.map(company => 
            getCompanyDetail(company._id)
        );
        const companyDetails = await Promise.all(companyDetailPromises);

        // Phân loại công ty còn slot
        const availableCompanies = [];
        const allCompaniesDetails = [];

        companyDetails.forEach(detail => {
            if (!detail) return;

            const companyInfo = {
                fullname: detail.fullname,
                shortname: detail.shortname,
                registerInfo: `${detail.studentRegister}/${detail.maxRegister}`,
                acceptanceInfo: `${detail.studentAccepted}/${detail.maxAcceptedStudent}`,
                isAvailable: detail.studentAccepted < detail.maxAcceptedStudent
            };

            allCompaniesDetails.push(companyInfo);
            
            if (companyInfo.isAvailable) {
                availableCompanies.push(companyInfo);
            }
        });

        // Tính toán thống kê
        const acceptanceStats = await calculateAcceptanceRatio(companyDetails);

        return {
            availableCompanies,
            allCompaniesDetails,
            acceptanceStats,
            lastUpdated: new Date().toISOString()
        };
    } catch (error) {
        console.error("Lỗi khi lấy dữ liệu công ty:", error);
        throw error;
    }
}

exports.handler = async () => {
    try {
        // Kiểm tra cache
        const cachedData = await readFromJsonFile();
        
        if (cachedData) {
            const lastUpdated = new Date(cachedData.lastUpdated);
            const now = new Date();
            const diffHours = (now - lastUpdated) / (1000 * 60 * 60);
            
            if (diffHours < CACHE_EXPIRE_HOURS) {
                console.log("Sử dụng dữ liệu từ cache");
                return {
                    statusCode: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*'
                    },
                    body: JSON.stringify(cachedData)
                };
            }
        }

       // Lấy dữ liệu mới nếu cache hết hạn hoặc không có
console.log("Lấy dữ liệu mới từ API");
const freshData = await fetchAllCompaniesData();

// Trả về response ngay lập tức
const response = {
    statusCode: 200,
    headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify(freshData)
};

// Lưu cache sau khi đã trả về response (không cần await)
saveToJsonFile(freshData)
    .then(() => console.log("Đã lưu cache thành công (background)"))
    .catch(err => console.error("Lỗi khi lưu cache (background):", err));

return response;

    } catch (error) {
        console.error("Lỗi handler:", error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                success: false,
                error: "Internal Server Error",
                message: error.message
            })
        };
    }
};