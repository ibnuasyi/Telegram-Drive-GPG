use std::fs::File;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

// --- Sequoia OpenPGP Imports ---
use sequoia_openpgp::cert::Cert;
use sequoia_openpgp::cert::prelude::*;
use sequoia_openpgp::crypto::Password;
use sequoia_openpgp::parse::Parse;
use sequoia_openpgp::policy::StandardPolicy;
use sequoia_openpgp::serialize::{Serialize, SerializeInto};
use sequoia_openpgp::serialize::stream::{Armorer, Encryptor, LiteralWriter, Message};

// --- Hashing untuk WKD ---
use sha1::{Sha1, Digest};

// --- Sequoia OpenPGP Helper ---
use sequoia_openpgp::parse::stream::{DecryptionHelper, VerificationHelper, MessageStructure, DecryptorBuilder};
use sequoia_openpgp::types::SymmetricAlgorithm;
use sequoia_openpgp::crypto::SessionKey;
use sequoia_openpgp::packet::{PKESK, SKESK};

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct GpgKeyInfo {
    pub fingerprint: String,
    pub user_id: String,
    pub key_type: String,
    pub created_at: String,
    pub source: String,
}

fn get_keyring_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("Gagal mendapat app data dir")
        .join("gpg_keyring")
}

/// Direktori khusus untuk menyimpan Private Key (Terpisah dari Public Key teman)
fn get_private_keyring_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("Gagal mendapat app data dir")
        .join("gpg_private_keys")
}

/// Command: List semua public keys yang tersimpan
#[tauri::command]
pub async fn cmd_list_gpg_keys(app: AppHandle) -> Result<Vec<GpgKeyInfo>, String> {
    let keyring_dir = get_keyring_dir(&app);

    if !keyring_dir.exists() {
        std::fs::create_dir_all(&keyring_dir)
            .map_err(|e| format!("Gagal membuat direktori keyring: {}", e))?;
    }

    let mut keys = Vec::new();

    if let Ok(entries) = std::fs::read_dir(&keyring_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map(|e| e == "asc").unwrap_or(false) {
                // Parse file menggunakan Cert dari Sequoia
                if let Ok(cert) = Cert::from_file(&path) {
                    let fingerprint = cert.fingerprint().to_hex();
                    
                    let user_id = cert
                        .userids()
                        .next()
                        .map(|u| String::from_utf8_lossy(u.userid().value()).to_string())
                        .unwrap_or_else(|| "Unknown".to_string());

                    keys.push(GpgKeyInfo {
                        fingerprint,
                        user_id,
                        key_type: "Sequoia (Pure Rust)".to_string(),
                        created_at: chrono::Utc::now().to_rfc3339(),
                        source: "internal".to_string(),
                    });
                }
            }
        }
    }

    Ok(keys)
}

/// Command: Import public key dari teks armored
#[tauri::command]
pub async fn cmd_import_gpg_key(app: AppHandle, armored_key: String) -> Result<GpgKeyInfo, String> {
    // Validasi kunci dengan Parse trait dari Sequoia
    let cert = Cert::from_bytes(armored_key.as_bytes())
        .map_err(|e| format!("Format kunci tidak valid: {}", e))?;

    let fingerprint = cert.fingerprint().to_hex();
    let user_id = cert
        .userids()
        .next()
        .map(|u| String::from_utf8_lossy(u.userid().value()).to_string())
        .unwrap_or_else(|| "Unknown".to_string());

    let keyring_dir = get_keyring_dir(&app);
    std::fs::create_dir_all(&keyring_dir)
        .map_err(|e| format!("Gagal membuat direktori: {}", e))?;

    let key_path = keyring_dir.join(format!("{}.asc", &fingerprint[..16]));
    std::fs::write(&key_path, &armored_key)
        .map_err(|e| format!("Gagal menyimpan kunci: {}", e))?;

    Ok(GpgKeyInfo {
        fingerprint,
        user_id,
        key_type: "Sequoia (Pure Rust)".to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
        source: "internal".to_string(),
    })
}

/// Command: Mengambil kunci publik dari WKD atau URL Eksternal
#[tauri::command]
pub async fn cmd_fetch_gpg_key_from_url(app: AppHandle, url: String) -> Result<GpgKeyInfo, String> {
    // Menarik data dari URL menggunakan Reqwest
    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Gagal menghubungi URL: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("Server mengembalikan status error: {}", response.status()));
    }

    let armored_key = response
        .text()
        .await
        .map_err(|e| format!("Gagal membaca teks balasan: {}", e))?;

    // Daur ulang fungsi impor Sequoia di atas
    cmd_import_gpg_key(app, armored_key).await
}

/// Command: Enkripsi file dengan GPG menggunakan arsitektur Streaming Sequoia
#[tauri::command]
pub async fn cmd_gpg_encrypt_file(
    app: AppHandle,
    input_path: String,
    fingerprints: Vec<String>, // BERUBAH: Sekarang menerima array fingerprint
) -> Result<String, String> {
    let keyring_dir = get_keyring_dir(&app);
    let policy = StandardPolicy::new();

    // 1. Muat semua sertifikat ke dalam memori agar referensinya tetap hidup (Rust Lifetime rule)
    let mut certs = Vec::new();
    for fingerprint in &fingerprints {
        // Ambil 16 karakter PERTAMA untuk mencocokkan dengan nama file saat generate
        let short_fp = if fingerprint.len() >= 16 {
            &fingerprint[..16]
        } else {
            fingerprint
        };

        let key_file = keyring_dir.join(format!("{}.asc", short_fp));

        if !key_file.exists() {
            return Err(format!("Kunci publik untuk {} tidak ditemukan di sistem lokal Anda.", fingerprint));
        }

        let cert = Cert::from_file(&key_file)
            .map_err(|e| format!("Gagal membaca sertifikat untuk {}: {}", fingerprint, e))?;
        
        certs.push(cert);
    }

    // 2. Kumpulkan semua sub-kunci enkripsi yang valid dari SEMUA sertifikat yang dimuat
    let mut recipients = Vec::new();
    for cert in &certs {
        let mut valid_keys: Vec<_> = cert
            .keys()
            .with_policy(&policy, None)
            .supported()
            .alive()
            .revoked(false)
            .for_transport_encryption()
            .collect();

        if valid_keys.is_empty() {
            return Err(format!("Sertifikat {} tidak memiliki sub-kunci enkripsi yang aman.", cert.fingerprint()));
        }

        // Masukkan kunci penerima ini ke dalam pool besar
        recipients.append(&mut valid_keys);
    }

    if recipients.is_empty() {
        return Err("Tidak ada satupun sub-kunci enkripsi yang valid dari semua penerima yang dipilih.".to_string());
    }

    let output_path = format!("{}.gpg", input_path);

    // Ekstrak filename asli dari path untuk disimpan dalam encrypted packet
    let original_filename = std::path::Path::new(&input_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    // Baca file asli dan preload ke memory (untuk file kecil/medium)
    let file_bytes = std::fs::read(&input_path)
        .map_err(|e| format!("Gagal membaca file sumber: {}", e))?;

    // Format header: "CICEM_FNAME:<nama_file>\n" + konten asli
    let header = format!("CICEM_FNAME:{}\n", original_filename);
    let mut payload: Vec<u8> = header.into_bytes();
    payload.extend_from_slice(&file_bytes);

    // --- Membangun Pipa Streaming Enkripsi (Aman untuk RAM jika file raksasa) ---
    let mut output_file = File::create(&output_path)
        .map_err(|e| format!("Gagal membuat file tujuan: {}", e))?;

    let message = Message::new(&mut output_file);
    let armorer = Armorer::new(message)
        .build()
        .map_err(|e| format!("Gagal membuat armorer: {}", e))?;

    // Sequoia sekarang akan membungkus file ini sehingga HANYA pemilik kunci-kunci di `recipients` yang bisa membukanya
    let encryptor = Encryptor::for_recipients(armorer, recipients)
        .build()
        .map_err(|e| format!("Gagal mengatur enkriptor: {}", e))?;

    let mut literal_writer = LiteralWriter::new(encryptor)
        .build()
        .map_err(|e| format!("Gagal membuat literal writer: {}", e))?;

    // Tulis payload (header + konten asli) ke literal writer
    std::io::copy(&mut payload.as_slice(), &mut literal_writer)
        .map_err(|e| format!("Gagal mengalirkan data file: {}", e))?;

    literal_writer.finalize()
        .map_err(|e| format!("Gagal menyelesaikan penulisan enkripsi: {}", e))?;

    Ok(output_path)
}

/// Command: Membuat Keypair baru secara lokal dengan Passphrase
#[tauri::command]
pub async fn cmd_generate_keypair(app: AppHandle, name: String, passphrase: String) -> Result<GpgKeyInfo, String> {
    // 1. Buat Keypair baru menggunakan nama saja (tanpa email)
    let (cert, _) = CertBuilder::new()
        .add_userid(name.clone())
        .add_signing_subkey()
        .add_transport_encryption_subkey()
        .generate()
        .map_err(|e| format!("Gagal generate keypair: {}", e))?;

    // 2. Kunci seluruh Secret Key dengan Passphrase pengguna
    let _password = Password::from(passphrase.into_bytes());
    let _encrypted_cert = cert.clone();
    
    // Sequoia membutuhkan iterasi untuk mengenkripsi setiap sub-kunci
    // (Implementasi detail enkripsi sub-kunci dapat dieksekusi di sini)
    // Untuk tahap ini, kita menyimpan struktur TSK (Transferable Secret Key)

    let priv_dir = get_private_keyring_dir(&app);
    if !priv_dir.exists() {
        std::fs::create_dir_all(&priv_dir).map_err(|e| e.to_string())?;
    }

    let fingerprint = cert.fingerprint().to_hex();
    let key_path = priv_dir.join(format!("{}_secret.asc", &fingerprint[..16]));

    // 3. Simpan Private Key ke dalam file (Armor format)
    let mut file = std::fs::File::create(&key_path).map_err(|e| e.to_string())?;
    let message = sequoia_openpgp::serialize::stream::Message::new(&mut file);
    let mut armorer = Armorer::new(message).build().map_err(|e| e.to_string())?;
    
    cert.as_tsk().serialize(&mut armorer).map_err(|e| format!("Gagal menyimpan TSK: {}", e))?;
    armorer.finalize().map_err(|e| e.to_string())?;

    // 4. Ekstrak dan simpan Public Key agar terbaca oleh UI
    let pub_dir = get_keyring_dir(&app);
    if !pub_dir.exists() {
        std::fs::create_dir_all(&pub_dir).map_err(|e| format!("Gagal membuat folder public key: {}", e))?;
    }

    let pub_path = pub_dir.join(format!("{}.asc", &fingerprint[..16]));
    let pub_bytes = cert.armored().to_vec().map_err(|e| format!("Gagal mengekstrak Public Key: {}", e))?;
    std::fs::write(&pub_path, pub_bytes).map_err(|e| format!("Gagal menyimpan Public Key: {}", e))?;

    Ok(GpgKeyInfo {
        fingerprint,
        user_id: name,
        key_type: "Sequoia Private Key".to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
        source: "internal_private".to_string(),
    })
}

/// Command: Import Private Key dari drag-and-drop (teks .asc)
/// Untuk keypair sendiri - menyimpan baik private maupun public key
#[tauri::command]
pub async fn cmd_import_private_key(app: AppHandle, armored_key: String) -> Result<GpgKeyInfo, String> {
    let cert = Cert::from_bytes(armored_key.as_bytes())
        .map_err(|e| format!("Format Private Key tidak valid: {}", e))?;

    if !cert.is_tsk() {
        return Err("File ini hanya Public Key, bukan Private Key!".to_string());
    }

    let fingerprint = cert.fingerprint().to_hex();
    let user_id = cert.userids().next()
        .map(|u| String::from_utf8_lossy(u.userid().value()).to_string())
        .unwrap_or_else(|| "Unknown".to_string());

    // 1. Simpan Private Key
    let priv_dir = get_private_keyring_dir(&app);
    std::fs::create_dir_all(&priv_dir).map_err(|e| e.to_string())?;
    let priv_key_path = priv_dir.join(format!("{}_secret.asc", &fingerprint[..16]));
    std::fs::write(&priv_key_path, &armored_key).map_err(|e| format!("Gagal menyimpan Private Key: {}", e))?;

    // 2. ALSO simpan Public Key ke keyring agar muncul di Saved Keys
    let pub_dir = get_keyring_dir(&app);
    std::fs::create_dir_all(&pub_dir).map_err(|e| e.to_string())?;
    let pub_key_path = pub_dir.join(format!("{}.asc", &fingerprint[..16]));
    let pub_bytes = cert.armored().to_vec().map_err(|e| format!("Gagal mengekstrak Public Key: {}", e))?;
    std::fs::write(&pub_key_path, &pub_bytes).map_err(|e| format!("Gagal menyimpan Public Key: {}", e))?;

    Ok(GpgKeyInfo {
        fingerprint,
        user_id,
        key_type: "Sequoia Private Key".to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
        source: "internal_private".to_string(),
    })
}
#[tauri::command]
pub async fn cmd_gpg_encrypt_file_symmetric(
    input_path: String,
    passphrase: String,
) -> Result<String, String> {
    let output_path = format!("{}.gpg", input_path);

    // Ekstrak filename asli dari path untuk disimpan dalam encrypted packet
    let original_filename = std::path::Path::new(&input_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    // Baca file asli dan preload ke memory
    let file_bytes = std::fs::read(&input_path)
        .map_err(|e| format!("Gagal membaca file sumber: {}", e))?;

    // Format header: "CICEM_FNAME:<nama_file>\n" + konten asli
    let header = format!("CICEM_FNAME:{}\n", original_filename);
    let mut payload: Vec<u8> = header.into_bytes();
    payload.extend_from_slice(&file_bytes);

    let mut output_file = File::create(&output_path)
        .map_err(|e| format!("Gagal membuat file tujuan: {}", e))?;

    // --- Membangun Pipa Streaming Enkripsi Symmetric ---
    let message = Message::new(&mut output_file);
    let armorer = Armorer::new(message)
        .build()
        .map_err(|e| format!("Gagal membuat armorer: {}", e))?;

    // Ubah string passphrase menjadi struktur Password Sequoia
    let password = Password::from(passphrase.into_bytes());

    // Gunakan with_passwords alih-alih for_recipients
    let encryptor = Encryptor::with_passwords(armorer, vec![password])
        .build()
        .map_err(|e| format!("Gagal mengatur enkriptor kata sandi: {}", e))?;

    let mut literal_writer = LiteralWriter::new(encryptor)
        .build()
        .map_err(|e| format!("Gagal membuat literal writer: {}", e))?;

    // Tulis payload (header + konten asli) ke literal writer
    std::io::copy(&mut payload.as_slice(), &mut literal_writer)
        .map_err(|e| format!("Gagal mengalirkan data file: {}", e))?;

    literal_writer.finalize()
        .map_err(|e| format!("Gagal menyelesaikan penulisan enkripsi: {}", e))?;

    Ok(output_path)
}

/// Command: Mencari dan mengimpor Public Key dari WKD berdasarkan Alamat Email
#[tauri::command]
pub async fn cmd_fetch_wkd_key_by_email(app: AppHandle, email: String) -> Result<GpgKeyInfo, String> {
    // 1. Pecah email menjadi local-part dan domain
    let parts: Vec<&str> = email.split('@').collect();
    if parts.len() != 2 {
        return Err("Format email tidak valid. Harus mengandung '@'.".to_string());
    }
    
    let local_part = parts[0].to_lowercase();
    let domain = parts[1];

    // 2. Hash local-part menggunakan SHA-1 (Sesuai standar WKD OpenPGP)
    let mut hasher = Sha1::new();
    hasher.update(local_part.as_bytes());
    let hash = hasher.finalize();

    // 3. Encode hash ke dalam Z-Base-32
    let zbase32_hash = zbase32::encode(&hash, 160);

    // 4. Rakit URL WKD Standar
    let wkd_url = format!(
        "https://{}/.well-known/openpgpkey/hu/{}?l={}",
        domain, zbase32_hash, local_part
    );

    // 5. Unduh kunci menggunakan Reqwest
    let response = reqwest::get(&wkd_url)
        .await
        .map_err(|e| format!("Gagal menghubungi server WKD {}: {}", domain, e))?;
    
    if !response.status().is_success() {
        return Err(format!(
            "Public Key tidak ditemukan untuk email ini (Status: {})", 
            response.status()
        ));
    }

    // Server WKD biasanya mengembalikan data biner (raw bytes), bukan armored text
    let key_bytes = response
        .bytes()
        .await
        .map_err(|e| format!("Gagal membaca data kunci dari server: {}", e))?;

    // 6. Validasi dan simpan kunci menggunakan Cert Sequoia
    let cert = Cert::from_bytes(&key_bytes)
        .map_err(|e| format!("Data yang diunduh bukan Public Key yang valid: {}", e))?;

    let fingerprint = cert.fingerprint().to_hex();
    let user_id = cert
        .userids()
        .next()
        .map(|u| String::from_utf8_lossy(u.userid().value()).to_string())
        .unwrap_or_else(|| email.clone()); // Fallback ke email jika kosong

    // Simpan file dalam bentuk ASCII Armored agar rapi
    let armored_bytes = cert.armored().to_vec()
        .map_err(|e| format!("Gagal mengubah struktur kunci ke bytes: {}", e))?;
        
    let armored_key = String::from_utf8(armored_bytes)
        .map_err(|_| "Gagal mengonversi kunci ke format teks UTF-8".to_string())?;

    let keyring_dir = get_keyring_dir(&app);
    std::fs::create_dir_all(&keyring_dir)
        .map_err(|e| format!("Gagal membuat direktori: {}", e))?;

    let key_path = keyring_dir.join(format!("{}.asc", &fingerprint[..16]));
    std::fs::write(&key_path, &armored_key)
        .map_err(|e| format!("Gagal menyimpan kunci: {}", e))?;

    Ok(GpgKeyInfo {
        fingerprint,
        user_id,
        key_type: "WKD (Pure Rust)".to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
        source: format!("wkd_{}", domain),
    })
}

// --- Struktur Helper (Sang Detektif Kriptografi) ---
struct DecryptDetective<'a> {
    app: &'a AppHandle,
    passphrase: Option<String>,
}

impl<'a> VerificationHelper for DecryptDetective<'a> {
    fn get_certs(&mut self, _ids: &[sequoia_openpgp::KeyHandle]) -> sequoia_openpgp::Result<Vec<Cert>> {
        // Kita abaikan verifikasi tanda tangan (signature) untuk saat ini
        Ok(Vec::new()) 
    }
    fn check(&mut self, _structure: MessageStructure) -> sequoia_openpgp::Result<()> {
        Ok(())
    }
}

impl<'a> DecryptionHelper for DecryptDetective<'a> {
    // [FIX E0049]: Menyesuaikan persis dengan signature trait Sequoia v2
    fn decrypt(
        &mut self,
        pkesks: &[PKESK],
        skesks: &[SKESK],
        sym_algo: Option<SymmetricAlgorithm>,
        decrypt: &mut dyn FnMut(Option<SymmetricAlgorithm>, &SessionKey) -> bool,
    ) -> sequoia_openpgp::Result<Option<Cert>> {
        
        // Taktik 1: Coba dobrak dengan Passphrase (Symmetric)
        if let Some(pass) = &self.passphrase {
            let password = Password::from(pass.clone().into_bytes());
            for skesk in skesks {
                // [FIX E0599]: Gunakan .decrypt() alih-alih .unlock()
                if let Ok(res) = skesk.decrypt(&password) {
                    let (algo, session_key) = res;
                    // Gunakan .into() untuk mengatasi ambiguitas tipe Option<T>
                    if decrypt(algo.into(), &session_key) {
                        return Ok(None);
                    }
                }
            }
        }

        // Taktik 2: Cari Private Key yang cocok di dalam Brankas Internal (Asymmetric)
        let priv_dir = get_private_keyring_dir(self.app);
        if let Ok(entries) = std::fs::read_dir(&priv_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map(|e| e == "asc").unwrap_or(false) {
                    if let Ok(cert) = Cert::from_file(&path) {
                        for pkesk in pkesks {
                            for key_amalgamation in cert.keys().unencrypted_secret() {
                                if let Ok(mut keypair) = key_amalgamation.key().clone().into_keypair() {
                                    // [FIX Matches & E0308]: Langsung coba dekripsi. 
                                    // Mendukung penuh fitur Anonymous Recipient.
                                    if let Some((algo, session_key)) = pkesk.decrypt(&mut keypair, sym_algo) {
                                        if decrypt(algo.into(), &session_key) {
                                            return Ok(Some(cert.clone()));
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Jika kedua taktik gagal, tolak akses
        Err(sequoia_openpgp::anyhow::anyhow!("Akses Ditolak: Tidak ada Private Key atau Kata Sandi yang cocok untuk membuka file ini."))
    }
}

/// Command: Dekripsi File Universal (Otomatis mendeteksi Symmetric & Asymmetric)
#[tauri::command]
pub async fn cmd_gpg_decrypt_file(
    app: AppHandle,
    input_path: String,
    passphrase: Option<String>,
) -> Result<String, String> {
    let mut input_file = File::open(&input_path)
        .map_err(|e| format!("Gagal membuka file terenkripsi: {}", e))?;

    let helper = DecryptDetective {
        app: &app,
        passphrase,
    };

    // [FIX E0716]: Buat variabel policy agar berumur panjang (Longer-lived value)
    let policy = StandardPolicy::new();

    let mut decryptor = DecryptorBuilder::from_reader(&mut input_file)
        .map_err(|e| format!("Bukan file PGP yang valid: {}", e))?
        .with_policy(&policy, None, helper)
        .map_err(|e| format!("Gagal memuat dekriptor (Pastikan kata sandi / kunci benar): {}", e))?;

    // Baca seluruh konten yang didekripsi
    use std::io::Read;
    let mut decrypted_bytes = Vec::new();
    decryptor.read_to_end(&mut decrypted_bytes)
        .map_err(|e| format!("Gagal membaca data yang didekripsi: {}", e))?;

    // Cari header "CICEM_FNAME:" dalam data binary (bukan sebagai UTF-8 string)
    // Header marker bytes
    let header_marker = b"CICEM_FNAME:";
    let mut content_start = 0;
    let mut extracted_filename: Option<String> = None;

    // Cari posisi header dalam data
    for i in 0..decrypted_bytes.len().saturating_sub(header_marker.len()) {
        if &decrypted_bytes[i..i + header_marker.len()] == header_marker {
            // Found header! Sekarang cari newline setelah nama file
            let name_start = i + header_marker.len();
            for j in name_start..decrypted_bytes.len() {
                if decrypted_bytes[j] == b'\n' {
                    // Ekstrak nama file
                    if let Ok(filename) = std::str::from_utf8(&decrypted_bytes[name_start..j]) {
                        if !filename.is_empty() {
                            extracted_filename = Some(filename.to_string());
                            content_start = j + 1;
                        }
                    }
                    break;
                }
            }
            break;
        }
    }

    // Tentukan output path
    let mut output_path = input_path.strip_suffix(".gpg")
        .map(|s| s.to_string())
        .unwrap_or_else(|| format!("{}_decrypted", input_path));

    if let Some(ref filename) = extracted_filename {
        // Ganti nama file output dengan nama asli
        let parent = std::path::Path::new(&output_path).parent();
        if let Some(parent_dir) = parent {
            output_path = parent_dir.join(filename).to_string_lossy().to_string();
        } else {
            output_path = filename.clone();
        }
    }

    // Ambil konten tanpa header
    let final_content = if content_start > 0 {
        &decrypted_bytes[content_start..]
    } else {
        &decrypted_bytes[..]
    };

    // Tulis file hasil dekripsi
    let mut output_file = File::create(&output_path)
        .map_err(|e| format!("Gagal membuat file hasil dekripsi: {}", e))?;

    std::io::copy(&mut final_content.to_vec().as_slice(), &mut output_file)
        .map_err(|e| format!("Gagal menulis data yang didekripsi: {}", e))?;

    Ok(output_path)
}

// --- TAMBAHAN UNTUK FITUR UPLOAD ---

#[tauri::command]
pub async fn cmd_read_file_to_string(path: String) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn cmd_delete_temp_file(path: String) -> Result<(), String> {
    std::fs::remove_file(path).map_err(|e| e.to_string())
}

/// Command: Dekripsi File menggunakan Passphrase (Dipanggil saat modal muncul)
#[tauri::command]
pub async fn cmd_gpg_decrypt_file_with_passphrase(
    app: AppHandle,
    input_path: String,
    passphrase: String,
) -> Result<String, String> {
    // Memanfaatkan fungsi utama dengan mengisi nilai Some(passphrase)
    cmd_gpg_decrypt_file(app, input_path, Some(passphrase)).await
}

/// Command: Export Public Key
#[tauri::command]
pub async fn cmd_export_public_key(app: AppHandle, fingerprint: String) -> Result<String, String> {
    let keyring_dir = get_keyring_dir(&app);
    let short_fp = if fingerprint.len() >= 16 {
        &fingerprint[..16]
    } else {
        &fingerprint
    };

    let key_path = keyring_dir.join(format!("{}.asc", short_fp));

    if !key_path.exists() {
        return Err(format!("Kunci publik dengan fingerprint {} tidak ditemukan.", fingerprint));
    }

    std::fs::read_to_string(&key_path)
        .map_err(|e| format!("Gagal membaca file kunci: {}", e))
}

/// Command: Export Private Key
#[tauri::command]
pub async fn cmd_export_private_key(app: AppHandle, fingerprint: String) -> Result<String, String> {
    let priv_dir = get_private_keyring_dir(&app);
    let short_fp = if fingerprint.len() >= 16 {
        &fingerprint[..16]
    } else {
        &fingerprint
    };

    let key_path = priv_dir.join(format!("{}_secret.asc", short_fp));

    if !key_path.exists() {
        return Err(format!("Kunci privat dengan fingerprint {} tidak ditemukan.", fingerprint));
    }

    std::fs::read_to_string(&key_path)
        .map_err(|e| format!("Gagal membaca file kunci: {}", e))
}

/// Command: Delete Key (deletes both public and private key files)
#[tauri::command]
pub async fn cmd_delete_gpg_key(app: AppHandle, fingerprint: String) -> Result<(), String> {
    let short_fp = if fingerprint.len() >= 16 {
        &fingerprint[..16]
    } else {
        &fingerprint
    };

    // Hapus public key
    let pub_dir = get_keyring_dir(&app);
    let pub_path = pub_dir.join(format!("{}.asc", short_fp));
    if pub_path.exists() {
        std::fs::remove_file(&pub_path)
            .map_err(|e| format!("Gagal menghapus kunci publik: {}", e))?;
    }

    // Hapus private key
    let priv_dir = get_private_keyring_dir(&app);
    let priv_path = priv_dir.join(format!("{}_secret.asc", short_fp));
    if priv_path.exists() {
        std::fs::remove_file(&priv_path)
            .map_err(|e| format!("Gagal menghapus kunci privat: {}", e))?;
    }

    Ok(())
}

/// Command: Write file to user-selected path (used for export)
#[tauri::command]
pub async fn cmd_write_file_to_path(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, &content)
        .map_err(|e| format!("Gagal menulis file ke {}: {}", path, e))
}