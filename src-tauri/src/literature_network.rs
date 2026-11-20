//! Public citation discovery for explicitly selected library papers.

use std::cmp::Reverse;
use std::collections::{BTreeMap, BTreeSet};
use std::future::Future;
use std::time::Duration;

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Deserializer, Serialize};

use crate::storage::{Paper, PaperRepo};

const WORKS_URL: &str = "https://api.openalex.org/works";
const WORK_FIELDS: &str = "id,doi,display_name,publication_year,cited_by_count,referenced_works,primary_topic,primary_location,authorships";
const MAX_SEEDS: usize = 5;
const CITING_PER_SEED: usize = 18;
const REFS_PER_SEED: usize = 30;
const CO_CITED_CANDIDATES: usize = 30;
const MAX_CANDIDATES: usize = 30;
const MAX_WITNESSES: usize = 3;

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LiteratureNetwork {
    nodes: Vec<Node>,
    edges: Vec<Edge>,
    groups: Vec<Group>,
    unresolved_seed_ids: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Node {
    id: String,
    title: String,
    authors: Vec<String>,
    year: Option<i32>,
    venue: Option<String>,
    doi: Option<String>,
    arxiv_id: Option<String>,
    url: String,
    library_paper_id: Option<String>,
    is_seed: bool,
    group_id: Option<String>,
    citation_count: Option<u64>,
    score: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
enum EdgeKind {
    Citation,
    CoCitation,
    SharedReference,
}

#[derive(Debug, Serialize)]
struct Edge {
    source: String,
    target: String,
    kind: EdgeKind,
    evidence: Vec<Evidence>,
}

#[derive(Debug, Serialize)]
struct Evidence {
    id: String,
    title: String,
    url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Group {
    id: String,
    label: String,
    node_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct Work {
    #[serde(deserialize_with = "deserialize_work_id")]
    id: String,
    doi: Option<String>,
    display_name: Option<String>,
    publication_year: Option<i32>,
    cited_by_count: Option<u64>,
    #[serde(default, deserialize_with = "deserialize_references")]
    referenced_works: BTreeSet<String>,
    primary_topic: Option<Topic>,
    primary_location: Option<Location>,
    #[serde(default)]
    authorships: Vec<Authorship>,
}

#[derive(Debug, Deserialize)]
struct Topic {
    id: Option<String>,
    display_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Location {
    source: Option<NamedEntity>,
}

#[derive(Debug, Deserialize)]
struct Authorship {
    author: NamedEntity,
}

#[derive(Debug, Deserialize)]
struct NamedEntity {
    display_name: Option<String>,
}

#[derive(Deserialize)]
struct WorksResponse {
    results: Vec<Work>,
}

fn work_id(value: &str) -> Option<&str> {
    let id = value.strip_prefix("https://openalex.org/").unwrap_or(value);
    let digits = id.strip_prefix('W')?;
    (!digits.is_empty() && digits.bytes().all(|byte| byte.is_ascii_digit())).then_some(id)
}

fn deserialize_work_id<'de, D: Deserializer<'de>>(deserializer: D) -> Result<String, D::Error> {
    let value = String::deserialize(deserializer)?;
    work_id(&value)
        .map(str::to_owned)
        .ok_or_else(|| serde::de::Error::custom("invalid OpenAlex work ID"))
}

fn deserialize_references<'de, D: Deserializer<'de>>(
    deserializer: D,
) -> Result<BTreeSet<String>, D::Error> {
    let references = Option::<Vec<String>>::deserialize(deserializer)?.unwrap_or_default();
    Ok(references
        .iter()
        .filter_map(|id| work_id(id))
        .map(str::to_owned)
        .collect())
}

fn doi_key(value: &str) -> Option<String> {
    let value = value.trim().to_ascii_lowercase();
    let doi = value
        .strip_prefix("https://doi.org/")
        .or_else(|| value.strip_prefix("http://doi.org/"))
        .or_else(|| value.strip_prefix("doi:"))
        .unwrap_or(&value)
        .trim();
    (doi.starts_with("10.") && doi.contains('/')).then(|| doi.to_owned())
}

fn arxiv_key(value: &str) -> &str {
    let value = value.trim();
    match value.rsplit_once('v') {
        Some((id, version))
            if !version.is_empty() && version.bytes().all(|b| b.is_ascii_digit()) =>
        {
            id
        }
        _ => value,
    }
}

fn paper_dois(paper: &Paper) -> Vec<String> {
    let mut ids: Vec<_> = paper.doi.as_deref().and_then(doi_key).into_iter().collect();
    if let Some(arxiv) = paper.arxiv_id.as_deref().filter(|id| !id.trim().is_empty()) {
        ids.push(format!(
            "10.48550/arxiv.{}",
            arxiv_key(arxiv).to_ascii_lowercase()
        ));
    }
    ids
}

fn normalized_words(value: &str) -> String {
    value
        .split(|ch: char| !ch.is_alphanumeric())
        .filter(|word| !word.is_empty())
        .map(str::to_lowercase)
        .collect::<Vec<_>>()
        .join(" ")
}

fn match_title(paper: &Paper, original_title: &str, works: Vec<Work>) -> Option<Work> {
    let title = normalized_words(original_title);
    let author = paper.authors.first().map(|name| normalized_words(name));
    let mut matches = works.into_iter().filter(|work| {
        !title.is_empty()
            && work.display_name.as_deref().is_some_and(|name| normalized_words(name) == title)
            && !matches!((paper.year, work.publication_year), (Some(left), Some(right)) if left != right)
            && !matches!(
                (&author, work.authorships.first().and_then(|item| item.author.display_name.as_deref())),
                (Some(left), Some(right)) if !left.is_empty() && *left != normalized_words(right)
            )
    });
    let matched = matches.next()?;
    matches.next().is_none().then_some(matched)
}

fn list_works(
    client: &reqwest::Client,
    works_url: &str,
    query: &[(&str, &str)],
    fields: &str,
    limit: usize,
) -> impl Future<Output = Result<Vec<Work>>> + use<> {
    let request = client
        .get(works_url)
        .query(query)
        .query(&[("select", fields), ("per_page", &limit.to_string())])
        .timeout(Duration::from_secs(10));
    async move {
        let response = request
            .send()
            .await
            .map_err(|error| error.without_url())
            .context("Request to OpenAlex failed")?;
        if !response.status().is_success() {
            bail!("OpenAlex returned HTTP {}", response.status());
        }
        Ok(response
            .json::<WorksResponse>()
            .await
            .map_err(|error| error.without_url())
            .context("Invalid OpenAlex works response")?
            .results)
    }
}

async fn resolve_seeds(
    client: &reqwest::Client,
    works_url: &str,
    papers: Vec<(Paper, Option<String>)>,
    unresolved: &mut Vec<String>,
) -> Result<(BTreeMap<String, Work>, BTreeMap<String, Paper>)> {
    let doi_batches: Vec<_> = papers.iter().map(|(paper, _)| paper_dois(paper)).collect();
    let doi_filter = doi_batches
        .iter()
        .flatten()
        .filter(|doi| !doi.contains([',', '|']))
        .cloned()
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect::<Vec<_>>()
        .join("|");
    let mut works = BTreeMap::new();
    let mut works_by_doi = BTreeMap::new();
    if !doi_filter.is_empty() {
        let hits = list_works(
            client,
            works_url,
            &[("filter", &format!("doi:{doi_filter}"))],
            WORK_FIELDS,
            25,
        )
        .await?;
        for work in hits {
            if let Some(doi) = work.doi.as_deref().and_then(doi_key) {
                works_by_doi.insert(doi, work.id.clone());
                works.insert(work.id.clone(), work);
            }
        }
    }

    let mut seeds = BTreeMap::new();
    for ((paper, original_title), dois) in papers.into_iter().zip(doi_batches) {
        let mut id = dois.iter().find_map(|doi| works_by_doi.get(doi)).cloned();
        if let (None, Some(title)) = (&id, original_title.as_deref()) {
            let hits =
                list_works(client, works_url, &[("search", title)], WORK_FIELDS, 25).await?;
            if let Some(work) = match_title(&paper, title, hits) {
                id = Some(work.id.clone());
                works.insert(work.id.clone(), work);
            }
        }
        if let Some(id) = id {
            seeds.entry(id).or_insert(paper);
        } else {
            unresolved.push(paper.id);
        }
    }
    works.retain(|id, _| seeds.contains_key(id));
    Ok((works, seeds))
}

async fn fetch_citing(
    client: &reqwest::Client,
    works_url: &str,
    seeds: &BTreeMap<String, Paper>,
) -> Result<Vec<Work>> {
    let mut pending = tokio::task::JoinSet::new();
    for id in seeds.keys().cloned() {
        pending.spawn(list_works(
            client,
            works_url,
            &[
                ("filter", &format!("cites:{id}")),
                ("sort", "cited_by_count:desc"),
            ],
            WORK_FIELDS,
            CITING_PER_SEED,
        ));
    }
    let mut citing = BTreeMap::new();
    while let Some(result) = pending.join_next().await {
        for work in result?? {
            citing.entry(work.id.clone()).or_insert(work);
        }
    }
    Ok(citing.into_values().collect())
}

async fn fetch_by_id<'a>(
    client: &reqwest::Client,
    works_url: &str,
    ids: impl IntoIterator<Item = &'a str>,
    fields: &str,
) -> Result<Vec<Work>> {
    let ids: Vec<_> = ids.into_iter().collect();
    let mut works = Vec::new();
    for chunk in ids.chunks(50) {
        let filter = format!("openalex:{}", chunk.join("|"));
        works.extend(list_works(client, works_url, &[("filter", &filter)], fields, chunk.len()).await?);
    }
    Ok(works)
}

pub(crate) async fn load(
    repo: &PaperRepo<'_>,
    client: &reqwest::Client,
    paper_ids: Vec<String>,
) -> Result<LiteratureNetwork> {
    load_from(repo, client, WORKS_URL, paper_ids).await
}

pub(crate) async fn load_from(
    repo: &PaperRepo<'_>,
    client: &reqwest::Client,
    works_url: &str,
    paper_ids: Vec<String>,
) -> Result<LiteratureNetwork> {
    let ids: BTreeSet<_> = paper_ids.into_iter().collect();
    if ids.is_empty() || ids.len() > MAX_SEEDS {
        bail!("Select between 1 and {MAX_SEEDS} library papers");
    }
    let mut network = LiteratureNetwork::default();
    let mut papers = Vec::new();
    for id in ids {
        match repo.get_literature_seed(&id).await? {
            Some(paper) => papers.push(paper),
            None => network.unresolved_seed_ids.push(id),
        }
    }
    let (mut works, seeds) =
        resolve_seeds(client, works_url, papers, &mut network.unresolved_seed_ids).await?;
    if seeds.is_empty() {
        return Ok(network);
    }
    let citing = fetch_citing(client, works_url, &seeds).await?;
    let ids = candidate_ids(&works, &citing);
    let candidates = fetch_by_id(client, works_url, ids, WORK_FIELDS).await?;
    for work in citing.into_iter().chain(candidates) {
        works.entry(work.id.clone()).or_insert(work);
    }
    let (nodes, mut edges, groups) = assemble(&works, &seeds);
    network.nodes = nodes;
    network.groups = groups;

    let missing_witnesses: BTreeSet<_> = edges
        .iter()
        .flat_map(|edge| &edge.evidence)
        .filter(|evidence| !works.contains_key(evidence.id.as_str()))
        .map(|evidence| evidence.id.as_str())
        .collect();
    // Links remain useful when the API has no title for a cited record.
    if let Ok(witnesses) = fetch_by_id(client, works_url, missing_witnesses, "id,display_name").await {
        let titles: BTreeMap<_, _> = witnesses
            .into_iter()
            .filter_map(|work| work.display_name.map(|title| (work.id, title)))
            .collect();
        for evidence in edges.iter_mut().flat_map(|edge| &mut edge.evidence) {
            if let Some(title) = titles.get(&evidence.id) {
                evidence.title.clone_from(title);
            }
        }
    }
    network.edges = edges;
    for node in network.nodes.iter_mut().filter(|node| !node.is_seed) {
        let mut paper = None;
        if let Some(doi) = node.doi.as_deref() {
            paper = repo.find_by_doi(doi).await?;
        }
        if paper.is_none() {
            if let Some(arxiv) = node.arxiv_id.as_deref() {
                paper = repo.find_by_arxiv_id(arxiv).await?;
            }
        }
        node.library_paper_id = paper.map(|paper| paper.id);
    }
    Ok(network)
}

fn candidate_ids<'a>(seeds: &'a BTreeMap<String, Work>, citing: &'a [Work]) -> BTreeSet<&'a str> {
    let mut ids = BTreeSet::new();
    let mut counts = BTreeMap::new();
    for work in citing.iter().filter(|work| {
        work.referenced_works
            .iter()
            .any(|id| seeds.contains_key(id))
    }) {
        for id in &work.referenced_works {
            if !seeds.contains_key(id) {
                *counts.entry(id.as_str()).or_insert(0) += 1;
            }
        }
    }
    // Prioritize references corroborated by citing papers, with a budget for each seed.
    for seed in seeds.values() {
        let mut references: Vec<_> = seed
            .referenced_works
            .iter()
            .map(String::as_str)
            .filter(|id| !seeds.contains_key(*id))
            .collect();
        references.sort_unstable_by_key(|id| (Reverse(counts.get(id).copied().unwrap_or(0)), *id));
        ids.extend(references.into_iter().take(REFS_PER_SEED));
    }
    let citing_ids: BTreeSet<_> = citing.iter().map(|work| work.id.as_str()).collect();
    let mut co_cited: Vec<_> = counts
        .into_iter()
        .filter(|(id, _)| !ids.contains(id) && !citing_ids.contains(id))
        .collect();
    co_cited.sort_unstable_by_key(|&(id, count)| (Reverse(count), id));
    ids.extend(
        co_cited
            .into_iter()
            .take(CO_CITED_CANDIDATES)
            .map(|(id, _)| id),
    );
    ids.retain(|id| !citing_ids.contains(id));
    ids
}

fn work_url(id: &str) -> String {
    format!("https://openalex.org/{id}")
}

fn edge(
    source: &str,
    target: &str,
    kind: EdgeKind,
    witnesses: impl IntoIterator<Item = impl AsRef<str>>,
    works: &BTreeMap<String, Work>,
) -> Edge {
    Edge {
        source: source.to_owned(),
        target: target.to_owned(),
        kind,
        evidence: witnesses
            .into_iter()
            .take(MAX_WITNESSES)
            .map(|id| {
                let id = id.as_ref();
                let title = works
                    .get(id)
                    .and_then(|work| work.display_name.as_deref())
                    .unwrap_or(id);
                Evidence {
                    id: id.to_owned(),
                    title: title.to_owned(),
                    url: work_url(id),
                }
            })
            .collect(),
    }
}

fn assemble(
    works: &BTreeMap<String, Work>,
    seeds: &BTreeMap<String, Paper>,
) -> (Vec<Node>, Vec<Edge>, Vec<Group>) {
    let mut citing: BTreeMap<&str, BTreeSet<&str>> = BTreeMap::new();
    for work in works.values() {
        for id in &work.referenced_works {
            if works.contains_key(id) && *id != work.id {
                citing.entry(id).or_default().insert(&work.id);
            }
        }
    }
    let no_citers = BTreeSet::new();
    let mut ranked = Vec::new();
    for work in works.values().filter(|work| !seeds.contains_key(&work.id)) {
        let work_citers = citing.get(work.id.as_str()).unwrap_or(&no_citers);
        let mut score = 0;
        for seed_id in seeds.keys() {
            let seed = &works[seed_id];
            let seed_citers = citing.get(seed_id.as_str()).unwrap_or(&no_citers);
            let direct = usize::from(work.referenced_works.contains(seed_id))
                + usize::from(seed.referenced_works.contains(&work.id));
            let co_cited = work_citers.intersection(seed_citers).count();
            let shared = work
                .referenced_works
                .intersection(&seed.referenced_works)
                .filter(|id| id.as_str() != work.id && id.as_str() != seed_id)
                .count();
            score += direct * 8 + 2 * co_cited.min(MAX_WITNESSES) + shared.min(MAX_WITNESSES);
        }
        if score > 0 {
            ranked.push((work, score));
        }
    }
    ranked.sort_unstable_by_key(|&(work, score)| {
        (Reverse(score), Reverse(work.cited_by_count), &work.id)
    });

    let selected: Vec<_> = seeds
        .keys()
        .map(|id| (&works[id], 0))
        .chain(ranked.into_iter().take(MAX_CANDIDATES))
        .collect();
    let mut nodes = Vec::with_capacity(selected.len());
    let mut edges = Vec::new();
    let mut groups = BTreeMap::new();
    for (index, &(work, score)) in selected.iter().enumerate() {
        let seed = seeds.get(&work.id);
        let doi = work.doi.as_deref().and_then(doi_key);
        let topic = work
            .primary_topic
            .as_ref()
            .and_then(|topic| Some((topic.id.as_ref()?, topic.display_name.as_ref()?)))
            .filter(|(id, label)| !id.is_empty() && !label.trim().is_empty());
        if let Some((id, label)) = topic {
            groups
                .entry(id)
                .or_insert_with(|| Group {
                    id: id.clone(),
                    label: label.clone(),
                    node_ids: Vec::new(),
                })
                .node_ids
                .push(work.id.clone());
        }
        nodes.push(Node {
            id: work.id.clone(),
            title: work
                .display_name
                .clone()
                .or_else(|| seed.map(|paper| paper.title.clone()))
                .unwrap_or_else(|| work.id.clone()),
            authors: work
                .authorships
                .iter()
                .filter_map(|item| item.author.display_name.clone())
                .collect(),
            year: work.publication_year,
            venue: work
                .primary_location
                .as_ref()
                .and_then(|location| location.source.as_ref())
                .and_then(|source| source.display_name.clone()),
            arxiv_id: seed.and_then(|paper| paper.arxiv_id.clone()).or_else(|| {
                doi.as_deref()
                    .and_then(|doi| doi.strip_prefix("10.48550/arxiv."))
                    .map(str::to_owned)
            }),
            doi,
            url: work_url(&work.id),
            library_paper_id: seed.map(|paper| paper.id.clone()),
            is_seed: seed.is_some(),
            group_id: topic.map(|(id, _)| id.clone()),
            citation_count: work.cited_by_count,
            score,
        });
        for &(other, _) in &selected[index + 1..] {
            for (source, target) in [(work, other), (other, work)] {
                if source.referenced_works.contains(&target.id) {
                    edges.push(edge(
                        &source.id,
                        &target.id,
                        EdgeKind::Citation,
                        [&source.id],
                        works,
                    ));
                }
            }
            // Indirect edges explain each seed's neighborhood. Direct edges also connect candidates.
            if seed.is_none() && !seeds.contains_key(&other.id) {
                continue;
            }
            let work_citers = citing.get(work.id.as_str()).unwrap_or(&no_citers);
            let other_citers = citing.get(other.id.as_str()).unwrap_or(&no_citers);
            let mut co_cited = work_citers.intersection(other_citers).peekable();
            if co_cited.peek().is_some() {
                edges.push(edge(
                    &work.id,
                    &other.id,
                    EdgeKind::CoCitation,
                    co_cited,
                    works,
                ));
            }
            let mut shared = work
                .referenced_works
                .intersection(&other.referenced_works)
                .filter(|id| id.as_str() != work.id && id.as_str() != other.id)
                .peekable();
            if shared.peek().is_some() {
                edges.push(edge(
                    &work.id,
                    &other.id,
                    EdgeKind::SharedReference,
                    shared,
                    works,
                ));
            }
        }
    }
    let mut groups: Vec<_> = groups.into_values().collect();
    groups.sort_unstable_by(|left, right| {
        right
            .node_ids
            .len()
            .cmp(&left.node_ids.len())
            .then_with(|| left.label.cmp(&right.label))
            .then_with(|| left.id.cmp(&right.id))
    });
    (nodes, edges, groups)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ingest::PaperDraft;
    use crate::storage::run_migrations;

    #[test]
    fn edges_use_independent_witnesses_and_keep_topic_membership() {
        let raw = serde_json::json!([
            {"id": "W1", "display_name": "Seed", "referenced_works": ["https://openalex.org/W2", "W4"],
             "primary_topic": {"id": "T1", "display_name": "Networks"}},
            {"id": "W2", "display_name": "Reference", "referenced_works": ["W4"],
             "primary_topic": {"id": "T1", "display_name": "Networks"}},
            {"id": "W3", "display_name": "Citing paper", "referenced_works": ["W1", "W2", "W5"]},
            {"id": "W5", "display_name": "Co-cited candidate"},
            {"id": "W6", "display_name": "Unrelated"}
        ]);
        let works: BTreeMap<_, _> = serde_json::from_value::<Vec<Work>>(raw)
            .unwrap()
            .into_iter()
            .map(|work| (work.id.clone(), work))
            .collect();
        let paper = PaperDraft {
            title: "Seed".into(),
            ..Default::default()
        }
        .into_paper();
        let seeds = BTreeMap::from([("W1".to_owned(), paper)]);
        let (nodes, edges, groups) = assemble(&works, &seeds);
        assert_eq!(
            nodes
                .iter()
                .map(|node| node.id.as_str())
                .collect::<Vec<_>>(),
            ["W1", "W2", "W3", "W5"]
        );
        assert_eq!(groups[0].node_ids, ["W1", "W2"]);
        assert_eq!(nodes.last().unwrap().group_id, None);
        let relation = |source: &str, target: &str, kind| {
            let edge = edges
                .iter()
                .find(|edge| edge.source == source && edge.target == target && edge.kind == kind)
                .unwrap();
            edge.evidence
                .iter()
                .map(|item| item.id.as_str())
                .collect::<Vec<_>>()
        };
        assert_eq!(relation("W1", "W2", EdgeKind::Citation), ["W1"]);
        assert_eq!(relation("W3", "W1", EdgeKind::Citation), ["W3"]);
        assert_eq!(relation("W1", "W2", EdgeKind::CoCitation), ["W3"]);
        assert_eq!(relation("W1", "W2", EdgeKind::SharedReference), ["W4"]);
        assert_eq!(relation("W1", "W5", EdgeKind::CoCitation), ["W3"]);
    }

    #[tokio::test]
    #[ignore = "queries the live OpenAlex API"]
    async fn live_network_from_library_seed() {
        let pool = sqlx::SqlitePool::connect("sqlite::memory:").await.unwrap();
        run_migrations(&pool).await.unwrap();
        let repo = PaperRepo::new(&pool);
        let mut seed = PaperDraft {
            title: "Attention Is All You Need".into(),
            arxiv_id: Some("1706.03762v7".into()),
            ..Default::default()
        }
        .into_paper();
        seed.pdf_path = Some("attention.pdf".into());
        repo.insert(&seed).await.unwrap();
        let client = crate::http::build_api_client().unwrap();
        let graph = load(&repo, &client, vec![seed.id.clone(), "missing".into()])
            .await
            .unwrap();
        assert_eq!(graph.unresolved_seed_ids, ["missing"]);
        assert!(
            graph
                .nodes
                .iter()
                .any(|node| node.is_seed
                    && node.library_paper_id.as_deref() == Some(seed.id.as_str()))
        );
        assert!(graph.nodes.iter().any(|node| !node.is_seed));
        assert!(graph
            .edges
            .iter()
            .any(|edge| edge.kind == EdgeKind::Citation));
        assert!(graph
            .edges
            .iter()
            .any(|edge| edge.kind == EdgeKind::CoCitation));
        assert!(graph
            .edges
            .iter()
            .any(|edge| edge.kind == EdgeKind::SharedReference));
        assert!(!graph.groups.is_empty());
        println!(
            "{} nodes, {} edges, {} groups",
            graph.nodes.len(),
            graph.edges.len(),
            graph.groups.len()
        );
        for edge in graph.edges.iter().filter(|edge| {
            (edge.source == "W2626778328"
                && matches!(edge.target.as_str(), "W2963341956" | "W3094502228"))
                || (edge.target == "W2626778328"
                    && matches!(edge.source.as_str(), "W2963341956" | "W3094502228"))
        }) {
            println!("{}", serde_json::to_string(edge).unwrap());
        }
    }
}
