import * as lancedb from '@lancedb/lancedb';
import { VectorDocument, SearchResult, VectorSearchOptions, AudienceType } from '../types/index.js';

// LanceDB record type with index signature
interface LanceRecord {
  [key: string]: unknown;
  id: string;
  vector: number[];
  path: string;
  content: string;
  audience: string;
  fileHash: string;
  embeddedAt: string;
}

export class VectorStore {
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private dbPath: string;
  private tableName = 'doc_embeddings';
  private dimensions: number = 0;

  constructor(docsDir: string) {
    this.dbPath = `${docsDir}/vectors.lance`;
  }

  async initialize(dimensions: number): Promise<void> {
    this.dimensions = dimensions;
    this.db = await lancedb.connect(this.dbPath);

    // Check if table exists
    const tables = await this.db.tableNames();
    if (tables.includes(this.tableName)) {
      this.table = await this.db.openTable(this.tableName);
    }
  }

  private async ensureTable(): Promise<void> {
    if (!this.db) throw new Error('Store not initialized');
    if (this.table) return;

    // Create table with a placeholder record (LanceDB requires at least one record)
    const placeholder: LanceRecord = {
      id: '__placeholder__',
      vector: new Array(this.dimensions).fill(0),
      path: '',
      content: '',
      audience: 'engineering',
      fileHash: '',
      embeddedAt: new Date().toISOString(),
    };

    this.table = await this.db.createTable(this.tableName, [placeholder]);
    // Remove placeholder
    await this.table.delete('id = "__placeholder__"');
  }

  async upsert(docs: VectorDocument[]): Promise<void> {
    if (!this.db) throw new Error('Store not initialized');
    if (docs.length === 0) return;

    await this.ensureTable();
    if (!this.table) throw new Error('Failed to create table');

    // Delete existing docs with same IDs
    for (const doc of docs) {
      try {
        await this.table.delete(`id = "${doc.id}"`);
      } catch {
        // Ignore errors if record doesn't exist
      }
    }

    // Convert to LanceRecord format
    const records: LanceRecord[] = docs.map((doc) => ({
      id: doc.id,
      vector: doc.vector,
      path: doc.path,
      content: doc.content,
      audience: doc.audience,
      fileHash: doc.fileHash,
      embeddedAt: doc.embeddedAt,
    }));

    // Add new docs
    await this.table.add(records);
  }

  async search(
    queryVector: number[],
    options: VectorSearchOptions = {}
  ): Promise<SearchResult[]> {
    if (!this.table) {
      return [];
    }

    const { limit = 10, audience, minScore = 0.0 } = options;

    let query = this.table.search(queryVector).limit(limit);

    // Add audience filter if specified
    if (audience) {
      query = query.where(`audience = "${audience}"`);
    }

    const results = await query.toArray();

    return results
      .filter((r: Record<string, unknown>) => 1 - (r._distance as number) >= minScore)
      .map((r: Record<string, unknown>) => ({
        path: r.path as string,
        content: r.content as string,
        audience: r.audience as AudienceType,
        score: 1 - (r._distance as number),
      }));
  }

  async deleteByPath(path: string): Promise<void> {
    if (!this.table) return;

    try {
      await this.table.delete(`path = "${path}"`);
    } catch {
      // Ignore errors if records don't exist
    }
  }

  async getAll(): Promise<VectorDocument[]> {
    if (!this.table) {
      return [];
    }

    const results = await this.table.query().toArray();
    return results.map((r: Record<string, unknown>) => ({
      id: r.id as string,
      vector: r.vector as number[],
      path: r.path as string,
      content: r.content as string,
      audience: r.audience as AudienceType,
      fileHash: r.fileHash as string,
      embeddedAt: r.embeddedAt as string,
    }));
  }

  isInitialized(): boolean {
    return this.db !== null;
  }

  hasData(): boolean {
    return this.table !== null;
  }

  async close(): Promise<void> {
    this.db = null;
    this.table = null;
  }
}
