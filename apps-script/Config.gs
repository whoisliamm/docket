/**
 * ============================================================
 *  KONFIGURASI DOCKET LITE
 *  Ubah nilai di bawah ini sesuai usaha kamu.
 *  Data rahasia (token bot, dsb.) TIDAK ditulis di sini, tapi di
 *  Project Settings > Script Properties (lihat PANDUAN-PASANG.md).
 * ============================================================
 */
var CONFIG = {
  TZ: 'Asia/Jakarta',

  // Nama usaha, tampil di kop invoice & receipt bila LOGO_BASE64 (Assets.gs) kosong.
  NAMA_USAHA: 'Nama Usaha Kamu',
  JUDUL_BOT: 'Docket Lite',   // judul daftar perintah & producer PDF
  NAMA_BOT: 'Docket',       // dipakai di dalam kalimat
  // Label istilah: LABEL: { proyek: 'Proyek', proyekPanjang: 'Proyek', uangMuka: 'Uang muka', contohProyek: 'Nama proyek' }

  // Kode produk untuk nomor invoice INV-<KODE>-<TAHUN>-<BULAN>-<URUT> dan receipt RCP-<KODE>-...
  // Hanya kode yang terdaftar yang diterima. Pilih per invoice dengan baris "Kode: PRD" di pesan
  // atau pilihan Produk di Mini App; tanpa kode dipakai KODE_DEFAULT.
  PRODUK: {
    JSA: 'Jasa',
    PRD: 'Produk',
    TMB: 'Tambahan'
  },
  KODE_DEFAULT: 'JSA',

  // Nomor urut dibuat otomatis (3 digit: 001, 002, ...). Nomor manual tidak diterima.
  // Untuk melanjutkan nomor yang sudah dibuat di luar bot, isi nomor PERTAMA yang boleh dipakai bot:
  //   NOMOR_AWAL: { 'INV-JSA-2026-12': 6, 'RCP-JSA-2026-12': 4 }
  NOMOR_AWAL: {},

  // Persentase uang muka (DP) yang ditampilkan di invoice.
  DP_PERSEN: 50,

  // Informasi pembayaran di invoice.
  BANK: {
    nama: 'BCA',
    rekening: '1234567890',
    atasNama: 'Nama Pemilik Rekening'
  },
  EMAIL: 'halo@contoh.com',
  WA: '+62 800-0000-0000',

  // Batas pelunasan per kode produk, dicetak di PDF invoice dan receipt yang belum lunas.
  //   { hariSebelumAcara: 14 } -> pelunasan paling lambat 14 hari sebelum tanggal acara/proyek
  //   { teks: '...' }     -> kalimat tetap
  //   null / tidak ada    -> tanpa catatan pelunasan
  PELUNASAN: {
    JSA: { hariSebelumAcara: 14 },
    PRD: { teks: 'saat pesanan selesai' },
    TMB: null
  },

  // Teks catatan.
  CATATAN_RECEIPT_LUNAS: 'Pembayaran telah lunas. Terima kasih atas kepercayaan Anda.',

  // Nama tab di Google Sheets untuk log.
  SHEET_INVOICE: 'Invoice',
  SHEET_PEMBAYARAN: 'Pembayaran',
  SHEET_RIWAYAT: 'Riwayat',
  SHEET_PRODUK: 'Produk',

  // Jumlah baris minimal di tabel item (baris kosong ditambahkan agar rapi).
  MIN_BARIS_ITEM: 5,

  // Receipt disimpan di subfolder per bulan (mis. "2026-11") di dalam folder receipt.
  SUBFOLDER_PER_BULAN: true,

  // ---- Mini App ----
  // Pilihan item cepat di form invoice (harga masih bisa diubah di form).
  PAKET: [
    { nama: 'Paket Desain Logo', harga: 2700000 },
    { nama: 'Revisi Tambahan', harga: 500000 }
  ],
  // Urutan pilihan kode produk di Mini App (harus ada di PRODUK).
  KODE_LIST: ['JSA', 'PRD', 'TMB'],
  // Pilihan metode pembayaran di form receipt.
  METODE: ['Transfer BCA', 'QRIS', 'Tunai'],
  // Masa berlaku sesi Mini App (detik). Setelah lewat, pengguna perlu membuka ulang Mini App.
  MINIAPP_SESI_DETIK: 86400
};

var BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli',
  'Agustus', 'September', 'Oktober', 'November', 'Desember'];
