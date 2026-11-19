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
        url: "https://pubs.acs.org/rss/apchd5/asap.xml",
        legacy_urls: &["https://pubs.acs.org/action/showFeed?type=etoc&feed=rss&jc=apchd5"],
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
    // dsh optics_rss collector's active feeds.json (Rutice).
    DefaultFeed {
        title: "ACS Applied Optical Materials",
        url: "https://pubs.acs.org/rss/aaoma6/asap.xml",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Advanced Devices & Instrumentation",
        url: "https://spj.science.org/action/showFeed?type=etoc&feed=rss&jc=adi",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Advanced Optical Materials",
        url: "https://onlinelibrary.wiley.com/action/showFeed?type=etoc&feed=rss&jc=21951071",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Advanced Photonics Research",
        url: "https://onlinelibrary.wiley.com/action/showFeed?type=etoc&feed=rss&jc=26999293",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Advanced Quantum Technologies",
        url: "https://onlinelibrary.wiley.com/action/showFeed?type=etoc&feed=rss&jc=25119044",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Advances in Optics and Photonics",
        url: "https://opg.optica.org/rss/aop_feed.xml",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "APL Photonics",
        url: "https://pubs.aip.org/rss/site_1000015/1000010.xml",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Biomedical Optics Express",
        url: "https://opg.optica.org/rss/boe_feed.xml",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Chip",
        url: "https://rss.sciencedirect.com/publication/science/27094723",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "DISPLAYS",
        url: "https://rss.sciencedirect.com/publication/science/01419382",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "eLight",
        url: "https://link.springer.com/search.rss?facet-journal-id=43593",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "EPJ Quantum Technology",
        url: "https://link.springer.com/search.rss?facet-journal-id=40001",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "High Power Laser Science and Engineering",
        url: "https://www.cambridge.org/core/rss/product/id/D30FF81AE5FAEE26735889C8553C99DD",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "IEEE JOURNAL OF SELECTED TOPICS IN QUANTUM ELECTRONICS",
        url: "https://ieeexplore.ieee.org/rss/TOC2944.XML",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "IEEE Photonics Journal",
        url: "https://ieeexplore.ieee.org/rss/TOC4563994.XML",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "IEEE Transactions on Terahertz Science and Technology",
        url: "https://ieeexplore.ieee.org/rss/TOC5503871.XML",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "IET Optoelectronics",
        url: "https://onlinelibrary.wiley.com/feed/17518776/most-recent",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "IMAGE AND VISION COMPUTING",
        url: "https://rss.sciencedirect.com/publication/science/02628856",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "INFRARED PHYSICS & TECHNOLOGY",
        url: "https://rss.sciencedirect.com/publication/science/13504495",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "INTERNATIONAL JOURNAL OF IMAGING SYSTEMS AND TECHNOLOGY",
        url: "https://onlinelibrary.wiley.com/feed/10981098/most-recent",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "International Journal of Optomechatronics",
        url: "https://www.tandfonline.com/feed/rss/uopt20",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Journal of Infrared Millimeter and Terahertz Waves",
        url: "https://link.springer.com/search.rss?facet-journal-id=10762",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "JOURNAL OF LIGHTWAVE TECHNOLOGY",
        url: "https://opg.optica.org/rss/jlt_feed.xml",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Journal of Luminescence",
        url: "https://rss.sciencedirect.com/publication/science/00222313",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Journal of Optical Communications and Networking",
        url: "https://opg.optica.org/rss/jocn_feed.xml",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Journal of Optics",
        url: "https://iopscience.iop.org/journal/rss/2040-8978",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Journal of Physics-Photonics",
        url: "https://iopscience.iop.org/journal/rss/2515-7647",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "JOURNAL OF SYNCHROTRON RADIATION",
        url: "https://onlinelibrary.wiley.com/feed/s16005775/most-recent",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Laser & Photonics Reviews",
        url: "https://onlinelibrary.wiley.com/action/showFeed?type=etoc&feed=rss&jc=18638899",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Light-Advanced Manufacturing",
        url: "https://www.light-am.com/rss/2026_3.xml",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Light-Science & Applications",
        url: "https://www.nature.com/lsa.rss",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Micro and Nano Engineering",
        url: "https://rss.sciencedirect.com/publication/science/25900072",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "MICROELECTRONIC ENGINEERING",
        url: "https://rss.sciencedirect.com/publication/science/01679317",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Optica Quantum",
        url: "https://opg.optica.org/rss/opticaq_feed.xml",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "OPTICAL FIBER TECHNOLOGY",
        url: "https://rss.sciencedirect.com/publication/science/10685200",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "OPTICAL MATERIALS",
        url: "https://rss.sciencedirect.com/publication/science/09253467",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Optical Materials Express",
        url: "https://opg.optica.org/rss/ome_feed.xml",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Optical Switching and Networking",
        url: "https://rss.sciencedirect.com/publication/science/15734277",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "OPTICS AND LASER TECHNOLOGY",
        url: "https://rss.sciencedirect.com/publication/science/00303992",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "OPTICS AND LASERS IN ENGINEERING",
        url: "https://rss.sciencedirect.com/publication/science/01438166",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "OPTICS COMMUNICATIONS",
        url: "https://rss.sciencedirect.com/publication/science/00304018",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Opto-Electronic Advances",
        url: "https://www.oejournal.org/oea/rss/current.xml",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Opto-Electronic Science",
        url: "https://www.oejournal.org/oes/rss/current.xml",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Photonic Sensors",
        url: "https://link.springer.com/search.rss?facet-journal-id=13320",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Photonics and Nanostructures-Fundamentals and Applications",
        url: "https://rss.sciencedirect.com/publication/science/15694410",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "PhotoniX",
        url: "https://link.springer.com/search.rss?facet-journal-id=43074",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "PHYSICAL REVIEW A",
        url: "https://feeds.aps.org/rss/recent/pra.xml",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Results in Optics",
        url: "https://rss.sciencedirect.com/publication/science/26669501",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Ultrafast Science",
        url: "https://spj.science.org/action/showFeed?type=etoc&feed=rss&jc=ultrafastscience",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Chinese Optics Letters",
        url: "https://opg.optica.org/rss/col_feed.xml",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Optics Continuum",
        url: "https://opg.optica.org/rss/optcon_feed.xml",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "IEEE PHOTONICS TECHNOLOGY LETTERS",
        url: "https://ieeexplore.ieee.org/rss/TOC68.XML",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "IEEE JOURNAL OF QUANTUM ELECTRONICS",
        url: "https://ieeexplore.ieee.org/rss/TOC3.XML",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "JOURNAL OF MODERN OPTICS",
        url: "https://www.tandfonline.com/feed/rss/tmop20",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "OPTICAL REVIEW",
        url: "https://link.springer.com/search.rss?facet-journal-id=10043",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "EUROPEAN PHYSICAL JOURNAL D",
        url: "https://link.springer.com/search.rss?facet-journal-id=10053",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "APPLIED PHYSICS B-LASERS AND OPTICS",
        url: "https://link.springer.com/search.rss?facet-journal-id=340",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "ACTA OPTICA SINICA",
        url: "https://www.opticsjournal.net/J/RSS/gxxb",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "CHINESE JOURNAL OF LASERS-ZHONGGUO JIGUANG",
        url: "https://www.opticsjournal.net/J/RSS/zgjg",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Nature",
        url: "https://www.nature.com/nature.rss",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Science",
        url: "https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=science",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Nature Physics",
        url: "https://www.nature.com/nphys.rss",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Nature Materials",
        url: "https://www.nature.com/nmat.rss",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Nature Nanotechnology",
        url: "https://www.nature.com/nnano.rss",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Nature Communications",
        url: "https://www.nature.com/ncomms.rss",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Science Advances",
        url: "https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=sciadv",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Physical Review Letters",
        url: "https://feeds.aps.org/rss/recent/prl.xml",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Physical Review X",
        url: "https://feeds.aps.org/rss/recent/prx.xml",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Physical Review Applied",
        url: "https://feeds.aps.org/rss/recent/prapplied.xml",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Physical Review Research",
        url: "https://feeds.aps.org/rss/recent/prresearch.xml",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Advanced Materials",
        url: "https://onlinelibrary.wiley.com/feed/15214095/most-recent",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Advanced Functional Materials",
        url: "https://onlinelibrary.wiley.com/feed/16163028/most-recent",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "ACS Nano",
        url: "https://pubs.acs.org/rss/ancac3/asap.xml",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Nano Letters",
        url: "https://pubs.acs.org/rss/nalefd/asap.xml",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Nature Reviews Materials",
        url: "https://www.nature.com/natrevmats.rss",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "Nature Energy",
        url: "https://www.nature.com/nenergy.rss",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "JOURNAL OF NONLINEAR OPTICAL PHYSICS & MATERIALS",
        url: "https://www.worldscientific.com/action/showFeed?type=etoc&feed=rss&jc=jnopm",
        legacy_urls: &[],
    },
    DefaultFeed {
        title: "arXiv physics.optics",
        url: "https://rss.arxiv.org/rss/physics.optics",
        legacy_urls: &[],
    },
];
