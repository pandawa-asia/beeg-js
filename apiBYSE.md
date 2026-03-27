# Dokumentasi API Byse

Platform otomasi untuk mengunggah, melacak kinerja, dan mengelola pustaka video dengan endpoint REST yang stabil.

**Base URL:** `https://api.byse.sx`

**Total Endpoint:** 28 endpoint dalam 11 kategori

---

## 🔐 Otorisasi

Setiap permintaan memerlukan autentikasi menggunakan:
- Header kunci API, atau
- Parameter query `key`

---

## 📋 Daftar Kategori Endpoint

1. [Akun](#akun) - 2 endpoint
2. [Upload](#upload) - 2 endpoint
3. [Upload Jarak Jauh](#upload-jarak-jauh) - 3 endpoint
4. [File](#file) - 4 endpoint
5. [Folder](#folder) - 2 endpoint
6. [Berkas (Audit)](#berkas-audit) - 2 endpoint
7. [Player](#player) - 4 endpoint
8. [Encoding](#encoding) - 4 endpoint
9. [Thumbnail](#thumbnail) - 3 endpoint
10. [Embed Domain](#embed-domain) - 1 endpoint
11. [Bandwidth Premium](#bandwidth-premium) - 1 endpoint

---

## 📊 Akun

### 1. Informasi Akun
Mendapatkan metadata akun termasuk kuota dan status premium.

**Endpoint:** `GET /account/info`

**Parameter:**
| Nama | Deskripsi | Contoh | Tipe | Wajib |
|------|-----------|---------|------|-------|
| key | Kunci API | 1l5ftrilhllgwx2bo | STRING | ✅ |

**Response:**
```json
{
  "msg": "OK",
  "server_time": "2017-08-11 04:30:07",
  "status": 200,
  "result": {
    "email": "myemail@gmail.com",
    "balance": "0.00000",
    "storage_used": "24186265",
    "storage_left": 128824832615,
    "premim_expire": "2015-10-24 21:00:00"
  }
}
```

---

### 2. Statistik Akun
Mendapatkan metrik performa seperti unduhan, keuntungan, dan referral.

**Endpoint:** `GET /account/stats`

**Parameter:**
| Nama | Deskripsi | Contoh | Tipe | Wajib |
|------|-----------|---------|------|-------|
| key | Kunci API | 1l5ftrilhllgwx2bo | STRING | ✅ |
| last | Tampilkan statistik X hari terakhir (default: 7) | 14 | STRING | ❌ |

**Response:**
```json
{
  "msg": "OK",
  "server_time": "2017-08-11 04:30:07",
  "status": 200,
  "result": [
    {
      "downloads": "0",
      "profit_views": "0.00000",
      "views_adb": "1",
      "sales": "0",
      "profit_sales": "0.00000",
      "profit_refs": "0.00000",
      "profit_site": "0.00000",
      "views": "0",
      "refs": "0",
      "day": "2017-09-12",
      "profit_total": "0.00000",
      "views_prem": "0"
    }
  ]
}
```

---

## 📤 Upload

### 1. Dapatkan Server Upload
Mendapatkan endpoint upload optimal untuk akun.

**Endpoint:** `GET /upload/server`

**Parameter:**
| Nama | Deskripsi | Contoh | Tipe | Wajib |
|------|-----------|---------|------|-------|
| key | Kunci API | 1l5ftrilhllgwx2bo | STRING | ✅ |

**Response:**
```json
{
  "msg": "OK",
  "server_time": "2021-08-11 04:29:54",
  "status": 200,
  "result": "https://s1.myvideo.com/upload/01"
}
```

---

### 2. Upload ke Server
Upload file video ke server yang telah ditentukan.

**Endpoint:** `POST https://moon-upload-server-01.filemoon.to/upload/01`

**Parameter:**
| Nama | Deskripsi | Contoh | Tipe | Wajib |
|------|-----------|---------|------|-------|
| key | Kunci API | 1l5ftrilhllgwx2bo | STRING | ✅ |
| file | File video untuk diupload | xxxx.mp4 | FILE | ✅ |

**Response:**
```json
{
  "msg": "OK",
  "status": 200,
  "files": [
    {
      "filecode": "tnklyibwwpsh",
      "filename": "qwbs4m4ze4j4.mp4",
      "status": "OK"
    }
  ]
}
```

---

## 🌐 Upload Jarak Jauh

### 1. Tambah Upload Jarak Jauh
Menambahkan URL video ke antrian download jarak jauh.

**Endpoint:** `GET /remote/add`

**Parameter:**
| Nama | Deskripsi | Contoh | Tipe | Wajib |
|------|-----------|---------|------|-------|
| key | Kunci API | 1l5ftrilhllgwx2bo | STRING | ✅ |
| url | URL file video sumber | http://site.com/v.mkv | STRING | ❌ |

**Response:**
```json
{
  "msg": "OK",
  "server_time": "2017-08-11 04:29:54",
  "status": 200,
  "result": {
    "filecode": "jthi5jdsu8t9"
  }
}
```

---

### 2. Hapus Upload Jarak Jauh
Membatalkan upload jarak jauh yang sedang dalam antrian.

**Endpoint:** `GET /remote/remove`

**Parameter:**
| Nama | Deskripsi | Contoh | Tipe | Wajib |
|------|-----------|---------|------|-------|
| key | Kunci API | 1l5ftrilhllgwx2bo | STRING | ✅ |
| file_code | Kode file yang akan dibatalkan | af12cxzbr23143 | STRING | ✅ |

**Response:**
```json
{
  "msg": "File succesfully removed from remote upload queue",
  "server_time": "2017-08-11 04:29:54",
  "status": 200
}
```

---

### 3. Cek Status Upload Jarak Jauh
Memeriksa progress dan status upload jarak jauh.

**Endpoint:** `GET /remote/status`

**Parameter:**
| Nama | Deskripsi | Contoh | Tipe | Wajib |
|------|-----------|---------|------|-------|
| key | Kunci API | 1l5ftrilhllgwx2bo | STRING | ✅ |
| file_code | Kode file | af12cxzbr23143 | STRING | ✅ |

**Response:**
```json
{
  "msg": "OK",
  "server_time": "2017-08-11 04:29:54",
  "status": 200,
  "result": {
    "url": "https://exampleurl.com/file.mp4",
    "progress": "55%",
    "status": "WORKING",
    "created": "10:00:00 09-06-2022",
    "updated": "10:01:00 09-06-2022",
    "error_msg": ""
  }
}
```

---

## 📁 File

### 1. Informasi File
Mendapatkan metadata detail untuk satu atau beberapa file.

**Endpoint:** `GET /file/info`

**Parameter:**
| Nama | Deskripsi | Contoh | Tipe | Wajib |
|------|-----------|---------|------|-------|
| key | Kunci API | 1l5ftrilhllgwx2bo | STRING | ✅ |
| file_code | Kode file (bisa dipisah koma untuk multiple) | gi4o0tlro01u,gi4o0tlro012 | STRING | ✅ |

**Response:**
```json
{
  "msg": "OK",
  "server_time": "2017-08-11 04:28:53",
  "status": 200,
  "result": [
    {
      "status": 200,
      "file_code": "gi4o0tlro01u",
      "name": "4K Time Lapse in the EOS 6D Mark II",
      "canplay": 1,
      "views_started": "1",
      "views": "0",
      "length": "20",
      "uploaded": "2017-08-10 05:07:17"
    }
  ]
}
```

---

### 2. Daftar File
Menampilkan daftar file dengan berbagai filter.

**Endpoint:** `GET /file/list`

**Parameter:**
| Nama | Deskripsi | Contoh | Tipe | Wajib |
|------|-----------|---------|------|-------|
| key | Kunci API | 1l5ftrilhllgwx2bo | STRING | ✅ |
| fld_id | ID folder (default: 0/root) | 25 | INT | ❌ |
| title | Filter berdasarkan judul | Iron Man | STRING | ❌ |
| created | Filter berdasarkan waktu upload | 21 Juni 2018 05:07:10 | STRING | ❌ |
| public | 1 = public, 0 = private | 1 | INT | ❌ |
| per_page | Jumlah hasil per halaman | 20 | INT | ❌ |
| page | Nomor halaman | 2 | INT | ❌ |

---

### 3. Clone File
Menduplikasi file ke akun saat ini (jika fitur clone aktif).

**Endpoint:** `GET /file/clone`

**Parameter:**
| Nama | Deskripsi | Contoh | Tipe | Wajib |
|------|-----------|---------|------|-------|
| key | Kunci API | 1l5ftrilhllgwx2bo | STRING | ✅ |
| file_code | Kode file yang akan di-clone | gi4o0tlro01u | STRING | ✅ |

**Response:**
```json
{
  "msg": "OK",
  "server_time": "2017-08-11 04:28:53",
  "status": 200,
  "result": {
    "file_code": "gtl2mhgw4is7",
    "url": "https://api.byse.sx/d/gtl2mhgw4is7"
  }
}
```

---

### 4. Pindah File ke Folder
Memindahkan file ke folder tertentu.

**Endpoint:** `GET /file/clone?key={key}&file_code={file_code}&fld_id={fld_id}`

**Parameter:**
| Nama | Deskripsi | Contoh | Tipe | Wajib |
|------|-----------|---------|------|-------|
| key | Kunci API | 1l5ftrilhllgwx2bo | STRING | ✅ |
| file_code | Kode file | gi4o0tlro01u | STRING | ✅ |
| fld_id | ID folder tujuan | 15 | INT | ✅ |

---

## 📂 Folder

### 1. Daftar Folder
Menampilkan folder dan file di dalamnya.

**Endpoint:** `GET /folder/list`

**Parameter:**
| Nama | Deskripsi | Contoh | Tipe | Wajib |
|------|-----------|---------|------|-------|
| key | Kunci API | 1l5ftrilhllgwx2bo | STRING | ✅ |
| fld_id | ID folder parent (default: 0) | 25 | INT | ❌ |
| files | Set 1 untuk include daftar file | 1 | INT | ❌ |

---

### 2. Buat Folder
Membuat folder baru.

**Endpoint:** `GET /folder/create`

**Parameter:**
| Nama | Deskripsi | Contoh | Tipe | Wajib |
|------|-----------|---------|------|-------|
| key | Kunci API | 1l5ftrilhllgwx2bo | STRING | ✅ |
| name | Nama folder | Video Baru | STRING | ✅ |
| parent_id | ID folder parent (0 = root) | 0 | INT | ❌ |
| description | Deskripsi folder | barang baru | STRING | ❌ |

**Response:**
```json
{
  "msg": "OK",
  "server_time": "2021-08-18 20:32:46",
  "status": 200,
  "result": {
    "fld_id": "29"
  }
}
```

---

## 🗑️ Berkas (Audit)

### 1. File yang Dihapus
Mendapatkan daftar file yang baru dihapus.

**Endpoint:** `GET /files/deleted`

**Parameter:**
| Nama | Deskripsi | Contoh | Tipe | Wajib |
|------|-----------|---------|------|-------|
| key | Kunci API | 1l5ftrilhllgwx2bo | STRING | ✅ |
| last | Limit jumlah file | 20 | INT | ❌ |

---

### 2. File DMCA
Mendapatkan file yang dalam antrian penghapusan DMCA.

**Endpoint:** `GET /files/dmca`

**Parameter:**
| Nama | Deskripsi | Contoh | Tipe | Wajib |
|------|-----------|---------|------|-------|
| key | Kunci API | 1l5ftrilhllgwx2bo | STRING | ✅ |
| last | Limit jumlah laporan | 20 | INT | ❌ |

---

## 🎬 Player

### 1. Subtitle Jarak Jauh
Menambahkan subtitle VTT ke embed player.

**Endpoint:** `GET /e/{file_code}?cX_file={url}&cX_label={label}`

**Parameter:**
| Nama | Deskripsi | Contoh | Tipe | Wajib |
|------|-----------|---------|------|-------|
| cX_file | URL file subtitle (c1_file, c2_file, dst) | https://example.com/file.vtt | STRING | ✅ |
| cX_label | Label subtitle (c1_label, c2_label, dst) | English | STRING | ✅ |

---

### 2. Subtitle JSON Remote
Memuat multiple subtitle dari file JSON.

**Endpoint:** `GET /e/{file_code}?sub.info=http://yoursubtitle.com/def.json`

**Format JSON:**
```json
[
  {
    "src": "http://yoursubtitle.com/file.vtt",
    "label": "Language1",
    "default": true
  },
  {
    "src": "http://yoursubtitle.com/file2.vtt",
    "label": "Language2"
  }
]
```

---

### 3. Poster Remote
Menambahkan gambar poster custom ke player.

**Endpoint:** `GET /e/{file_code}?poster=http://yoursite.com/link/to.png`

---

### 4. Logo Remote
Menambahkan logo custom di player.

**Endpoint:** `GET /e/{file_code}?logo=http://yoursite.com/link/to.png`

---

## ⚙️ Encoding

### 1. Daftar Encoding
Melihat semua tugas encoding beserta statusnya.

**Endpoint:** `GET /encoding/list`

**Parameter:**
| Nama | Deskripsi | Contoh | Tipe | Wajib |
|------|-----------|---------|------|-------|
| key | Kunci API | 1l5ftrilhllgwx2bo | STRING | ✅ |

---

### 2. Status Encoding per File
Melihat progress encoding untuk file tertentu.

**Endpoint:** `GET /encoding/status`

**Parameter:**
| Nama | Deskripsi | Contoh | Tipe | Wajib |
|------|-----------|---------|------|-------|
| key | Kunci API | 1l5ftrilhllgwx2bo | STRING | ✅ |
| file_code | Kode file | asdcxz124bvbg3 | STRING | ✅ |

---

### 3. Restart Encoding Error
Memulai ulang encoding yang error.

**Endpoint:** `GET /encoding/restart`

**Parameter:**
| Nama | Deskripsi | Contoh | Tipe | Wajib |
|------|-----------|---------|------|-------|
| key | Kunci API | 1l5ftrilhllgwx2bo | STRING | ✅ |
| file_code | Kode file | asdcxz124bvbg3 | STRING | ✅ |

---

### 4. Hapus Encoding Error
Menghapus encoding yang gagal.

**Endpoint:** `GET /encoding/delete`

**Parameter:**
| Nama | Deskripsi | Contoh | Tipe | Wajib |
|------|-----------|---------|------|-------|
| key | Kunci API | 1l5ftrilhllgwx2bo | STRING | ✅ |
| file_code | Kode file | asdcxz124bvbg3 | STRING | ✅ |

---

## 🖼️ Thumbnail

### 1. Gambar Thumbnail
Mendapatkan URL thumbnail file.

**Endpoint:** `GET /images/thumb`

**Parameter:**
| Nama | Deskripsi | Contoh | Tipe | Wajib |
|------|-----------|---------|------|-------|
| key | Kunci API | 1l5ftrilhllgwx2bo | STRING | ✅ |
| file_code | Kode file | as1xc34vv12x | STRING | ❌ |

---

### 2. Gambar Splash
Mendapatkan URL splash image.

**Endpoint:** `GET /images/splash`

**Parameter:**
| Nama | Deskripsi | Contoh | Tipe | Wajib |
|------|-----------|---------|------|-------|
| key | Kunci API | 1l5ftrilhllgwx2bo | STRING | ✅ |
| file_code | Kode file | as1xc34vv12x | STRING | ❌ |

---

### 3. Preview Video
Mendapatkan URL preview sprite dan VTT.

**Endpoint:** `GET /images/preview`

**Parameter:**
| Nama | Deskripsi | Contoh | Tipe | Wajib |
|------|-----------|---------|------|-------|
| key | Kunci API | 1l5ftrilhllgwx2bo | STRING | ✅ |
| file_code | Kode file | as1xc34vv12x | STRING | ❌ |

---

## 🌍 Embed Domain

### Dapatkan Domain Embed
Mendapatkan domain embed lama dan terbaru.

**Endpoint:** `GET /get/domain`

**Parameter:**
| Nama | Deskripsi | Contoh | Tipe | Wajib |
|------|-----------|---------|------|-------|
| key | Kunci API | 1l5ftrilhllgwx2bo | STRING | ✅ |

**Response:**
```json
{
  "old_domain": "filemoon.sx",
  "new_domain": "blablabla_embed_domain.com",
  "status": 200,
  "server_time": "2024-12-03 08:32:03"
}
```

---

## 💎 Bandwidth Premium

### Dapatkan Link HLS
Menghasilkan URL streaming HLS premium dengan time-limited.

**Endpoint:** `GET /hls/link`

**Parameter:**
| Nama | Deskripsi | Contoh | Tipe | Wajib |
|------|-----------|---------|------|-------|
| key | Kunci API | 1l5ftrilhllgwx2bo | STRING | ✅ |
| ip | Alamat IPv4 viewer | 172.183.122.93 | STRING | ✅ |
| ua | User agent (URL encoded) | Mozilla/5.0... | STRING | ✅ |

**Response:**
```json
{
  "server_time": "2025-02-20 06:57:03",
  "result": "https://premium.api.byse.sx/hls2/01/08264/...",
  "status": 200,
  "msg": "OK"
}
```

---

## 📌 Catatan Penting

1. **Autentikasi**: Semua endpoint memerlukan parameter `key` (API Key)
2. **Base URL**: `https://api.byse.sx`
3. **Response Format**: JSON
4. **Status Code**: 200 = sukses
5. **CORS**: Pastikan header CORS sesuai untuk subtitle JSON remote

---

## 🔗 Link Referensi

- Base API: `https://api.byse.sx`
- Upload Server: Didapat dari endpoint `/upload/server`
- Embed Player: `https://api.byse.sx/e/{file_code}`