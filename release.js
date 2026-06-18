import fs from "fs";
import { execSync } from "child_process";

// 1. Tangkap versi baru dari terminal
const newVersion = process.argv[2];
if (!newVersion) {
  console.error("❌ Gagal: Anda lupa memasukkan versi baru!");
  console.log("💡 Cara pakai: node release.js 0.9.2");
  process.exit(1);
}

console.log(`🚀 Memulai rilis otomatis untuk Cicem Drive v${newVersion}...`);

try {
  // 2. Update package.json
  const pkgPath = "app/package.json";
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  pkg.version = newVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  console.log("✅ package.json berhasil diperbarui.");

  // 3. Update tauri.conf.json
  const tauriPath = "app/src-tauri/tauri.conf.json";
  const tauri = JSON.parse(fs.readFileSync(tauriPath, "utf8"));
  tauri.version = newVersion;
  fs.writeFileSync(tauriPath, JSON.stringify(tauri, null, 2) + "\n");
  console.log("✅ tauri.conf.json berhasil diperbarui.");

  // 4. Update Cargo.toml
  const cargoPath = "app/src-tauri/Cargo.toml";
  let cargo = fs.readFileSync(cargoPath, "utf8");
  cargo = cargo.replace(/version = ".*"/, `version = "${newVersion}"`);
  fs.writeFileSync(cargoPath, cargo);
  console.log("✅ Cargo.toml berhasil diperbarui.");

  // 5. Otomatis Git Add, Commit, dan Push
  console.log("📦 Mengirim ke GitHub...");
  execSync("git add .", { stdio: "inherit" });
  execSync(`git commit -m "chore: Rilis Cicem Drive v${newVersion}"`, { stdio: "inherit" });
  execSync("git push origin main", { stdio: "inherit" });

  console.log(`🎉 SUKSES! Kode v${newVersion} telah dikirim ke GitHub.`);
  console.log(`👉 Sekarang buka tab 'Actions' di GitHub dan klik 'Run workflow' untuk mulai merakit aplikasinya!`);
} catch (error) {
  console.error("❌ Terjadi kesalahan:", error.message);
}
