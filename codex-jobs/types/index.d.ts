export type JobStatus = 'running' | 'done' | 'failed' | 'stopped' | 'unknown'

export type JobFilter = JobStatus | 'all'

export type CodexJob = {
  /** The Bash call's tool_use_id, or a companion job's own id. */
  id: string
  /** `companion`: a codex-companion job, read from its state files. */
  source?: 'cli' | 'companion'
  phaseId: string
  label: string
  subcommand: string
  prompt?: string
  command: string
  model?: string
  effort?: string
  /** A companion job's workspace, where its `cancel` runs. */
  workspaceRoot?: string
  /** A companion job's state folder, holding its log and result. */
  stateDir?: string
  status: JobStatus
  /** The background task's id, once the call runs in the background. */
  taskId?: string
  outputFile?: string
  startedAt: number
  endedAt?: number
  tokens?: number
  toolCalls?: number
  activity?: string[]
  outcome?: string
  /** Why the job failed, or why its outcome is unknown. */
  note?: string
}

/** The Claude turn that started a group of jobs: the workflow's phase. */
export type CodexPhase = { id: string; title: string }

export type CurrentTurn = { id?: string; title?: string }

export type JobsView = {
  /** The chosen phase; absent, the view follows the newest active one. */
  phaseId?: string
  /** The job whose card is open. */
  jobId?: string
  filter: JobFilter
  isExpanded: boolean
  /** The person closed the pane, so a new job does not reopen it. */
  isDismissed: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'codex-jobs': {
      jobs: Shaped<CodexJob[]>
      phases: Shaped<CodexPhase[]>
      turn: Shaped<CurrentTurn>
      view: Shaped<JobsView>
    }
  }
}
