import fs from 'node:fs';

import type {
  DBQueryRequest,
  DBQueryResponse,
  DBService,
  DBUpsertRequest,
  DBUpsertResponse
} from './types.js';

export interface MemoryDBArgs {
  filename?: string;
}

/**
 * MemoryDB: DB Service
 * @export
 */
export class MemoryDB implements DBService {
  private memoryDB: Record<string, Record<string, DBUpsertRequest>> = {};
  private filename?: string;

  constructor({ filename }: Readonly<MemoryDBArgs> = {}) {
    this.filename = filename;

    if (filename && fs.existsSync(filename)) {
      this.load();
    }
  }

  upsert = async (
    req: Readonly<DBUpsertRequest>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _update?: boolean
  ): Promise<DBUpsertResponse> => {
    if (!this.memoryDB[req.table]) {
      this.memoryDB[req.table] = {};
    }
    this.memoryDB[req.table][req.id] = req;

    if (this.filename) {
      await this.save();
    }

    return { ids: [req.id] };
  };

  batchUpsert = async (
    batchReq: Readonly<DBUpsertRequest[]>,
    update?: boolean
  ): Promise<DBUpsertResponse> => {
    const ids: string[] = [];
    for (const req of batchReq) {
      const res = await this.upsert(req, update);
      ids.push(...res.ids);
    }

    if (this.filename) {
      await this.save();
    }

    return { ids };
  };

  query = async (req: Readonly<DBQueryRequest>): Promise<DBQueryResponse> => {
    const table = this.memoryDB[req.table];
    if (!table) throw new Error(`${req.table} not found`);

    const matches: DBQueryResponse['matches'] = [];

    Object.entries(table).forEach(([id, data]) => {
      if (req.values && data.values) {
        const score = distance(req.values, data.values);
        matches.push({ id: id, score: score, metadata: data.metadata });
      }
    });

    matches.sort((a, b) => a.score - b.score);
    if (req.limit) {
      matches.length = req.limit;
    }

    return { matches };
  };

  public save = async (fn = this.filename) => {
    if (!fn) {
      throw new Error('Filename not set');
    }
    fs.writeFileSync(fn, JSON.stringify(this.memoryDB));
  };

  public load = async (fn = this.filename) => {
    if (!fn) {
      throw new Error('Filename not set');
    }
    const data = fs.readFileSync(fn, 'utf8');
    const obj = JSON.parse(data);
    this.memoryDB = { ...this.memoryDB, ...obj };
  };
}

const distance = (a: readonly number[], b: readonly number[]): number => {
  if (a.length !== b.length) {
    throw new Error('Vectors must be of the same length.');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  let zeroVectorA = true;
  let zeroVectorB = true;

  // Using typed arrays for potentially better performance
  const vectorA = new Float64Array(a);
  const vectorB = new Float64Array(b);

  for (let i = 0; i < vectorA.length; i++) {
    dotProduct += vectorA[i] * vectorB[i];
    normA += vectorA[i] * vectorA[i];
    normB += vectorB[i] * vectorB[i];
    if (vectorA[i] !== 0) zeroVectorA = false;
    if (vectorB[i] !== 0) zeroVectorB = false;
  }

  if (zeroVectorA || zeroVectorB) {
    return 1; // Return maximum distance if one vector is zero
  }

  const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  return 1 - similarity; // Returning distance as 1 - cosine similarity.
};