//! Built-in RSS subscriptions and their known legacy URL aliases.

pub struct DefaultFeed {
    pub title: &'static str,
    pub url: &'static str,
    pub legacy_urls: &'static [&'static str],
}

pub const DEFAULT_FEEDS: &[DefaultFeed] = &[
    DefaultFeed {
        title: "Nature Photonics",
        url: "https://www.nature.com/nphoton.rss",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Optica",
        url: "https://opg.optica.org/rss/optica_feed.xml",
        legacy_urls: &["https://opg.optica.org/optica/rss.cfm"],
    },
    DefaultFeed {
        title: "Optics Letters",
        url: "https://opg.optica.org/rss/ol_feed.xml",
        legacy_urls: &["https://opg.optica.org/ol/rss.cfm"],
    },
    DefaultFeed {
        title: "Optics Express",
        url: "https://opg.optica.org/rss/opex_feed.xml",
        legacy_urls: &["https://opg.optica.org/oe/rss.cfm"],
    },
    DefaultFeed {
        title: "Journal of the Optical Society of America B",
        url: "https://opg.optica.org/rss/josab_feed.xml",
        legacy_urls: &["https://opg.optica.org/josab/rss.cfm"],
    },
    DefaultFeed {
        title: "ACS Photonics",
        url: "https://pubs.acs.org/action/showFeed?type=etoc&feed=rss&jc=apchd5",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Photonics Research",
        url: "https://opg.optica.org/rss/prj_feed.xml",
        legacy_urls: &["https://opg.optica.org/prj/rss.cfm"],
    },
    DefaultFeed {
        title: "Progress in Quantum Electronics",
        url: "https://rss.sciencedirect.com/publication/science/00796727",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Applied Optics",
        url: "https://opg.optica.org/rss/ao_feed.xml",
        legacy_urls: &["https://opg.optica.org/ao/rss.cfm"],
    },
    DefaultFeed {
        title: "Journal of the Optical Society of America A",
        url: "https://opg.optica.org/rss/josaa_feed.xml",
        legacy_urls: &["https://opg.optica.org/josaa/rss.cfm"],
    },
];
