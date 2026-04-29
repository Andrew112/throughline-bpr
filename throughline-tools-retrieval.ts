import type { Citation } from "../schemas/process.js";

/**
 * A document chunk. In production these come from Supabase + pgvector,
 * indexed via Voyage AI embeddings. For the runnable example we use a
 * deterministic in-memory keyword retriever over a fixture corpus —
 * the Cartographer doesn't know or care about the difference.
 */
export interface Chunk {
  document_id: string;
  chunk_id: string;
  source: "notion" | "drive" | "jira" | "slack";
  text: string;
}

export interface RetrievedChunk extends Chunk {
  score: number;
}

/**
 * The corpus is module-scoped so the example is reproducible. In production
 * this is a per-project query against pgvector with row-level security.
 */
let CORPUS: Chunk[] = [];

export function loadCorpus(chunks: Chunk[]): void {
  CORPUS = chunks;
}

/**
 * Trivial keyword retrieval. Token overlap with light normalization.
 * This is intentionally not BM25 or semantic search — those are Module 4
 * material. The point here is that the Cartographer treats retrieval as
 * a tool with a stable contract; the implementation behind the contract
 * can swap freely.
 */
export function retrieveChunks(args: {
  query: string;
  k?: number;
  filter?: { source?: Chunk["source"] };
}): RetrievedChunk[] {
  const k = args.k ?? 6;
  const queryTokens = tokenize(args.query);
  if (queryTokens.length === 0) return [];

  const scored: RetrievedChunk[] = CORPUS
    .filter((c) => !args.filter?.source || c.source === args.filter.source)
    .map((c) => {
      const docTokens = tokenize(c.text);
      const docSet = new Set(docTokens);
      let overlap = 0;
      for (const t of queryTokens) if (docSet.has(t)) overlap += 1;
      const score = overlap / Math.sqrt(docTokens.length || 1);
      return { ...c, score };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);

  return scored;
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

const STOPWORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "had",
  "her", "was", "one", "our", "out", "day", "get", "has", "him", "his",
  "how", "man", "new", "now", "old", "see", "two", "way", "who", "boy",
  "did", "its", "let", "put", "say", "she", "too", "use", "this", "that",
  "with", "from", "they", "have", "been", "will", "what", "when", "your",
  "their", "them", "into", "than", "then", "there", "which", "would",
]);

/**
 * Helper for agents: convert a retrieved chunk into a Citation skeleton.
 * Agents are responsible for filling in `quote` with the supporting excerpt.
 */
export function chunkToCitationStub(c: Chunk): Pick<Citation, "document_id" | "chunk_id"> {
  return { document_id: c.document_id, chunk_id: c.chunk_id };
}
