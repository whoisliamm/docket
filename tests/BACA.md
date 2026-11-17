# Tes otomatis

Tes memakai layanan Apps Script tiruan (Node.js), jalankan dari folder proyek:

    node tests/test.js apps-script          # 198 tes: bot, API Mini App, penomoran, pengingat, akses, requestId
    node tests/tes-rapikan.js apps-script   # rapikanSheet & tab Ringkasan dengan Sheets tiruan

Semua harus "ok" tanpa "FAIL" sebelum kode dipasang ke Apps Script.
