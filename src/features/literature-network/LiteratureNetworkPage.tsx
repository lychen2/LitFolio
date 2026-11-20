import { useId, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { isTauri } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Check, ChevronDown, ChevronRight, ExternalLink, Globe, Languages, Network, Plus, Search, Spinner, X } from "@/components/icons";
import { Button, IconButton, Input } from "@/components/ui";
import { useI18n, useT } from "@/i18n/I18nProvider";
import { formatMessage } from "@/i18n/format";
import { libraryApi } from "@/lib/apiLibrary";
import { errorMessage } from "@/lib/error";
import type { Paper } from "@/lib/types/library";
import CitationPerspectives from "./CitationPerspectives";
import { networkCopy } from "./copy";
import type { NetworkCopy } from "./copy";
import { loadLiteratureNetwork } from "./network";
import type { LiteratureNetwork, LiteratureNetworkNode } from "./network";
import { RelationshipGraph, relationshipLabel, relationshipLabels } from "./RelationshipGraph";
import { groupRelationships, networkEdgeId } from "./relationshipLayout";
import type { RelationshipPair } from "./relationshipLayout";
import { useNetworkTitleTranslation } from "./useNetworkTitleTranslation";
import "./LiteratureNetworkPage.css";

const MAX_SEEDS = 5;

export default function LiteratureNetworkPage() {
  const { lang } = useI18n();
  const copy = networkCopy[lang];
  const seedHeading = useId();
  const pickerId = useId();
  const [seeds, setSeeds] = useState<Paper[]>([]);
  const [pickerOpen, setPickerOpen] = useState(true);
  const requesting = useRef(false);
  const discovery = useMutation({
    mutationFn: loadLiteratureNetwork,
    networkMode: "always",
    retry: false,
    onSettled: () => { requesting.current = false; },
  });

  function toggleSeed(paper: Paper) {
    if (requesting.current) return;
    discovery.reset();
    setSeeds((current) => {
      if (current.some((seed) => seed.id === paper.id)) return current.filter((seed) => seed.id !== paper.id);
      return current.length < MAX_SEEDS ? [...current, paper] : current;
    });
  }

  function discover() {
    if (requesting.current || seeds.length === 0) return;
    requesting.current = true;
    setPickerOpen(false);
    discovery.mutate(seeds.map((seed) => seed.id));
  }

  const unresolved = discovery.data
    ? seeds.filter((seed) => discovery.data.unresolvedSeedIds.includes(seed.id))
    : [];

  return (
    <div className="literature-network">
      <PageHeader title={copy.title} icon={<Network />} />
      <div className="literature-network__body">
        <section className="litera-panel literature-network__seeds" aria-labelledby={seedHeading}>
          <div className="literature-network__seed-toolbar">
            <div>
              <h2 className="literature-network__heading" id={seedHeading}>{copy.seeds}</h2>
              <p className="literature-network__note">{copy.seedHint}</p>
            </div>
            <div className="literature-network__actions">
              <Button aria-controls={pickerOpen ? pickerId : undefined} aria-expanded={pickerOpen} onClick={() => setPickerOpen(!pickerOpen)}>
                {pickerOpen ? <ChevronDown aria-hidden="true" /> : <Plus aria-hidden="true" />} {copy.picker}
              </Button>
              <Button variant="primary" onClick={discover} disabled={seeds.length === 0 || discovery.isPending}>
                {discovery.isPending ? <Spinner className="h-4 w-4" /> : <Globe aria-hidden="true" />}
                {copy.discover}
              </Button>
            </div>
          </div>
          <div className="literature-network__seed-selection">
            <p className="literature-network__note" role="status">{formatMessage(copy.seedCount, { count: seeds.length })}</p>
            {seeds.length > 0 && <ul className="literature-network__seed-chips">
              {seeds.map((seed) => (
                <li key={seed.id} className="literature-network__seed-chip">
                  <span title={seed.title}>{seed.title}</span>
                  <IconButton size="sm" label={formatMessage(copy.removeSeed, { title: seed.title })} disabled={discovery.isPending} onClick={() => toggleSeed(seed)}>
                    <X aria-hidden="true" />
                  </IconButton>
                </li>
              ))}
            </ul>}
          </div>
          <p className="literature-network__note">{copy.discoveryHint}</p>
          {pickerOpen && <SeedPicker id={pickerId} seeds={seeds} onToggle={toggleSeed} disabled={discovery.isPending} copy={copy} />}
        </section>

        {discovery.isPending && <p className="literature-network__notice" role="status">{copy.discovering}</p>}
        {discovery.isError && <p className="literature-network__notice literature-network__error" role="alert">
          {copy.discoveryError} {errorMessage(discovery.error)}
        </p>}
        {unresolved.length > 0 && <div className="literature-network__notice" role="status">
          <p>{copy.unresolved}</p>
          <ul className="literature-network__unresolved">{unresolved.map((seed) => <li key={seed.id}>{seed.title}</li>)}</ul>
        </div>}
        {discovery.data && (discovery.data.nodes.length > 0
          ? <NetworkResults result={discovery.data} copy={copy} />
          : <p className="literature-network__notice" role="status">{copy.noNetwork}</p>)}
      </div>
    </div>
  );
}

function SeedPicker({ id, seeds, onToggle, disabled, copy }: {
  id: string;
  seeds: Paper[];
  onToggle: (paper: Paper) => void;
  disabled: boolean;
  copy: NetworkCopy;
}) {
  const t = useT();
  const inputId = useId();
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const papers = useQuery({
    queryKey: ["papers", "literature-network-seeds", search],
    queryFn: () => search ? libraryApi.papersSearch(search, 24) : libraryApi.papersRecent(8),
    networkMode: "always",
  });
  const listLabel = search ? copy.searchResults : copy.recent;

  return (
    <div id={id} className="literature-network__picker">
      <form className="literature-network__search" role="search" onSubmit={(event) => {
        event.preventDefault();
        setSearch(input.trim());
      }}>
        <label htmlFor={inputId} className="sr-only">{copy.searchLabel}</label>
        <Input id={inputId} type="search" value={input} placeholder={copy.searchPlaceholder} onChange={(event) => {
          setInput(event.target.value);
          if (!event.target.value.trim()) setSearch("");
        }} />
        <Button type="submit"><Search aria-hidden="true" /> {t("common.search")}</Button>
      </form>
      <div aria-busy={papers.isPending}>
        {papers.isPending && <p className="literature-network__note" role="status">{t("route.loading")}</p>}
        {papers.isError && <div className="literature-network__actions">
          <p className="literature-network__error" role="alert">{copy.libraryError}</p>
          <Button size="sm" onClick={() => { void papers.refetch(); }}>{t("common.retry")}</Button>
        </div>}
        {papers.data && (papers.data.length === 0
          ? <p className="literature-network__note" role="status">{search ? copy.noMatches : copy.emptyLibrary}</p>
          : <ul className="literature-network__choices" aria-label={listLabel}>
            {papers.data.map((paper) => {
              const selected = seeds.some((seed) => seed.id === paper.id);
              const meta = [paper.authors.join(", "), paper.year].filter(Boolean).join(" · ");
              return <li key={paper.id}><button type="button" className="literature-network__choice"
                aria-pressed={selected} aria-label={paper.title} title={paper.title}
                disabled={disabled || (!selected && seeds.length >= MAX_SEEDS)} onClick={() => onToggle(paper)}>
                {selected ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
                <span className="literature-network__choice-copy">
                  <span>{paper.title}</span>
                  {meta && <span className="literature-network__note">{meta}</span>}
                </span>
              </button></li>;
            })}
          </ul>)}
      </div>
    </div>
  );
}

function NetworkResults({ result, copy }: { result: LiteratureNetwork; copy: NetworkCopy }) {
  const mapHeading = useId();
  const paperHeading = useId();
  const evidenceHeading = useId();
  const topicFilter = useId();
  const [topic, setTopic] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPairId, setSelectedPairId] = useState<string | null>(null);
  const { displayResult, translating, showingTranslation, error, toggle } = useNetworkTitleTranslation(result);
  const topics = displayResult.groups;
  const activeTopic = topics.find((group) => `group:${group.id}` === topic);
  const visibleIds = useMemo(() => new Set(result.nodes.filter((node) => !topic
    || (topic === "unclassified" ? node.groupId === null : `group:${node.groupId}` === topic)).map(({ id }) => id)), [result.nodes, topic]);
  const visiblePapers = useMemo(() => displayResult.nodes.filter(({ id }) => visibleIds.has(id)), [displayResult.nodes, visibleIds]);
  const nodes = useMemo(() => new Map(displayResult.nodes.map((node) => [node.id, node])), [displayResult.nodes]);
  const pairs = useMemo(() => groupRelationships(displayResult.edges), [displayResult.edges]);
  const visiblePairs = useMemo(() => pairs.filter(({ source, target }) => visibleIds.has(source) && visibleIds.has(target)), [pairs, visibleIds]);
  const selected = selectedId ? nodes.get(selectedId) : undefined;
  const selectedPair = pairs.find(({ id }) => id === selectedPairId);
  const related = selectedId ? pairs.filter(({ source, target }) => source === selectedId || target === selectedId) : [];
  const hasRelated = displayResult.nodes.some((node) => !node.isSeed);
  const hasUnclassified = displayResult.nodes.some((node) => node.groupId === null);
  const translationLabel = translating ? copy.translating : showingTranslation ? copy.showOriginal : error ? copy.retryTranslation : copy.translate;

  function setSelected(node: LiteratureNetworkNode | null) {
    if (node && !visibleIds.has(node.id)) setTopic("");
    setSelectedId(node?.id ?? null);
    setSelectedPairId(null);
  }

  function selectPair(pair: RelationshipPair) {
    if (!visibleIds.has(pair.source) || !visibleIds.has(pair.target)) setTopic("");
    setSelectedPairId(pair.id);
  }

  return (
    <div className="literature-network__results">
      <section className="litera-panel literature-network__map" aria-labelledby={mapHeading}>
        <div className="literature-network__section-head">
          <div className="literature-network__graph-intro">
            <h2 className="literature-network__heading" id={mapHeading}>{copy.map}</h2>
            <p className="literature-network__note">{copy.mapHint}</p>
          </div>
          <Button size="sm" aria-pressed={showingTranslation} disabled={translating} onClick={() => { void toggle(); }}>
            {translating ? <Spinner className="h-4 w-4" /> : <Languages aria-hidden="true" />} {translationLabel}
          </Button>
        </div>
        <div className="literature-network__graph-toolbar">
          <div className="literature-network__topic-filter">
            <label className="sr-only" htmlFor={topicFilter}>{copy.filterTopic}</label>
            <select id={topicFilter} value={topic} onChange={(event) => {
              setTopic(event.target.value);
              setSelected(null);
            }}>
              <option value="">{copy.allTopics}</option>
              {topics.map((group) => <option key={group.id} value={`group:${group.id}`}>{group.label}</option>)}
              {hasUnclassified && <option value="unclassified">{copy.unclassified}</option>}
            </select>
          </div>
          <span className="literature-network__note" role="status">{visiblePairs.length === 1 ? copy.singleRelationship
            : formatMessage(copy.relationships, { count: visiblePairs.length })}</span>
        </div>
        {error && <p className="literature-network__translation-error literature-network__error" role="alert">{copy.translationError} {errorMessage(error)}</p>}
        <RelationshipGraph key={topic} result={result} visibleIds={visibleIds} papers={visiblePapers} pairs={visiblePairs} selectedId={selectedId}
          selectedPairId={selectedPairId} copy={copy} onSelectPaper={setSelected} onSelectPair={selectPair} />
        {(selected || selectedPair) && <div className="literature-network__evidence-jump">
          <Button size="sm" onClick={() => document.getElementById(evidenceHeading)?.focus()}>{copy.viewEvidence}</Button>
        </div>}
      </section>

      <div className="literature-network__side">
        {(selected || selectedPair) && <EvidencePanel headingId={evidenceHeading} node={selected} pair={selectedPair} nodes={nodes} related={related} copy={copy}
          onSelectPair={selectPair} onBack={() => setSelectedPairId(null)} onClose={() => setSelected(null)} />}
        <section className="litera-panel literature-network__papers" aria-labelledby={paperHeading}>
          <div className="literature-network__section-head">
            <div>
              <h2 className="literature-network__heading" id={paperHeading}>{copy.papers}</h2>
              <p className="literature-network__note" role="status">
                {topic && <span>{activeTopic?.label ?? copy.unclassified} · </span>}
                {visiblePapers.length === 1 ? copy.singlePaper : formatMessage(copy.paperCount, { count: visiblePapers.length })}
              </p>
            </div>
          </div>
          {!hasRelated && <p className="literature-network__notice" role="status">{copy.noCandidates}</p>}
          {!selected && !selectedPair && <p className="literature-network__paper-hint literature-network__note">{copy.graphSelectHint}</p>}
          <ul className="literature-network__paper-list">
            {visiblePapers.map((node) => (
              <li key={node.id}>
                <button type="button" className="literature-network__paper" aria-pressed={selectedId === node.id && !selectedPair}
                  onClick={() => setSelected(node)}>
                  <span className="literature-network__dot" data-seed={node.isSeed} aria-hidden="true" />
                  <span className="literature-network__paper-copy">
                    <span className="literature-network__paper-title">{node.title}</span>
                    <PaperMeta node={node} copy={copy} />
                    {node.isSeed && <span className="literature-network__seed-label">{copy.seedLegend}</span>}
                  </span>
                  <ChevronRight aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <div className="literature-network__perspectives"><CitationPerspectives result={displayResult} onSelect={setSelected} /></div>
    </div>
  );
}

function PaperMeta({ node, copy, full = false }: { node: LiteratureNetworkNode; copy: NetworkCopy; full?: boolean }) {
  const authors = full || node.authors.length <= 2 ? node.authors.join(", ") : `${node.authors.slice(0, 2).join(", ")}…`;
  const citations = node.citationCount === null ? null : formatMessage(copy.citationCount, { count: node.citationCount });
  const meta = [authors, node.year, node.venue, citations].filter(Boolean).join(" · ");
  return meta ? <span className="literature-network__note">{meta}</span> : null;
}

function EvidencePanel({ headingId, node, pair, nodes, related, copy, onSelectPair, onBack, onClose }: {
  headingId: string;
  node: LiteratureNetworkNode | undefined;
  pair: RelationshipPair | undefined;
  nodes: ReadonlyMap<string, LiteratureNetworkNode>;
  related: RelationshipPair[];
  copy: NetworkCopy;
  onSelectPair: (pair: RelationshipPair) => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const [openError, setOpenError] = useState(false);
  const source = pair ? nodes.get(pair.source) : undefined;
  const target = pair ? nodes.get(pair.target) : undefined;

  function followExternal(event: MouseEvent<HTMLAnchorElement>) {
    if (!isTauri()) return;
    event.preventDefault();
    setOpenError(false);
    void openUrl(event.currentTarget.href).catch(() => setOpenError(true));
  }

  return (
    <section className="litera-panel literature-network__inspector" aria-labelledby={headingId}>
      <div className="literature-network__inspector-heading">
        <h2 className="literature-network__heading" id={headingId} tabIndex={-1}>{copy.evidence}</h2>
        <IconButton size="sm" label={copy.clearSelection} onClick={onClose}><X aria-hidden="true" /></IconButton>
      </div>
      <div className="literature-network__inspector-content">
        {openError && <p className="literature-network__error" role="alert">{copy.openLinkError}</p>}
        {pair && source && target ? <>
          {node && <Button size="sm" onClick={onBack}>{formatMessage(copy.backToPaper, { title: node.title })}</Button>}
          <div className="literature-network__endpoints">
            <div>{source.url ? <a href={source.url} target="_blank" rel="noreferrer" onClick={followExternal}>{source.title}</a> : source.title}</div>
            <div>{target.url ? <a href={target.url} target="_blank" rel="noreferrer" onClick={followExternal}>{target.title}</a> : target.title}</div>
          </div>
          <p className="literature-network__note">{copy.evidenceSource}</p>
          {pair.edges.map((edge) => {
            const citing = edge.source === source.id ? source : target;
            const cited = edge.target === target.id ? target : source;
            const witnessLabel = edge.kind === "citation" ? copy.citingSource
              : edge.kind === "co_citation" ? copy.coCitingSources : copy.sharedSources;
            return <section key={networkEdgeId(edge)} className="literature-network__witnesses">
              <h3 className="literature-network__relation">{relationshipLabel(edge, copy)}</h3>
              {edge.kind === "citation" && <p>{formatMessage(copy.citationDirection, { source: citing.title, target: cited.title })}</p>}
              <p>{witnessLabel}</p>
              <ul>{edge.evidence.map((witness) => <li key={witness.id}>
                <a href={witness.url} target="_blank" rel="noreferrer" onClick={followExternal}>{witness.title}</a>
              </li>)}</ul>
            </section>;
          })}
        </> : node && <>
          <div className="literature-network__selected-paper">
            <h3>{node.title}</h3>
            <PaperMeta node={node} copy={copy} full />
          </div>
          {(node.libraryPaperId || node.url) && <div className="literature-network__actions">
            {node.libraryPaperId && <Link className="litera-btn" to={`/reader/${encodeURIComponent(node.libraryPaperId)}`}>{copy.openReader}</Link>}
            {node.url && <a className="litera-btn" href={node.url} target="_blank" rel="noreferrer" onClick={followExternal}>
              <ExternalLink aria-hidden="true" /> {copy.openPaper}
            </a>}
          </div>}
          {related.length === 0 ? <p className="literature-network__note">{copy.evidenceEmpty}</p> : <ul className="literature-network__evidence-list">
            {related.map((candidate) => {
              const other = nodes.get(candidate.source === node.id ? candidate.target : candidate.source);
              if (!other) return null;
              return <li key={other.id}>
                <button type="button" className="literature-network__edge-choice" onClick={() => onSelectPair(candidate)}>
                  <span><strong>{other.title}</strong><span className="literature-network__relation">{relationshipLabels(candidate, copy, node.id)}</span></span>
                  <ChevronRight aria-hidden="true" />
                </button>
              </li>;
            })}
          </ul>}
        </>}
      </div>
    </section>
  );
}
