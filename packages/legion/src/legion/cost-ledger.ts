import { Database } from "bun:sqlite"
import os from "os"
import path from "path"

export interface CostLedgerState {
  spentUsd: number
  budgetUsd: number
  exceeded: boolean
}

/** Cross-process local ledger shared by a root run and every child delegation. */
export class RunCostLedger {
  private readonly database: Database

  constructor(
    private readonly runId: string,
    budgetUsd: number,
    databasePath = process.env.LEGION_COST_LEDGER_PATH || path.join(os.tmpdir(), "legion-cost-ledger.sqlite"),
  ) {
    this.database = new Database(databasePath, { create: true })
    this.database.exec("PRAGMA journal_mode = WAL")
    this.database.exec("PRAGMA busy_timeout = 5000")
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS run_cost_ledger (
        run_id TEXT PRIMARY KEY,
        budget_usd REAL NOT NULL CHECK (budget_usd >= 0),
        spent_usd REAL NOT NULL DEFAULT 0 CHECK (spent_usd >= 0),
        updated_at TEXT NOT NULL
      )
    `)
    this.database
      .query("INSERT OR IGNORE INTO run_cost_ledger (run_id, budget_usd, spent_usd, updated_at) VALUES (?, ?, 0, ?)")
      .run(runId, budgetUsd, new Date().toISOString())
    const existing = this.read()
    if (Math.abs(existing.budgetUsd - budgetUsd) > Number.EPSILON) {
      this.database.close()
      throw new Error("The run cost budget does not match its existing immutable ledger")
    }
  }

  consume(costUsd: number): CostLedgerState {
    if (!Number.isFinite(costUsd) || costUsd < 0) throw new Error("Reported model cost must be non-negative")
    this.database.exec("BEGIN IMMEDIATE")
    try {
      this.database
        .query("UPDATE run_cost_ledger SET spent_usd = spent_usd + ?, updated_at = ? WHERE run_id = ?")
        .run(costUsd, new Date().toISOString(), this.runId)
      const state = this.read()
      this.database.exec("COMMIT")
      return state
    } catch (error) {
      this.database.exec("ROLLBACK")
      throw error
    }
  }

  read(): CostLedgerState {
    const row = this.database
      .query("SELECT spent_usd, budget_usd FROM run_cost_ledger WHERE run_id = ?")
      .get(this.runId) as { spent_usd: number; budget_usd: number } | null
    if (!row) throw new Error("Run cost ledger is unavailable")
    return {
      spentUsd: Number(row.spent_usd),
      budgetUsd: Number(row.budget_usd),
      exceeded: Number(row.spent_usd) > Number(row.budget_usd) + Number.EPSILON,
    }
  }

  close() {
    this.database.close()
  }
}
