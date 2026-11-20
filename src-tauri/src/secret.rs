//! OS keychain wrapper.
//!
//! We store API credentials in the platform keychain: macOS Keychain, Windows
//! Credential Manager, or Secret Service on Linux.
//!
//! In tests we route through an in-memory `Mutex<HashMap>` instead. Tests
//! should never write to the real system keychain, and the production keyring
//! crate isn't available on most CI runners anyway.
//!
//! Profile persistence handles keychain failures, logs a warning and retains
//! the value in the local configuration when migration cannot proceed.

pub fn llm_account(profile_name: &str) -> String {
    format!("llm/{profile_name}")
}

pub const MINERU_ACCOUNT: &str = "mineru/default";

#[cfg(not(test))]
mod real {
    use anyhow::Result;

    /// Service name registered under the platform keychain. One namespace per
    /// application is the recommended pattern; accounts inside that namespace
    /// disambiguate credentials such as `llm/<profile>` and `mineru/default`.
    const SERVICE: &str = "LitFolio";

    pub fn get(account: &str) -> Result<Option<String>> {
        let entry = keyring::Entry::new(SERVICE, account)?;
        match entry.get_password() {
            Ok(s) => Ok(Some(s)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }

    pub fn put(account: &str, value: &str) -> Result<()> {
        let entry = keyring::Entry::new(SERVICE, account)?;
        entry.set_password(value)?;
        Ok(())
    }

    #[allow(dead_code)]
    pub fn delete(account: &str) -> Result<()> {
        let entry = keyring::Entry::new(SERVICE, account)?;
        match entry.delete_credential() {
            Ok(()) => Ok(()),
            Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.into()),
        }
    }
}

#[cfg(test)]
#[allow(unused_imports)]
pub use inmem::delete;
#[cfg(test)]
pub use inmem::{get, put, set_fault_mode, FaultMode};
#[cfg(not(test))]
#[allow(unused_imports)]
pub use real::delete;
#[cfg(not(test))]
pub use real::{get, put};

#[cfg(test)]
mod inmem {
    use anyhow::Result;
    use once_cell::sync::Lazy;
    use std::cell::Cell;
    use std::collections::HashMap;
    use std::sync::Mutex;

    static STORE: Lazy<Mutex<HashMap<String, String>>> = Lazy::new(|| Mutex::new(HashMap::new()));

    /// Per-thread fault injection so tests can simulate broken keychain
    /// backends without writing real platform code. The real bug we are
    /// guarding against — the `keyring` crate falling back to a mock backend
    /// when no platform feature is enabled — silently accepts writes but
    /// returns nothing on read; `SilentDropOnPut` reproduces that exact
    /// shape so our roundtrip check can be tested for real.
    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    pub enum FaultMode {
        None,
        SilentDropOnPut,
        ReadFails,
    }

    thread_local! {
        static FAULT: Cell<FaultMode> = const { Cell::new(FaultMode::None) };
    }

    pub fn set_fault_mode(mode: FaultMode) {
        FAULT.with(|c| c.set(mode));
    }

    pub fn get(account: &str) -> Result<Option<String>> {
        if FAULT.with(|c| c.get()) == FaultMode::ReadFails {
            return Err(anyhow::anyhow!("simulated keychain read failure"));
        }
        Ok(STORE.lock().unwrap().get(account).cloned())
    }

    pub fn put(account: &str, value: &str) -> Result<()> {
        if FAULT.with(|c| c.get()) == FaultMode::SilentDropOnPut {
            // Pretend success but never persist. Mirrors keyring 3.x with no
            // backend feature enabled.
            return Ok(());
        }
        STORE
            .lock()
            .unwrap()
            .insert(account.to_string(), value.to_string());
        Ok(())
    }

    #[allow(dead_code)]
    pub fn delete(account: &str) -> Result<()> {
        STORE.lock().unwrap().remove(account);
        Ok(())
    }
}
