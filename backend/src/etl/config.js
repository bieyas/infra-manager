/**
 * ETL Pipeline Configuration
 * Konfigurasi sumber API external dan opsi pipeline
 */

export default {
  // ── API External Sources ───────────────────────────────────────────────────
  sources: [
    {
      id:      'billing_main',
      name:    'Billing Aufamedia (Home)',
      enabled: true,

      // Endpoint API external
      url:     process.env.BILLING_API_URL || 'https://bill.aufamedia.my.id/pelanggan/home/ambildata',
      method:  'GET',

      // Auth: 'none' | 'bearer' | 'basic' | 'apikey' | 'cookie_login'
      // Billing ini pakai cookie-based JWT — login dulu, simpan cookie accessToken
      auth: {
        type:          'cookie_login',
        loginUrl:      process.env.BILLING_LOGIN_URL  || 'https://bill.aufamedia.my.id/login',
        loginPayload:  `user=${process.env.BILLING_USERNAME || 'basuki'}&password=${process.env.BILLING_PASSWORD || '12345'}`,
        cookieName:    'accessToken',
      },

      // Query params tambahan ke request
      params: {
        sortBy:    'namaPelanggan',
        sortOrder: 'asc',
        jenis:     'Home',
        search:    '',
      },

      // Pagination: 'none' | 'page' | 'offset' | 'cursor'
      // API ini support limit besar (limit=1000 dapat semua 597 record sekaligus)
      pagination: {
        type:      'page',
        pageParam: 'page',
        sizeParam: 'limit',
        pageSize:  1000,
        dataPath:  'data',
        totalPath: 'totalItems',
      },

      // Timeout request dalam ms
      timeoutMs: 30_000,

      // Retry jika gagal
      retry: { times: 3, delayMs: 2_000 },
    },

    // Tambah source lain di sini jika perlu:
    // {
    //   id:   'billing_business',
    //   name: 'Billing Aufamedia (Bisnis)',
    //   url:  'https://bill.aufamedia.my.id/pelanggan/home/ambildata',
    //   params: { jenis: 'Bisnis', ... },
    //   ...
    // },
  ],

  // ── Raw Storage ────────────────────────────────────────────────────────────
  storage: {
    // Folder penyimpanan raw JSON hasil fetch (relatif dari project root)
    rawDir: process.env.ETL_RAW_DIR || './data/etl-raw',
    // Berapa hari raw file disimpan sebelum dihapus (0 = tidak dihapus)
    retentionDays: 30,
  },

  // ── Import Behavior ────────────────────────────────────────────────────────
  import: {
    // 'upsert' = update jika ada, insert jika baru (berdasarkan customerId)
    // 'insert_only' = skip jika sudah ada
    // 'replace' = hapus semua lalu insert ulang (HATI-HATI)
    mode: 'upsert',

    // Batch size untuk upsert ke DB
    batchSize: 50,

    // Field unik untuk menentukan duplikat
    uniqueKey: 'customerId',

    // Jika true, update customer yang sudah ada di DB; jika false, hanya insert baru
    updateExisting: true,

    // Dry run: jika true, jalankan pipeline tapi tidak simpan ke DB
    dryRun: false,
  },

  // ── Mapping Field ──────────────────────────────────────────────────────────
  // Definisikan mapping dari field API external → field Customer di DB
  // Value bisa: string (field path), atau null (tidak dimapping/diisi manual di parser)
  // ── Field mapping dari API billing Aufamedia ────────────────────────────────
  // Format record dari API:
  // { id, kode, namaPelanggan, alamat, idPelanggan, telp, tikor, paket, kode_unik }
  //
  // Field 'tikor' (titik koordinat) bisa berupa:
  //   "-7.522, 112.230"  → lat/lng langsung
  //   "https://maps.app.goo.gl/..." → URL Google Maps (perlu resolve manual)
  fieldMap: {
    customerId:    'idPelanggan',      // WAJIB: "02400612" — ID unik pelanggan
    name:          'namaPelanggan',    // Nama lengkap
    phone:         'telp',             // Nomor telepon/HP
    address:       'alamat',           // Alamat
    lat:           null,               // Diekstrak dari 'tikor' di parser
    lng:           null,               // Diekstrak dari 'tikor' di parser
    onuSn:         null,               // Tidak ada di billing
    onuIndex:      null,
    packageName:   'paket',            // "15 Mbps Shared"
    packageSpeed:  null,               // Diekstrak dari 'paket' di parser (angka pertama)
    vlan:          null,
    ipAddress:     null,
    pppoeUsername: 'kode_unik',        // kode_unik dipakai sebagai username PPPoE
    installerName: null,
    installDate:   null,
    serviceStatus: null,               // Default ACTIVE (tidak ada field status di billing)
    notes:         null,               // Diisi di parser: kode wilayah + tikor mentah jika tidak bisa di-parse
    // ODP resolve: tidak ada di billing, perlu mapping manual
    _odpRef:       null,
    _odpPort:      null,
    // Field tambahan billing (disimpan ke notes atau diabaikan)
    _kode:         'kode',             // Kode wilayah (AN, RO, SY, dll)
    _tikor:        'tikor',            // Raw titik koordinat (untuk ekstraksi lat/lng)
  },
}
