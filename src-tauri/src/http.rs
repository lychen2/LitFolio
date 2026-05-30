//! reqwest::Client builders for the two trust tiers we operate in.
//!
//! - [`build_api_client`] is for calls into known, hardcoded REST endpoints
//!   (arXiv, CrossRef, Semantic Scholar, the user's configured LLM endpoint).
//!   The URLs come from us, not the network. We disable redirects entirely
//!   because legitimate API responses never redirect, and a redirect on these
//!   paths would only ever be an attack signal.
//!
//! - [`build_external_client`] is for calls to URLs we got from third-party
//!   data (PDF download links inside arXiv metadata, user-configured RSS
//!   feeds). Here redirects are normal, but we cap the chain, require
//!   http(s)-only, and refuse any redirect that lands on a private/loopback
//!   /link-local IP. That last check is what blocks the SSRF pivot to AWS
//!   metadata at 169.254.169.254 or to internal services behind the host.
//!
//! Initial requests are not IP-filtered (the user may legitimately point an
//! LLM endpoint at a localhost proxy). The redirect-time check is the load-
//! bearing defense: it prevents an external server from bouncing us inward.

use anyhow::Result;
use reqwest::{redirect, Client, Url};
use std::net::IpAddr;
use std::time::Duration;

const USER_AGENT: &str = "LitFolio/0.3 (+https://github.com/ZonaZcy/litera-desktop)";

/// Client for hardcoded REST endpoints. Refuses redirects so a compromised
/// upstream cannot reroute requests anywhere unexpected.
pub fn build_api_client() -> Result<Client> {
    Ok(Client::builder()
        .user_agent(USER_AGENT)
        .connect_timeout(Duration::from_secs(15))
        .redirect(redirect::Policy::none())
        .build()?)
}

/// Client for URLs sourced from third-party data. Allows up to 3 redirects but
/// refuses any redirect to a non-http(s) scheme or to a private/loopback IP —
/// blocking the classic "redirect into the internal network" SSRF pivot.
pub fn build_external_client() -> Result<Client> {
    let policy = redirect::Policy::custom(|attempt| {
        if attempt.previous().len() >= 3 {
            return attempt.error("too many redirects (cap is 3)");
        }
        let url = attempt.url();
        let scheme = url.scheme();
        if scheme != "http" && scheme != "https" {
            return attempt.error("refusing redirect to non-http(s) scheme");
        }
        if is_private_or_special(url) {
            return attempt.error("refusing redirect to private/internal address");
        }
        attempt.follow()
    });
    Ok(Client::builder()
        .user_agent(USER_AGENT)
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(120))
        .redirect(policy)
        .build()?)
}

/// Returns true when the URL's host resolves to a literal address we should
/// never follow a redirect into: loopback, private RFC1918, link-local,
/// IPv6 unique-local/link-local, plus cloud-metadata service hostnames.
fn is_private_or_special(url: &Url) -> bool {
    let Some(raw) = url.host_str() else {
        return true;
    };
    // `Url::host_str` returns IPv6 addresses bracketed (`[::1]`). `IpAddr::parse`
    // refuses brackets, so strip them before deciding.
    let host = raw
        .strip_prefix('[')
        .and_then(|s| s.strip_suffix(']'))
        .unwrap_or(raw);
    if matches!(
        host,
        "metadata.google.internal" | "metadata" | "169.254.169.254"
    ) {
        return true;
    }
    let Ok(ip) = host.parse::<IpAddr>() else {
        return false; // hostname; cannot decide without DNS, accept and let TLS/server handle
    };
    match ip {
        IpAddr::V4(v4) => {
            v4.is_loopback()
                || v4.is_unspecified()
                || v4.is_private()
                || v4.is_link_local()
                || v4.octets()[0] == 0
        }
        IpAddr::V6(v6) => {
            let seg = v6.segments();
            v6.is_loopback()
                || v6.is_unspecified()
                // fc00::/7 unique local
                || (seg[0] & 0xfe00) == 0xfc00
                // fe80::/10 link-local
                || (seg[0] & 0xffc0) == 0xfe80
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn check(host: &str) -> bool {
        is_private_or_special(&Url::parse(&format!("https://{host}/")).unwrap())
    }

    #[test]
    fn flags_loopback_and_metadata() {
        assert!(check("127.0.0.1"));
        assert!(check("169.254.169.254"));
        assert!(check("metadata.google.internal"));
        assert!(check("10.0.0.5"));
        assert!(check("192.168.1.1"));
        assert!(check("172.16.0.1"));
        assert!(check("[::1]"));
        assert!(check("[fe80::1]"));
        assert!(check("[fc00::1]"));
    }

    #[test]
    fn allows_public_hosts() {
        assert!(!check("arxiv.org"));
        assert!(!check("api.crossref.org"));
        assert!(!check("8.8.8.8"));
        assert!(!check("[2606:4700:4700::1111]"));
    }

    #[test]
    fn api_client_builds() {
        assert!(build_api_client().is_ok());
        assert!(build_external_client().is_ok());
    }
}
