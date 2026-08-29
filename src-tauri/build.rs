fn main() {
    println!("cargo:rerun-if-env-changed=LITFOLIO_PROFILE");
    tauri_build::build();
}
