// Prevents additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
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
