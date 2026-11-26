# Tes otomatis

Tes memakai layanan Apps Script tiruan (Node.js), jalankan dari folder proyek:

    node tests/test.js apps-script          # bot, API Mini App, penomoran, pengaman data, PDF
    node tests/tes-rapikan.js apps-script   # rapikanSheet dengan Sheets tiruan

Semua harus "ok" tanpa "FAIL" sebelum kode dipasang ke Apps Script. Jumlah tes bertambah seiring
fitur; hitung dengan `node tests/test.js apps-script | grep -c "^ok"`.

Yang dicakup `test.js`, antara lain:
- Mini App: verifikasi tanda tangan Telegram (`initData`), akses, invoice, dan pembayaran.
- Perintah chat: `/invoice`, `/receipt`, `/cek`, `/app`, `/id`.
- Penomoran: bulan dari Tgl invoice, `NOMOR_AWAL`, nomor lama tanpa nol, urutan receipt per kode.
- Pengaman: angka dengan sen (`2.700.000,00`, `1.350.000,-`), PDF gagal terkirim tanpa data dobel,
  jawaban Telegram yang bukan JSON.
- PDF invoice dan receipt.
