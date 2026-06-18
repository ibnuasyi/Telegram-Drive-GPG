# Telegram Drive PGP (Cicem Drive)

> 🛡️ **Cicem Drive** is a security-focused fork of the original [Telegram Drive](https://github.com/caamer20/Telegram-Drive) by caamer20. This fork introduces robust **End-to-End Encryption (E2EE)** powered by Sequoia PGP to ensure your data remains strictly confidential.

**Telegram Drive PGP** is an open-source, cross-platform desktop application that turns your Telegram account into an unlimited, secure cloud storage drive. Built with **Tauri**, **Rust**, and **React**.

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows)]()

</div>

![Auth Screen]()

## 📁 What is Telegram Drive PGP?

Like the original project, it leverages the Telegram API to allow you to upload, organize, and manage files directly on Telegram's servers. However, **Cicem Drive** adds a powerful cryptographic layer. Files can be encrypted locally on your machine before they are ever uploaded to Telegram, ensuring that even if your Telegram account is compromised, your sensitive files remain locked.

### ✨ Key Features

**Security & PGP Features (New in Cicem Drive):**

- 🔒 **End-to-End Encryption (E2EE)**: Secure your files using military-grade Sequoia PGP encryption.
- 🔑 **Flexible Protection**: Choose between Symmetric (Passphrase) or Asymmetric (Public Key) encryption before uploading.
- 👥 **Multi-Recipient Encryption**: Select multiple public keys to encrypt a file for multiple contacts simultaneously (plus yourself).
- 🔓 **Smart Decryption Detective**: Seamlessly decrypt files upon download. The app automatically detects `.gpg` files, attempts to unlock them using your stored Private Keys, or elegantly prompts for a passphrase if required.
- 📇 **Built-in Key Management**: Generate new keypairs, import existing `.asc` files, or fetch public keys directly from Web Key Directory (WKD) via email address.

**Core Features (Inherited from Telegram Drive):**

- ☁️ **Unlimited Cloud Storage**: Utilizing Telegram's generous cloud infrastructure.
- 🚀 **High Performance Grid**: Virtual scrolling handles folders with thousands of files instantly.
- 🎬 **Media Streaming**: Stream video and audio files directly without downloading.
- 📄 **PDF Viewer:** Built-in PDF support with infinite scrolling for seamless document reading.
- 🖱️ **Drag & Drop**: Intuitive drag-and-drop upload and file management.
- 🖼️ **Thumbnail Previews**: Inline thumbnails for images and media files.
- 📁 **Folder Management**: Create "Folders" (private Telegram Channels) to organize content.
- 🌐 **Proxy & VPN Optimizer**: Native integration for SOCKS5/MTProto proxies and aggressive network tuning for high-latency connections.
- 💻 **Cross-Platform**: Native apps for Windows, macOS, and Linux.

---

## 📸 Screenshots

### Desktop App

| Dashboard      | File Preview |
| -------------- | ------------ |
| ![Dashboard]() | ![Preview]() |

| Grid View      | Authentication |
| -------------- | -------------- |
| ![Dark Mode]() | ![Login]()     |

| PGP Key Management      | Encryption Prompt      |
| ----------------------- | ---------------------- |
| ![PGP Key Management]() | ![Encryption Prompt]() |

| Folder Creation      | Folder List View      |
| -------------------- | --------------------- |
| ![Folder Creation]() | ![Folder List View]() |

---

## 🛠️ Tech Stack

- **Frontend**: React, TypeScript, TailwindCSS, Framer Motion
- **Backend**: Rust (Tauri), Grammers (Telegram Client), **Sequoia PGP** (Cryptography)
- **Build Tool**: Vite

---

## 🚀 Getting Started

### Prerequisites

- **Node.js (v18+)**: [Download here](https://nodejs.org/)
- **Rust (latest stable)**: Required to compile the Tauri backend. Install via [rustup](https://rustup.rs/):
  - **macOS/Linux:** `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
  - **Windows:** Download and run `rustup-init.exe` from [rustup.rs](https://rustup.rs/)
- **OS-Specific Build Tools for Tauri**:
  - **macOS:** Xcode Command Line Tools (`xcode-select --install`).
  - **Linux (Ubuntu/Debian):** `sudo apt update && sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`
  - **Windows (CRITICAL):** You **must** install the [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/). Select the **"Desktop development with C++"** workload.
- **Telegram API Credentials**:
  1. Log into [my.telegram.org](https://my.telegram.org).
  2. Go to "API development tools" and create a new application to get your `api_id` and `api_hash`.

> [!NOTE]  
> **First-run Compile Time:** The initial build will download and compile hundreds of Rust crates (including the Sequoia PGP cryptographic suite). This process can take **5 to 15 minutes** depending on your hardware. Subsequent builds will be much faster.

### Installation

1.  **Clone the repository**

    ```bash
    git clone [https://github.com/ibnuasyi/Telegram-Drive-GPG.git](https://github.com/ibnuasyi/Telegram-Drive-GPG.git)
    cd Telegram-Drive-GPG
    ```

2.  **Install Dependencies**

    ```bash
    cd app
    npm install
    ```

3.  **Run in Development Mode**

    ```bash
    npm run tauri dev
    ```

4.  **Build/Compile for Release**
    ```bash
    npm run tauri build
    ```

---

## 🤝 Credits & Acknowledgements

- **Original Project:** [Telegram Drive](https://github.com/caamer20/Telegram-Drive) created by **Cameron Amer**.
- **PGP Fork (Cicem Drive):** Developed and maintained by **Ibnu Batuthah**.
- **Special Thanks:** A deep appreciation and special thanks to **Harimau Kicik**.
- **Cryptography:** Powered by the incredible [Sequoia PGP](https://sequoia-pgp.org/) implementation in Rust.

## 📄 Open Source & License

This project is **Free and Open Source Software**. You are free to use, modify, and distribute it.

Licensed under the **MIT License**.

---

_Disclaimer: This application is not affiliated with Telegram FZ-LLC. Use responsibly and in accordance with Telegram's Terms of Service._
