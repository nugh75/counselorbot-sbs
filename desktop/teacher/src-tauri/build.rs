fn main() {
    // Ensure resource directories exist so cargo check / test can run
    // without requiring full PyInstaller / Next packaging beforehand.
    for dir in &["backend", "frontend", "node", "cloudflared"] {
        let _ = std::fs::create_dir_all(dir);
    }
    tauri_build::build()
}
