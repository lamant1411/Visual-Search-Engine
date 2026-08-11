import json
import glob
from pathlib import Path


OCR_MAPPING = {
    "STOP": "ảnh có chữ STOP",
    "OPEN": "ảnh có chữ OPEN",
    "SCHOOL": "tìm chữ SCHOOL",
    "COFFEE": "tìm chữ COFFEE",
    "SALE": "ảnh có chữ SALE",
    "HOTEL": "tìm chữ HOTEL",
    "CAFE": "tìm chữ CAFE",
    "BEER": "tìm chữ BEER",
    "FOOD": "tìm chữ FOOD",
    "POLICE": "tìm chữ POLICE",
    "STREET": "tìm chữ STREET",
    "Nhím": "ảnh có chữ Nhím",
    "ĐƯỜNG": "ảnh có chữ ĐƯỜNG",
    "SÀI GÒN": "ảnh chứa text SÀI GÒN",
    "HUẾ": "ảnh chứa text HUẾ"
}

def update_json_file(file_path):
    path = Path(file_path)
    if not path.is_file():
        return
        
    with open(path, "r", encoding="utf-8") as f:
        try:
            data = json.load(f)
        except json.JSONDecodeError:
            print(f"Bỏ qua (không phải JSON hợp lệ): {file_path}")
            return

    changed = False

    if "queries" in data:
        for q in data["queries"]:
            if q.get("mode") == "ocr":
                old_query = q.get("query")
                if old_query in OCR_MAPPING:
                    q["query"] = OCR_MAPPING[old_query]
                    changed = True

    if "manual_checks" in data:
        for check in data["manual_checks"]:
            if check.get("id") == "three-modes-ui":
                new_desc = "Unified text search bar correctly handles both Semantic and explicit OCR queries, alongside Image search."
                if check.get("description") != new_desc:
                    check["description"] = new_desc
                    changed = True

    if changed:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"Đã cập nhật: {file_path}")

if __name__ == "__main__":
    json_files = glob.glob("**/*.json", recursive=True)
    for file in json_files:
        if "package" in file or "tsconfig" in file:
            continue
        update_json_file(file)
    print("Hoàn tất cập nhật các file JSON!")