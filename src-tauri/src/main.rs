// Prevents additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    if std::env::var_os("GTK_IM_MODULE").is_none()
        && std::env::var_os("WAYLAND_DISPLAY").is_some()
        && std::env::var_os("XMODIFIERS").as_deref() == Some(std::ffi::OsStr::new("@im=fcitx"))
    {
        // Select Fcitx's GTK context before Tauri initializes GTK or starts threads.
        std::env::set_var("GTK_IM_MODULE", "fcitx");
    }

    #[cfg(all(target_os = "linux", debug_assertions))]
    if std::env::var_os("LITFOLIO_STARTUP_NETWORK_HARNESS").is_some() {
        match litera_lib::network_egress::run_native_startup_network_harness() {
            Ok(code) => std::process::exit(code),
            Err(error) => {
                eprintln!("startup network harness failed: {error:#}");
                std::process::exit(2);
            }
        }
    }

    litera_lib::run();
}
