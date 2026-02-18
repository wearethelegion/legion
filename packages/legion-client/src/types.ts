/**
 * TypeScript type definitions for LEGION gRPC API.
 *
 * These interfaces mirror the protobuf message definitions used by the gRPC server.
 * Tier 1: Critical types needed for Phase 1 (Identity & Bootstrap).
 * Additional types will be added incrementally as features require them.
 */

// ============================================================================
// Common Types (legion_common.proto)
// ============================================================================

export interface ErrorResponse {
  is_error: boolean
  error: string
  error_code: string
  retryable: boolean
}

export interface QueryResult {
  id: string
  text: string
  metadata: Record<string, string>
  score: number
  vector_score: number
  rerank_score: number
}

// ============================================================================
// Auth Types (auth.proto)
// ============================================================================

export interface AuthRequest {
  email: string
  password: string
}

export interface AuthResponse {
  status: string
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  user_email: string
  message: string
}

export interface GetProjectsRequest {
  user_token: string
}

export interface ProjectItem {
  id: string
  company_id: string
  name: string
  description: string
  company_name: string
}

export interface GetProjectsResponse {
  status: string
  message: string
  projects_count: number
  projects: ProjectItem[]
  user_email: string
}

// ============================================================================
// Agent Skill Types (agent_skill.proto)
// ============================================================================

export interface WhoAmIRequest {
  user_token: string
  company_id?: string
  agent_id?: string
  project_id?: string
}

export interface SkillOverview {
  expertise_id: string
  title: string
  summary: string
  sections_count: number
  when_to_use: string
}

export interface AvailableAgent {
  agent_id: string
  name: string
  role: string
  specialization: string
  description: string
  when_to_use: string
}

export interface PermanentMemoryRef {
  id: string
  agent_id: string
  user_id: string
  content: string
  category: string
  created_at: string
}

export interface WorkflowOverview {
  id: string
  name: string
  signals: string[]
  when_to_use: string
}

export interface WhoAmIResponse {
  status: string
  agent_id: string
  name: string
  role: string
  personality: string
  main_responsibilities: string
  system_prompt: string
  capabilities: string[]
  skills_overview: SkillOverview[]
  skills_count: number
  available_agents: AvailableAgent[]
  available_agents_count: number
  error_message: string
  error_code: string
  permanent_memories: PermanentMemoryRef[]
  workflows: WorkflowOverview[]
}

export interface GetAgentSkillsRequest {
  agent_id: string
  user_token: string
}

export interface GetAgentSkillsResponse {
  status: string
  agent_id: string
  agent_name: string
  skills_count: number
  skills: SkillOverview[]
  error_message: string
  error_code: string
}

export interface SearchSkillDetailsRequest {
  expertise_id: string
  query: string
  limit?: number
  user_token: string
}

export interface SkillSearchResult {
  chunk_id: string
  title: string
  content: string
  score: number
  has_code: boolean
  level: number
  position: number
}

export interface SearchSkillDetailsResponse {
  status: string
  expertise_id: string
  expertise_title: string
  query: string
  results_count: number
  results: SkillSearchResult[]
  error_message: string
  error_code: string
}

export interface GetSkillSectionsRequest {
  expertise_id: string
  user_token: string
}

export interface SkillSection {
  chunk_id: string
  title: string
  summary: string
  has_code: boolean
  level: number
  position: number
}

export interface GetSkillSectionsResponse {
  status: string
  expertise_id: string
  title: string
  summary: string
  sections_count: number
  sections: SkillSection[]
  error_message: string
  error_code: string
}

export interface GetSkillContentRequest {
  chunk_id: string
  user_token: string
}

export interface GetSkillContentResponse {
  status: string
  chunk_id: string
  title: string
  content: string
  has_code: boolean
  level: number
  expertise_id: string
  error_message: string
  error_code: string
}

export interface GetWorkflowByIdRequest {
  workflow_id: string
  user_token: string
}

export interface WorkflowContent {
  id: string
  company_id: string
  project_id: string
  agent_id: string
  role: string
  user_id: string
  public: boolean
  name: string
  content: string
  description: string
  signals: string[]
  version: number
  created_at: string
  updated_at: string
}

export interface GetWorkflowByIdResponse {
  status: string
  workflow: WorkflowContent | null
  error_message: string
  error_code: string
}

// ============================================================================
// Knowledge Types (knowledge.proto)
// ============================================================================

export interface QueryKnowledgeRequest {
  query: string
  project_id: string
  user_token: string
  limit?: number
}

export interface KnowledgeQueryResult {
  id: string
  text: string
  metadata: Record<string, string>
  score: number
  vector_score: number
  rerank_score: number
}

export interface QueryKnowledgeResponse {
  status: string
  query: string
  project_id: string
  results_count: number
  results: KnowledgeQueryResult[]
  error_message: string
  error_code: string
}

export interface FastQueryRequest {
  query: string
  project_id: string
  user_token: string
  limit?: number
}

export interface CreateKnowledgeRequest {
  text: string
  user_token: string
  metadata?: Record<string, string>
  request_id?: string
  project_id: string
  when_to_use: string
}

export interface CreateKnowledgeResponse {
  status: string
  message: string
  knowledge_id: string
  project_id: string
  company_id: string
  title: string
  summary: string
  chunks_count: number
  entities_count: number
  relationships_count: number
  error_message: string
  error_code: string
}

// ============================================================================
// Engagement Types (engagement.proto)
// ============================================================================

export interface CreateEngagementRequest {
  user_token: string
  company_id?: string
  project_id: string
  name: string
  agent_id?: string
  user_id?: string
  summary?: string
  ultimate_goal: string
}

export interface CreateEngagementResponse {
  status: string
  message: string
  engagement_id: string
  name: string
  engagement_status: string
  created_at: string
  error_message: string
  error_code: string
  ultimate_goal: string
}

export interface GetEngagementRequest {
  user_token: string
  engagement_id: string
}

export interface EngagementEntryInfo {
  id: string
  entry_type: string
  title: string
  content_preview: string
  created_by_agent_id: string
  created_at: string
  content_length: number
  references: string[]
  tags: string[]
  summary: string
  version: number
}

export interface GetEngagementResponse {
  status: string
  engagement_id: string
  name: string
  engagement_status: string
  company_id: string
  project_id: string
  agent_id: string
  user_id: string
  summary: string
  entries: EngagementEntryInfo[]
  created_at: string
  updated_at: string
  error_message: string
  error_code: string
  ultimate_goal: string
}

export interface ListEngagementsRequest {
  user_token: string
  project_id: string
  status?: string
  limit?: number
  offset?: number
}

export interface EngagementInfo {
  id: string
  name: string
  status: string
  company_id: string
  project_id: string
  agent_id: string
  user_id: string
  summary: string
  created_at: string
  updated_at: string
  ultimate_goal: string
}

export interface ListEngagementsResponse {
  status: string
  project_id: string
  total_count: number
  engagements: EngagementInfo[]
  error_message: string
  error_code: string
}

export interface AddEntryRequest {
  user_token: string
  engagement_id: string
  entry_type: string
  title: string
  content: string
  agent_id?: string
  references?: string[]
  tags?: string[]
}

export interface AddEntryResponse {
  status: string
  message: string
  entry_id: string
  engagement_id: string
  entry_type: string
  title: string
  created_at: string
  error_message: string
  error_code: string
  summary: string
  version: number
}

export interface UpdateEngagementRequest {
  user_token: string
  engagement_id: string
  name?: string
  status?: string
  summary?: string
  ultimate_goal?: string
}

export interface UpdateEngagementResponse {
  status: string
  message: string
  engagement_id: string
  name: string
  engagement_status: string
  updated_at: string
  error_message: string
  error_code: string
  ultimate_goal: string
}

export interface GetEntryRequest {
  user_token: string
  entry_id: string
}

export interface EngagementEntryFull {
  id: string
  engagement_id: string
  entry_type: string
  title: string
  content: string
  created_by_agent_id: string
  created_at: string
  references: string[]
  tags: string[]
  summary: string
  version: number
  updated_at: string
}

export interface GetEntryResponse {
  status: string
  entry: EngagementEntryFull | null
  error_message: string
  error_code: string
}

export interface SearchEntriesRequest {
  user_token: string
  query: string
  project_id: string
  limit?: number
  entry_type?: string
  engagement_id?: string
  offset?: number
}

export interface SearchEntriesResponse {
  status: string
  query: string
  project_id: string
  results_count: number
  results: QueryResult[]
  error_message: string
  error_code: string
}

export interface ResumeEngagementRequest {
  user_token: string
  engagement_id: string
}

export interface EntriesByType {
  entry_type: string
  entries: EngagementEntryFull[]
}

export interface ResumeEngagementResponse {
  status: string
  engagement_id: string
  name: string
  engagement_status: string
  summary: string
  entries_by_type: EntriesByType[]
  total_entries: number
  error_message: string
  error_code: string
  ultimate_goal: string
}

// ============================================================================
// Memory Types (memory.proto)
// ============================================================================

export interface RememberRequest {
  user_token: string
  project_id: string
  agent_id: string
  engagement_id?: string
  memory_key: string
  content: string
  ttl_minutes?: number
  promote_to_permanent?: boolean
  memory_type?: string
  importance?: number
}

export interface RememberResponse {
  status: string
  message: string
  memory_key: string
  stored: boolean
  permanent_memory_id: string
  error_message: string
  error_code: string
}

export interface RecallRequest {
  user_token: string
  project_id: string
  agent_id?: string
  query: string
  limit?: number
  include_permanent?: boolean
  include_working?: boolean
  engagement_id?: string
  memory_type?: string
  min_importance?: number
}

export interface RecalledMemory {
  id: string
  source: string
  memory_type: string
  key: string
  content: string
  relevance_score: number
  importance: number
  agent_id: string
  created_at: string
}

export interface RecallResponse {
  status: string
  results_count: number
  memories: RecalledMemory[]
  error_message: string
  error_code: string
}

export interface CreatePermanentMemoryRequest {
  user_token: string
  company_id: string
  project_id: string
  agent_id?: string
  memory_type: string
  key: string
  content: string
  metadata?: Record<string, string>
  importance?: number
}

export interface CreatePermanentMemoryResponse {
  status: string
  message: string
  memory_id: string
  key: string
  memory_type: string
  created_at: string
  error_message: string
  error_code: string
}

export interface GetActiveWorkStatusRequest {
  user_token: string
  project_id: string
  agent_id?: string
}

export interface AgentMemoryStatus {
  agent_id: string
  agent_name: string
  working_memory_count: number
  permanent_memory_count: number
  current_engagement_id: string
  last_activity_at: string
}

export interface GetActiveWorkStatusResponse {
  status: string
  agents: AgentMemoryStatus[]
  total_working_memories: number
  total_permanent_memories: number
  project_id: string
  error_message: string
  error_code: string
}

// ============================================================================
// Task Types (task.proto)
// ============================================================================

export interface CreateTaskRequest {
  user_token: string
  company_id?: string
  project_id?: string
  title: string
  description?: string
  engagement_id?: string
  priority?: string
  assigned_agent_id?: string
  created_by_agent_id?: string
  ultimate_goal: string
}

export interface CreateTaskResponse {
  status: string
  message: string
  task_id: string
  title: string
  task_status: string
  priority: string
  created_at: string
  error_message: string
  error_code: string
  ultimate_goal: string
}

export interface GetTaskRequest {
  user_token: string
  task_id: string
}

export interface ArtifactInfo {
  id: string
  artifact_type: string
  artifact_id: string
  linked_at: string
}

export interface GetTaskResponse {
  status: string
  task_id: string
  title: string
  description: string
  task_status: string
  priority: string
  company_id: string
  project_id: string
  engagement_id: string
  assigned_agent_id: string
  created_by_agent_id: string
  blockers: string
  artifacts: ArtifactInfo[]
  created_at: string
  updated_at: string
  completed_at: string
  error_message: string
  error_code: string
  ultimate_goal: string
}

export interface ListTasksRequest {
  user_token: string
  project_id?: string
  engagement_id?: string
  agent_id?: string
  status?: string
  limit?: number
  offset?: number
}

export interface TaskInfo {
  id: string
  title: string
  description: string
  status: string
  priority: string
  company_id: string
  project_id: string
  engagement_id: string
  assigned_agent_id: string
  created_by_agent_id: string
  blockers: string
  created_at: string
  updated_at: string
  completed_at: string
  ultimate_goal: string
}

export interface ListTasksResponse {
  status: string
  total_count: number
  tasks: TaskInfo[]
  error_message: string
  error_code: string
}

export interface UpdateTaskRequest {
  user_token: string
  task_id: string
  status?: string
  assigned_agent_id?: string
  blockers?: string
  priority?: string
  ultimate_goal?: string
}

export interface UpdateTaskResponse {
  status: string
  message: string
  task_id: string
  task_status: string
  priority: string
  updated_at: string
  error_message: string
  error_code: string
  ultimate_goal: string
}

export interface CompleteTaskRequest {
  user_token: string
  task_id: string
}

export interface CompleteTaskResponse {
  status: string
  message: string
  task_id: string
  task_status: string
  completed_at: string
  error_message: string
  error_code: string
}

// ============================================================================
// Code Types (code.proto)
// ============================================================================

export interface FindSimilarCodeRequest {
  query: string
  language?: string
  project_id?: string
  limit?: number
  user_token: string
}

export interface CodeResult {
  entity_id: string
  score: number
  entity_name: string
  entity_type: string
  filename: string
  file_path: string
  language: string
  line_start: number
  line_end: number
  code_snippet: string
  summary: string
  dependencies: string[]
  complexity: number
  is_entry_point: boolean
}

export interface FindSimilarCodeResponse {
  status: string
  results: CodeResult[]
  total: number
  error_message: string
  error_code: string
}

export interface AnalyzeImpactRequest {
  entity_name: string
  entity_type: string
  project_id: string
  max_depth?: number
  user_token: string
}

export interface EntityInfoItem {
  name: string
  type: string
  file_path: string
  filename: string
  line_start: number
  line_end: number
  code_snippet: string
}

export interface ImpactPath {
  path: EntityInfoItem[]
}

export interface AnalyzeImpactResponse {
  status: string
  entity: EntityInfoItem | null
  upstream: ImpactPath[]
  downstream: ImpactPath[]
  risk_level: string
  upstream_count: number
  downstream_count: number
  error_message: string
  error_code: string
}

export interface TraceExecutionFlowRequest {
  entry_point: string
  project_id: string
  max_depth?: number
  user_token: string
}

export interface ExecutionPath {
  path: EntityInfoItem[]
  depth: number
}

export interface TraceExecutionFlowResponse {
  status: string
  paths: ExecutionPath[]
  total_paths: number
  error_message: string
  error_code: string
}

// ============================================================================
// Expertise Types (expertise.proto)
// ============================================================================

export interface QueryExpertiseRequest {
  query: string
  user_token: string
  project_id?: string
  limit?: number
  company_id?: string
}

export interface QueryExpertiseResponse {
  status: string
  query: string
  project_id: string
  results_count: number
  results: QueryResult[]
  error_message: string
  error_code: string
}

export interface ListExpertiseRequest {
  user_token: string
  project_id?: string
  limit?: number
  offset?: number
  company_id?: string
}

export interface ExpertiseInfo {
  expertise_id: string
  title: string
  summary: string
  chunks_count: number
  created_at: string
  updated_at: string
}

export interface ListExpertiseResponse {
  status: string
  project_id: string
  total_count: number
  expertise_list: ExpertiseInfo[]
  error_message: string
  error_code: string
}

// ============================================================================
// Lessons Learned Types (lessons_learned.proto)
// ============================================================================

export interface QueryLessonsRequest {
  user_token: string
  project_id: string
  query: string
  category_filter?: string
  limit?: number
}

export interface LessonInfo {
  lesson_id: string
  category: string
  title: string
  symptom: string
  root_cause: string
  solution: string
  prevention: string
  severity: string
  tags: string[]
  files_changed: string[]
  created_at: string
  score: number
}

export interface QueryLessonsResponse {
  status: string
  lessons: LessonInfo[]
  results_count: number
  error_message: string
  error_code: string
}

// ============================================================================
// Delegation Types (delegation.proto)
// ============================================================================

export interface CreateDelegationRequest {
  user_token: string
  company_id: string
  project_id?: string
  agent_id: string
  task_id?: string
  task_description: string
  context?: string
}

export interface CreateDelegationResponse {
  status: string
  message: string
  delegation_id: string
  agent_name: string
  agent_role: string
  error_message: string
  error_code: string
}

export interface GetDelegationStatusRequest {
  user_token: string
  delegation_id: string
}

export interface ProgressStep {
  step: number
  tool: string
  input_summary: string
  timestamp: string
}

export interface DelegationStatusResponse {
  status: string
  delegation_id: string
  delegation_status: string
  agent_name: string
  agent_role: string
  current_action: string
  steps_completed: number
  progress: ProgressStep[]
  started_at: string
  updated_at: string
  error_message: string
  error_code: string
}

export interface GetDelegationResultRequest {
  user_token: string
  delegation_id: string
}

export interface DelegationResultResponse {
  status: string
  delegation_id: string
  delegation_status: string
  agent_name: string
  agent_role: string
  result_summary: string
  tools_used: string[]
  turns: number
  cost_usd: number
  error_detail: string
  started_at: string
  completed_at: string
  error_message: string
  error_code: string
}

export interface ListDelegationsRequest {
  user_token: string
  project_id?: string
  agent_id?: string
  status_filter?: string
  limit?: number
  offset?: number
}

export interface DelegationInfo {
  id: string
  agent_name: string
  agent_role: string
  status: string
  task_summary: string
  steps_completed: number
  created_at: string
  updated_at: string
}

export interface ListDelegationsResponse {
  status: string
  total_count: number
  delegations: DelegationInfo[]
  error_message: string
  error_code: string
}

// ============================================================================
// Agent Skill Types — Agent Lifecycle (agent_skill.proto)
// ============================================================================

export interface GetAgentContextRequest {
  user_token: string
  agent_id: string
  project_id?: string
}

export interface CompanyInstructions {
  id: string
  company_id: string
  ground_rules: string
  coding_standards: string
  communication_style: string
  forbidden_actions: string
  custom_instructions: string
}

export interface ProjectInstructions {
  id: string
  project_id: string
  description: string
  languages: string[]
  frameworks: string[]
  tools: string[]
  architecture_notes: string
  conventions: string
  custom_instructions: string
}

export interface GetAgentContextResponse {
  status: string
  agent_id: string
  agent_name: string
  agent_role: string
  combined_system_prompt: string
  company_instructions: CompanyInstructions | null
  project_instructions: ProjectInstructions | null
  agent_system_prompt: string
  error_message: string
  error_code: string
}

export interface CreateAgentRequest {
  user_token: string
  company_id: string
  name: string
  role: string
  personality: string
  main_responsibilities: string
  system_prompt: string
  capabilities?: string[]
  specialization?: string
  project_id?: string
  when_to_use: string
}

export interface CreateAgentResponse {
  status: string
  agent_id: string
  name: string
  role: string
  learning_skill_linked: boolean
  error_message: string
  error_code: string
}

export interface DeleteAgentRequest {
  user_token: string
  agent_id: string
}

export interface DeleteAgentResponse {
  status: string
  agent_id: string
  name: string
  skills_unlinked: number
  deleted: boolean
  error_message: string
  error_code: string
}

export interface UpdateAgentRequest {
  user_token: string
  agent_id: string
  name?: string
  name_provided?: boolean
  personality?: string
  personality_provided?: boolean
  main_responsibilities?: string
  main_responsibilities_provided?: boolean
  system_prompt?: string
  system_prompt_provided?: boolean
  metadata_json?: string
  metadata_provided?: boolean
  project_id?: string
  project_id_provided?: boolean
  public?: boolean
  public_provided?: boolean
}

export interface UpdateAgentResponse {
  status: string
  agent_id: string
  name: string
  role: string
  error_message: string
  error_code: string
}

export interface LinkAgentSkillRequest {
  agent_id: string
  expertise_id: string
  user_token: string
}

export interface LinkAgentSkillResponse {
  status: string
  agent_id: string
  expertise_id: string
  expertise_title: string
  error_message: string
  error_code: string
}

export interface UnlinkAgentSkillRequest {
  agent_id: string
  expertise_id: string
  user_token: string
}

export interface UnlinkAgentSkillResponse {
  status: string
  agent_id: string
  expertise_id: string
  error_message: string
  error_code: string
}

// ============================================================================
// Agent Skill Types — Workflow CRUD (agent_skill.proto)
// ============================================================================

export interface CreateWorkflowRequest {
  user_token: string
  company_id: string
  name: string
  content: string
  signals: string[]
  description?: string
  role?: string
  agent_id?: string
  project_id?: string
  public?: boolean
  metadata_json?: string
  when_to_use: string
}

export interface CreateWorkflowResponse {
  status: string
  workflow: WorkflowContent | null
  error_message: string
  error_code: string
}

export interface UpdateWorkflowRequest {
  user_token: string
  workflow_id: string
  name?: string
  name_provided?: boolean
  content?: string
  content_provided?: boolean
  signals?: string[]
  signals_provided?: boolean
  description?: string
  description_provided?: boolean
  role?: string
  role_provided?: boolean
  agent_id?: string
  agent_id_provided?: boolean
  project_id?: string
  project_id_provided?: boolean
  public?: boolean
  public_provided?: boolean
  metadata_json?: string
  metadata_provided?: boolean
}

export interface UpdateWorkflowResponse {
  status: string
  workflow: WorkflowContent | null
  error_message: string
  error_code: string
}

export interface DeleteWorkflowRequest {
  user_token: string
  workflow_id: string
}

export interface DeleteWorkflowResponse {
  status: string
  workflow_id: string
  deleted: boolean
  error_message: string
  error_code: string
}

export interface ListWorkflowsRequest {
  user_token: string
  company_id: string
  role?: string
  agent_id?: string
  project_id?: string
  limit?: number
  offset?: number
}

export interface ListWorkflowsResponse {
  status: string
  workflows: WorkflowContent[]
  total_count: number
  error_message: string
  error_code: string
}

// ============================================================================
// Agent Skill Types — ListCompanyAgents (agent_skill.proto)
// ============================================================================

export interface ListCompanyAgentsRequest {
  user_token: string
  company_id: string
  project_id?: string
}

export interface AgentWithContext {
  agent_id: string
  name: string
  role: string
  specialization: string
  combined_system_prompt: string
}

export interface ListCompanyAgentsResponse {
  status: string
  agents: AgentWithContext[]
  total_count: number
  error_message: string
  error_code: string
}

// ============================================================================
// Engagement Types — UpdateEntry & GetEntries (engagement.proto)
// ============================================================================

export interface UpdateEntryRequest {
  user_token: string
  entry_id: string
  content?: string
  references?: string[]
  tags?: string[]
}

export interface UpdateEntryResponse {
  status: string
  message: string
  entry_id: string
  entry_type: string
  title: string
  summary: string
  version: number
  updated_at: string
  error_message: string
  error_code: string
}

export interface GetEntriesRequest {
  user_token: string
  engagement_id: string
  entry_type?: string
}

export interface GetEntriesResponse {
  status: string
  engagement_id: string
  total_count: number
  entries: EngagementEntryFull[]
  error_message: string
  error_code: string
}

// ============================================================================
// Task Types — AssignTask, LinkArtifact, GetArtifacts (task.proto)
// ============================================================================

export interface AssignTaskRequest {
  user_token: string
  task_id: string
  agent_id: string
}

export interface AssignTaskResponse {
  status: string
  message: string
  task_id: string
  assigned_agent_id: string
  task_status: string
  updated_at: string
  error_message: string
  error_code: string
}

export interface LinkArtifactRequest {
  user_token: string
  task_id: string
  artifact_type: string
  artifact_id: string
}

export interface LinkArtifactResponse {
  status: string
  message: string
  link_id: string
  task_id: string
  artifact_type: string
  artifact_id: string
  linked_at: string
  error_message: string
  error_code: string
}

export interface GetArtifactsRequest {
  user_token: string
  task_id: string
  artifact_type?: string
}

export interface GetArtifactsResponse {
  status: string
  task_id: string
  total_count: number
  artifacts: ArtifactInfo[]
  error_message: string
  error_code: string
}

// ============================================================================
// Knowledge Types — SearchByTags, ExploreGraph (knowledge.proto)
// ============================================================================

export interface SearchByTagsRequest {
  project_id: string
  user_token: string
  keywords?: string[]
  chunk_type?: string
  has_code?: boolean
  section_title?: string
  section_level?: number
  limit?: number
  offset?: number
}

export interface ExploreGraphRequest {
  cypher: string
  project_id: string
  user_token: string
  params?: Record<string, string>
  limit?: number
}

export interface GraphQueryResult {
  fields: Record<string, string>
}

export interface ExploreGraphResponse {
  status: string
  query: string
  project_id: string
  results_count: number
  results: GraphQueryResult[]
  error_message: string
  error_code: string
}

// ============================================================================
// Expertise Types — CreateExpertise, AddChunk, GetExpertise (expertise.proto)
// ============================================================================

export interface CreateExpertiseRequest {
  text: string
  user_token: string
  project_id?: string
  metadata?: Record<string, string>
  request_id?: string
  company_id?: string
  when_to_use: string
}

export interface CreateExpertiseResponse {
  status: string
  message: string
  expertise_id: string
  project_id: string
  company_id: string
  title: string
  summary: string
  chunks_count: number
  entities_count: number
  relationships_count: number
  error_message: string
  error_code: string
}

export interface AddExpertiseChunkRequest {
  expertise_id: string
  content: string
  user_token: string
  parent_chunk_id?: string
  project_id?: string
}

export interface AddExpertiseChunkResponse {
  status: string
  message: string
  chunk_id: string
  expertise_id: string
  parent_chunk_id: string
  level: number
  position: number
  error_message: string
  error_code: string
}

export interface GetExpertiseRequest {
  user_token: string
  expertise_id: string
}

export interface GetExpertiseResponse {
  status: string
  expertise_id: string
  title: string
  summary: string
  content: string
  chunks_count: number
  project_id: string
  company_id: string
  created_at: string
  updated_at: string
  error_message: string
  error_code: string
}

export interface UpdateExpertiseResponse {
  status: string
  expertise_id: string
  title: string
  when_to_use: string
  error_message: string
  error_code: string
}

// ============================================================================
// Memory Types — GetPermanentMemories, Update, Delete (memory.proto)
// ============================================================================

export interface GetPermanentMemoriesRequest {
  user_token: string
  project_id: string
  agent_id?: string
  memory_type?: string
  memory_id?: string
  key?: string
  limit?: number
  offset?: number
}

export interface PermanentMemoryInfo {
  id: string
  memory_type: string
  key: string
  content_preview: string
  importance: number
  agent_id: string
  created_at: string
  updated_at: string
  access_count: number
}

export interface PermanentMemoryFull {
  id: string
  memory_type: string
  key: string
  content: string
  metadata: Record<string, string>
  importance: number
  company_id: string
  project_id: string
  agent_id: string
  created_at: string
  updated_at: string
  access_count: number
  last_accessed_at: string
}

export interface GetPermanentMemoriesResponse {
  status: string
  total_count: number
  memories: PermanentMemoryInfo[]
  memory: PermanentMemoryFull | null
  error_message: string
  error_code: string
}

export interface UpdatePermanentMemoryRequest {
  user_token: string
  memory_id: string
  content?: string
  metadata?: Record<string, string>
  importance?: number
}

export interface UpdatePermanentMemoryResponse {
  status: string
  message: string
  memory_id: string
  updated_at: string
  version: number
  error_message: string
  error_code: string
}

export interface DeletePermanentMemoryRequest {
  user_token: string
  memory_id: string
}

export interface DeletePermanentMemoryResponse {
  status: string
  message: string
  deleted: boolean
  error_message: string
  error_code: string
}

// ============================================================================
// Delegation Types — Brief, UpdateProgress, UpdateStatus, etc. (delegation.proto)
// ============================================================================

export interface DelegationStatusBrief {
  status: string
  delegation_status: string
  step_number: number
  step_description: string
  error_message: string
  error_code: string
}

export interface UpdateProgressRequest {
  delegation_id: string
  current_action: string
  step: ProgressStep
}

export interface UpdateProgressResponse {
  status: string
  steps_completed: number
  error_message: string
  error_code: string
}

export interface UpdateStatusRequest {
  delegation_id: string
  new_status: string
  result_summary?: string
  tools_used?: string[]
  turns?: number
  cost_usd?: number
  error_message?: string
}

export interface UpdateStatusResponse {
  status: string
  delegation_status: string
  updated_at: string
  error_message: string
  error_code: string
}

export interface MarkInterruptedRequest {
  company_id?: string
  owner_id?: string
}

export interface MarkInterruptedResponse {
  status: string
  delegations_marked: number
  error_message: string
  error_code: string
}

export interface ClaimDelegationRequest {
  delegation_id: string
  owner_id: string
}

export interface ClaimDelegationResponse {
  status: string
  claimed: boolean
  error_message: string
  error_code: string
}

export interface UpdateHeartbeatRequest {
  delegation_id: string
  owner_id: string
}

export interface UpdateHeartbeatResponse {
  status: string
  success: boolean
  error_message: string
  error_code: string
}

// ============================================================================
// Code Types — CreateCode (code.proto)
// ============================================================================

export interface CreateCodeRequest {
  code: string
  filename: string
  user_token: string
  metadata?: Record<string, string>
  request_id?: string
}

export interface CreateCodeResponse {
  status: string
  message: string
  code_id: string
  filename: string
  language: string
  title: string
  summary: string
  chunks_count: number
  entities_count: number
  relationships_count: number
  error_message: string
  error_code: string
}

// ============================================================================
// Lessons Learned Types — RecordLesson (lessons_learned.proto)
// ============================================================================

export interface RecordLessonRequest {
  user_token: string
  project_id: string
  category: string
  title: string
  symptom: string
  root_cause: string
  solution: string
  prevention: string
  severity?: string
  tags?: string[]
  files_changed?: string[]
}

export interface RecordLessonResponse {
  status: string
  lesson_id: string
  project_id: string
  category: string
  title: string
  error_message: string
  error_code: string
}

// ============================================================================
// Conversation Extraction Types (conversation_extraction.proto)
// ============================================================================

export interface ExtractedConceptProto {
  name: string
  type: string
  sentiment: string
}

export interface ExtractedDecisionProto {
  summary: string
  chose: string
  rejected: string[]
  reasoning: string
  confidence: string
}

export interface ExtractedPreferenceProto {
  category: string
  key: string
  value: string
  strength: string
}

export interface ExtractedTopicProto {
  name: string
  status: string
}

export interface ExtractedCodeRefProto {
  file: string
  entity: string
  action: string
}

export interface TurnExtractionProto {
  concepts: ExtractedConceptProto[]
  decisions: ExtractedDecisionProto[]
  preferences: ExtractedPreferenceProto[]
  topics: ExtractedTopicProto[]
  code_refs: ExtractedCodeRefProto[]
  intent: string
  urgency: string
  active_engagement_id?: string
  active_task_id?: string
  active_delegation_id?: string
}

export interface StoreExtractionResponse {
  success: boolean
  created_node_ids: string[]
  error_message: string
}

export interface RecallContextItem {
  type: string
  summary: string
  relationships: string[]
  timestamp: string
  confidence: string
}

export interface RecallContextResponse {
  context_items: RecallContextItem[]
  error_message: string
  error_code: string
}

export interface BuildSessionBridgeResponse {
  bridge_id: string
  active_threads: string[]
  open_questions: string[]
  next_steps: string[]
  error_message: string
  error_code: string
}

export interface GetUserProfileResponse {
  preferences: ExtractedPreferenceProto[]
  recent_decisions: ExtractedDecisionProto[]
  active_topics: ExtractedTopicProto[]
  error_message: string
  error_code: string
}

// ============================================================================
// Unified Search Types (unified_search.proto)
// ============================================================================

export interface UnifiedSearchResult {
  type: string
  id: string
  title: string
  snippet: string
  score: number
  project_id: string
  metadata_json: string
}

export interface UnifiedSearchResponse {
  status: string
  results: UnifiedSearchResult[]
  results_count: number
  types_searched: string[]
  error_message: string
  error_code: string
}

// ============================================================================
// Client Configuration
// ============================================================================

export interface LegionClientOptions {
  /** gRPC server host (default: api.wearethelegion.com) */
  host?: string
  /** gRPC server port (default: 50051) */
  port?: number
  /** LEGION API key (overrides LEGION_API_KEY env var) */
  apiKey?: string
  /** Email for password auth (overrides MCP_USER_EMAIL env var) */
  email?: string
  /** Password for password auth (overrides MCP_USER_PASSWORD env var) */
  password?: string
  /**
   * Pre-compiled proto JSON descriptor (from protobufjs Root.toJSON()).
   * When provided, skips filesystem-based proto loading entirely — needed
   * for compiled Bun binaries where proto files aren't on disk.
   */
  protoJSON?: Record<string, any>
  /**
   * Control TLS for the gRPC channel.
   * - true: always use TLS (createSsl)
   * - false: always use plaintext (createInsecure)
   * - undefined (default): auto-detect — TLS for remote hosts, plaintext for localhost
   */
  tls?: boolean
}

export interface AuthResult {
  status: string
  token: string
  user_email: string
  projects_count: number
  projects: ProjectItem[]
}
