import os
import re
import requests
import tempfile
from pymongo import MongoClient
from urllib.parse import urljoin
from docx import Document
import fitz  # PyMuPDF
import google.generativeai as genai
import json  # thêm nếu chưa có
# Config
COMPANY_LIST_API = "https://internship.cse.hcmut.edu.vn/home/company/all"
COMPANY_DETAIL_API = "https://internship.cse.hcmut.edu.vn/home/company/id/"
FILE_BASE_URL = "https://internship.cse.hcmut.edu.vn"

MONGO_URI = "mongodb+srv://tk:mk@internshipchecker.ot63gpv.mongodb.net/"
DB_NAME = "InternshipChecker"
COLLECTION_NAME = "Company"

GEMINI_API_KEY = ""

# Gemini setup
genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-2.5-flash-preview-05-20')

def get_all_companies():
    try:
        response = requests.get(COMPANY_LIST_API)
        response.raise_for_status()
        return response.json().get("items", [])
    except Exception as e:
        print(f"Error fetching company list: {e}")
        return []

def get_company_details(company_id):
    try:
        response = requests.get(urljoin(COMPANY_DETAIL_API, company_id))
        response.raise_for_status()
        return response.json().get("item", {})
    except Exception as e:
        print(f"Error fetching details for company {company_id}: {e}")
        return {}

def download_file(file_path):
    if not file_path:
        return None
    try:
        file_url = urljoin(FILE_BASE_URL, file_path)
        response = requests.get(file_url)
        response.raise_for_status()
        suffix = ".pdf" if file_path.lower().endswith(".pdf") else ".docx"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(response.content)
            return tmp.name
    except Exception as e:
        print(f"Failed to download file {file_path}: {e}")
        return None

def read_docx(file_path):
    try:
        doc = Document(file_path)
        return "\n".join([p.text for p in doc.paragraphs])
    except Exception as e:
        print(f"Failed to read DOCX file: {e}")
        return ""

def read_pdf(file_path):
    try:
        doc = fitz.open(file_path)
        text = "\n".join([page.get_text() for page in doc])
        return text
    except Exception as e:
        print(f"Failed to read PDF file: {e}")
        return ""

def extract_gpa_value(text):
    patterns = [
        r"GPA\s*(?:minimum|requirement|of|:)?\s*([0-9.]+)\s*(?:/|\s)?\s*([0-9.]+)?",
        r"([0-9.]+)\s*(?:/|\s)?\s*([0-9.]+)?\s*GPA",
        r"GPA\s*≥\s*([0-9.]+)"
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            value = float(match.group(1))
            scale = float(match.group(2)) if match.lastindex == 2 and match.group(2) else None
            if scale:
                return f"{value}/{scale}"
            return f"{value}/4" if value <= 4 else f"{value}/10"
    return "0"
def get_preferred_file_path(details):
    files = details.get("internshipFiles", [])
    if files:
        # Ưu tiên .docx
        for file in files:
            if file["path"].lower().endswith(".docx"):
                return file["path"]
        # Nếu không có .docx, lấy file .pdf đầu tiên
        for file in files:
            if file["path"].lower().endswith(".pdf"):
                return file["path"]
    # Nếu không có trong internshipFiles, dùng internshipFile
    return details.get("internshipFile")

def analyze_document_with_gemini(text):
    prompt = f"""
    You are a strict JSON generator. Based on the content below, respond with a strict JSON format only:
    Based on the content below, determine the following:
    1. Is CV required? (true/false)
    2. Is transcript required? (true/false)
    3. GPA requirement (give sentence or 0)
    Note: the CV and transcript requirements are usually at "HỒ SƠ, PHỎNG VÁN, LIÊN HỆ (DN tự nhận và xử lý hồ sơ):"
    Content:
    {text}
   
    only Respond in JSON:
    {{
      "isCV": true/false,
      "isTranscript": true/false,
      "GPA": string (or "0" if not found)
    }}
    """
    try:
        response = model.generate_content(prompt)
        json_text = response.text.strip()

        # ✅ Loại bỏ markdown formatting nếu có
        if json_text.startswith("```json"):
            json_text = json_text[7:]  # loại bỏ ```json\n
        if json_text.endswith("```"):
            json_text = json_text[:-3]  # loại bỏ \n```

        json_text = json_text.strip()

        result = json.loads(json_text)
        result["GPA"] = extract_gpa_value(result.get("GPA", "0"))
        return result
    except Exception as e:
        print(f"Could not parse Gemini response: {e}")
        print(f"Raw response: {response.text.strip()}")
        return {"isCV": False, "isTranscript": False, "GPA": "0"}

def process_companies():
    client = MongoClient(MONGO_URI)
    db = client[DB_NAME]
    collection = db[COLLECTION_NAME]

    companies = get_all_companies()
    print(f"Found {len(companies)} companies to process")

    for i, company in enumerate(companies, 1):
        company_id = company.get("_id")
        shortname = company.get("shortname")
        fullname = company.get("fullname")
        print(f"\nProcessing company {i}/{len(companies)}: {shortname} ({company_id})")

        if collection.find_one({"companyid": company_id}):
            print("Already exists in DB, skipping...")
            continue

        details = get_company_details(company_id)
        if not details:
            continue

        internship_files = details.get("internshipFiles", [])
        file_path = get_preferred_file_path(details)


        requirements = {"isCV": False, "isTranscript": False, "GPA": "0"}

        if file_path:
            local_file = download_file(file_path)
            if local_file:
                print(f"Analyzing document: {os.path.basename(local_file)}")
                ext = os.path.splitext(local_file)[1].lower()
                content = read_docx(local_file) if ext == ".docx" else read_pdf(local_file)
                if content:
                    requirements = analyze_document_with_gemini(content)
                os.remove(local_file)
        else:
            print("No internship file provided")

        company_data = {
            "companyid": company_id,
            "companyname": fullname,
            "shortname": shortname,
            **requirements
        }

        try:
            collection.insert_one(company_data)
            print(f"✅ Saved {shortname} to DB | CV={requirements['isCV']}, Transcript={requirements['isTranscript']}, GPA={requirements['GPA']}")
        except Exception as e:
            print(f"Error saving to MongoDB: {e}")

    client.close()
    print("\n✅ Processing complete!")

if __name__ == "__main__":
    process_companies()
