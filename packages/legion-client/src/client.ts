/**
 * LEGION gRPC Client for TypeScript.
 *
 * Mirrors the Python GrpcClientManager pattern:
 * - Dynamic proto loading via @grpc/proto-loader
 * - Lazy service stub creation
 * - API key + password auth flows
 * - Auto-retry on UNAUTHENTICATED
 * - Bearer token injection on every call
 */

import * as grpc from "@grpc/grpc-js"
import * as protoLoader from "@grpc/proto-loader"
import * as path from "path"
import { fileURLToPath } from "url"

/** Compile-time default host — set via `--legion-default-host` build flag.
 *  In compiled binaries: api.wearethelegion.com. In local dev: falls back to "localhost". */
declare const LEGION_DEFAULT_HOST: string | undefined
const DEFAULT_HOST = typeof LEGION_DEFAULT_HOST === "string" ? LEGION_DEFAULT_HOST : "localhost"

import type {
  LegionClientOptions,
  AuthResult,
  AuthResponse,
  GetProjectsResponse,
  ProjectItem,
  WhoAmIResponse,
  GetAgentContextResponse,
  CreateAgentResponse,
  DeleteAgentResponse,
  UpdateAgentResponse,
  LinkAgentSkillResponse,
  UnlinkAgentSkillResponse,
  GetAgentSkillsResponse,
  SearchSkillDetailsResponse,
  GetSkillSectionsResponse,
  GetSkillContentResponse,
  GetWorkflowByIdResponse,
  CreateWorkflowResponse,
  UpdateWorkflowResponse,
  DeleteWorkflowResponse,
  ListWorkflowsResponse,
  ListCompanyAgentsResponse,
  QueryKnowledgeResponse,
  CreateKnowledgeResponse,
  ExploreGraphResponse,
  CreateEngagementResponse,
  GetEngagementResponse,
  ListEngagementsResponse,
  UpdateEngagementResponse,
  AddEntryResponse,
  UpdateEntryResponse,
  GetEntryResponse,
  GetEntriesResponse,
  SearchEntriesResponse,
  ResumeEngagementResponse,
  RememberResponse,
  RecallResponse,
  CreatePermanentMemoryResponse,
  GetPermanentMemoriesResponse,
  UpdatePermanentMemoryResponse,
  DeletePermanentMemoryResponse,
  GetActiveWorkStatusResponse,
  CreateTaskResponse,
  GetTaskResponse,
  ListTasksResponse,
  UpdateTaskResponse,
  CompleteTaskResponse,
  AssignTaskResponse,
  LinkArtifactResponse,
  GetArtifactsResponse,
  FindSimilarCodeResponse,
  AnalyzeImpactResponse,
  TraceExecutionFlowResponse,
  CreateCodeResponse,
  CreateExpertiseResponse,
  AddExpertiseChunkResponse,
  GetExpertiseResponse,
  UpdateExpertiseResponse,
  QueryExpertiseResponse,
  ListExpertiseResponse,
  QueryLessonsResponse,
  RecordLessonResponse,
  CreateDelegationResponse,
  DelegationStatusResponse,
  DelegationStatusBrief,
  DelegationResultResponse,
  ListDelegationsResponse,
  UpdateProgressResponse,
  UpdateStatusResponse,
  MarkInterruptedResponse,
  ClaimDelegationResponse,
  UpdateHeartbeatResponse,
  ProgressStep,
  StoreExtractionResponse,
  RecallContextResponse,
  BuildSessionBridgeResponse,
  GetUserProfileResponse,
  TurnExtractionProto,
  UnifiedSearchResponse,
} from "./types"

import { LegionError, LegionAuthError, LegionConnectionError } from "./errors"

// ---------------------------------------------------------------------------
// Proto loading helpers
// ---------------------------------------------------------------------------

const __filename_resolved = fileURLToPath(import.meta.url)
const __dirname_resolved = path.dirname(__filename_resolved)
const PROTOS_DIR = path.join(__dirname_resolved, "..", "protos")

/** All proto files the client needs to load. */
const PROTO_FILES = [
  "auth.proto",
  "agent_skill.proto",
  "engagement.proto",
  "task.proto",
  "knowledge.proto",
  "expertise.proto",
  "memory.proto",
  "delegation.proto",
  "code.proto",
  "lessons_learned.proto",
  "legion_common.proto",
  "ingestion.proto",
  "proxy.proto",
  "session.proto",
  "conversation_extraction.proto",
  "unified_search.proto",
]

const PROTO_LOADER_OPTIONS: protoLoader.Options = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
  includeDirs: [PROTOS_DIR],
}

// ---------------------------------------------------------------------------
// Utility: promisify unary gRPC calls
// ---------------------------------------------------------------------------

/**
 * Wraps a gRPC unary call in a Promise.
 * Handles the callback-style API that proto-loader generates.
 */
/** Default deadline for unary gRPC calls (15 seconds). */
const DEFAULT_DEADLINE_MS = 15_000

function callUnary<TReq, TRes>(
  client: any,
  methodName: string,
  request: TReq,
  metadata?: grpc.Metadata,
  deadlineMs: number = DEFAULT_DEADLINE_MS,
): Promise<TRes> {
  return new Promise((resolve, reject) => {
    const method = client[methodName]
    if (!method) {
      reject(new LegionError(`Unknown method: ${methodName}`, "UNKNOWN_METHOD"))
      return
    }
    const meta = metadata ?? new grpc.Metadata()
    const options: grpc.CallOptions = {
      deadline: new Date(Date.now() + deadlineMs),
    }
    method.call(client, request, meta, options, (err: grpc.ServiceError | null, response: TRes) => {
      if (err) {
        if (err.code === grpc.status.DEADLINE_EXCEEDED) {
          reject(new LegionConnectionError(`Request timed out after ${deadlineMs}ms`, err.details))
        } else if (err.code === grpc.status.UNAVAILABLE) {
          reject(new LegionConnectionError(err.message, err.details))
        } else if (err.code === grpc.status.UNAUTHENTICATED) {
          reject(err) // Let callWithAuth handle retry logic
        } else {
          reject(new LegionError(err.message, `GRPC_${err.code}`, false, err.details))
        }
      } else {
        resolve(response)
      }
    })
  })
}

// ---------------------------------------------------------------------------
// LegionClient
// ---------------------------------------------------------------------------

export class LegionClient {
  private host: string
  private port: number
  private address: string

  // Auth state
  private token: string | null = null
  private apiKey: string | null = null
  private email: string | null = null
  private password: string | null = null
  private usingApiKey = false

  // Cached user info after auth
  public userEmail: string | null = null
  public userProjects: ProjectItem[] = []

  /**
   * Active session ID. When set, included as `x-session-id` gRPC metadata
   * on every call so the server can correlate tool invocations to a session.
   */
  public sessionId: string | null = null

  // gRPC primitives
  private credentials: grpc.ChannelCredentials
  private packageDefinition: protoLoader.PackageDefinition | null = null
  private grpcObject: any = null
  private protoJSON: Record<string, any> | null = null

  // Lazy service stubs (created on first use)
  private _authClient: any = null
  private _agentSkillClient: any = null
  private _engagementClient: any = null
  private _taskClient: any = null
  private _knowledgeClient: any = null
  private _expertiseClient: any = null
  private _memoryClient: any = null
  private _delegationClient: any = null
  private _codeClient: any = null
  private _lessonsClient: any = null
  private _ingestionClient: any = null
  private _proxyClient: any = null
  private _sessionClient: any = null
  private _conversationExtractionClient: any = null
  private _unifiedSearchClient: any = null

  constructor(options: LegionClientOptions = {}) {
    this.host = options.host ?? process.env.GRPC_SERVER_HOST ?? DEFAULT_HOST
    this.port = options.port ?? parseInt(process.env.GRPC_SERVER_PORT ?? "50051", 10)
    this.address = `${this.host}:${this.port}`

    this.apiKey = options.apiKey ?? process.env.LEGION_API_KEY ?? null
    this.email = options.email ?? process.env.MCP_USER_EMAIL ?? null
    this.password = options.password ?? process.env.MCP_USER_PASSWORD ?? null
    this.protoJSON = options.protoJSON ?? null

    // TLS mode: explicit option overrides; default is insecure (server uses plaintext gRPC)
    const useTls = options.tls === true
    this.credentials = useTls ? grpc.credentials.createSsl() : grpc.credentials.createInsecure()
  }

  // -------------------------------------------------------------------------
  // Proto loading & stub creation
  // -------------------------------------------------------------------------

  /** Load all proto definitions. Idempotent. */
  private ensureProtos(): void {
    if (this.packageDefinition) return

    if (this.protoJSON) {
      // Use pre-compiled JSON descriptor (for compiled binaries where .proto
      // files aren't on disk). Uses protoLoader.fromJSON which reconstructs
      // a PackageDefinition from a protobufjs Root JSON without filesystem access.
      this.packageDefinition = protoLoader.fromJSON(this.protoJSON, PROTO_LOADER_OPTIONS)
    } else {
      const protoFiles = PROTO_FILES.map((f) => path.join(PROTOS_DIR, f))
      this.packageDefinition = protoLoader.loadSync(protoFiles, PROTO_LOADER_OPTIONS)
    }
    this.grpcObject = grpc.loadPackageDefinition(this.packageDefinition)
  }

  /** Get or create a service client by package path and service name. */
  private getServiceClient(packagePath: string, serviceName: string): any {
    this.ensureProtos()
    const parts = packagePath.split(".")
    let obj = this.grpcObject
    for (const part of parts) {
      obj = obj?.[part]
      if (!obj) {
        throw new Error(`Package path not found: ${packagePath} (failed at '${part}')`)
      }
    }
    const ServiceConstructor = obj[serviceName]
    if (!ServiceConstructor) {
      throw new Error(`Service not found: ${packagePath}.${serviceName}`)
    }
    return new ServiceConstructor(this.address, this.credentials)
  }

  // Lazy getters for each service
  private get authClient() {
    if (!this._authClient) this._authClient = this.getServiceClient("legion.auth", "AuthService")
    return this._authClient
  }

  private get agentSkillClient() {
    if (!this._agentSkillClient)
      this._agentSkillClient = this.getServiceClient("legion.agent_skill", "AgentSkillService")
    return this._agentSkillClient
  }

  private get engagementClient() {
    if (!this._engagementClient)
      this._engagementClient = this.getServiceClient("legion.engagement", "EngagementService")
    return this._engagementClient
  }

  private get taskClient() {
    if (!this._taskClient) this._taskClient = this.getServiceClient("legion.task", "TaskService")
    return this._taskClient
  }

  private get knowledgeClient() {
    if (!this._knowledgeClient) this._knowledgeClient = this.getServiceClient("legion.knowledge", "KnowledgeService")
    return this._knowledgeClient
  }

  private get expertiseClient() {
    if (!this._expertiseClient) this._expertiseClient = this.getServiceClient("legion.expertise", "ExpertiseService")
    return this._expertiseClient
  }

  private get memoryClient() {
    if (!this._memoryClient) this._memoryClient = this.getServiceClient("legion.memory", "MemoryService")
    return this._memoryClient
  }

  private get delegationClient() {
    if (!this._delegationClient)
      this._delegationClient = this.getServiceClient("legion.delegation", "DelegationService")
    return this._delegationClient
  }

  private get codeClient() {
    if (!this._codeClient) this._codeClient = this.getServiceClient("legion.code", "CodeService")
    return this._codeClient
  }

  private get lessonsClient() {
    if (!this._lessonsClient) this._lessonsClient = this.getServiceClient("legion.lessons", "LessonsLearnedService")
    return this._lessonsClient
  }

  private get ingestionClient() {
    if (!this._ingestionClient) this._ingestionClient = this.getServiceClient("legion.ingestion", "IngestionService")
    return this._ingestionClient
  }

  private get proxyClient() {
    if (!this._proxyClient) this._proxyClient = this.getServiceClient("legion.proxy", "ProxyService")
    return this._proxyClient
  }

  private get sessionClient() {
    if (!this._sessionClient) this._sessionClient = this.getServiceClient("legion.session", "SessionService")
    return this._sessionClient
  }

  private get conversationExtractionClient() {
    if (!this._conversationExtractionClient)
      this._conversationExtractionClient = this.getServiceClient(
        "legion.conversation_extraction",
        "ConversationExtractionService",
      )
    return this._conversationExtractionClient
  }

  private get unifiedSearchClient() {
    if (!this._unifiedSearchClient)
      this._unifiedSearchClient = this.getServiceClient("legion.unified_search", "UnifiedSearchService")
    return this._unifiedSearchClient
  }

  // -------------------------------------------------------------------------
  // Auth helpers
  // -------------------------------------------------------------------------

  /** Build gRPC metadata with Bearer token. */
  private authMetadata(): grpc.Metadata {
    const meta = new grpc.Metadata()
    if (this.token) {
      meta.set("authorization", `Bearer ${this.token}`)
    }
    if (this.sessionId) {
      meta.set("x-session-id", this.sessionId)
    }
    return meta
  }

  /**
   * Authenticate using API key or email/password.
   * Mirrors Python GrpcClientManager.authenticate().
   */
  async authenticate(): Promise<AuthResult> {
    if (this.apiKey) {
      return this._authenticateWithApiKey()
    }
    return this._authenticateWithPassword()
  }

  private async _authenticateWithApiKey(): Promise<AuthResult> {
    if (!this.apiKey!.startsWith("lgn_")) {
      throw new Error("Invalid LEGION_API_KEY format. Must start with 'lgn_'")
    }

    this.token = this.apiKey!
    this.usingApiKey = true

    const meta = this.authMetadata()
    const response = await callUnary<any, GetProjectsResponse>(
      this.authClient,
      "GetProjects",
      { user_token: this.token },
      meta,
    )

    if (response.status !== "success") {
      throw new Error(`API_KEY validation failed: ${response.message}`)
    }

    this.userEmail = response.user_email
    this.userProjects = (response.projects ?? []).map((p: any) => ({
      id: p.id,
      company_id: p.company_id,
      name: p.name,
      description: p.description,
      company_name: p.company_name,
    }))

    return {
      status: "success",
      token: "[API_KEY]",
      user_email: this.userEmail!,
      projects_count: this.userProjects.length,
      projects: this.userProjects,
    }
  }

  private async _authenticateWithPassword(): Promise<AuthResult> {
    if (!this.email || !this.password) {
      throw new Error(
        "Missing credentials: Set LEGION_API_KEY or MCP_USER_EMAIL+MCP_USER_PASSWORD environment variables",
      )
    }

    this.usingApiKey = false

    // Step 1: Authenticate
    const authResponse = await callUnary<any, AuthResponse>(this.authClient, "Authenticate", {
      email: this.email,
      password: this.password,
    })

    if (authResponse.status !== "success") {
      throw new Error(`Authentication failed: ${authResponse.message}`)
    }

    this.token = authResponse.access_token
    this.userEmail = authResponse.user_email

    // Step 2: GetProjects
    const meta = this.authMetadata()
    const projectsResponse = await callUnary<any, GetProjectsResponse>(
      this.authClient,
      "GetProjects",
      { user_token: this.token },
      meta,
    )

    if (projectsResponse.status === "success") {
      this.userProjects = (projectsResponse.projects ?? []).map((p: any) => ({
        id: p.id,
        company_id: p.company_id,
        name: p.name,
        description: p.description,
        company_name: p.company_name,
      }))
    }

    return {
      status: "success",
      token: this.token!,
      user_email: this.userEmail!,
      projects_count: this.userProjects.length,
      projects: this.userProjects,
    }
  }

  // -------------------------------------------------------------------------
  // Core call wrapper: auth + auto-retry on UNAUTHENTICATED
  // -------------------------------------------------------------------------

  /**
   * Call a gRPC method with automatic auth and retry.
   * Mirrors Python GrpcClientManager.call_with_auth().
   */
  private async callWithAuth<TReq extends Record<string, any>, TRes>(
    client: any,
    methodName: string,
    request: TReq,
  ): Promise<TRes> {
    // Ensure authenticated
    if (!this.token) {
      await this.authenticate()
    }

    // Inject user_token into request if the field exists in the proto
    const reqWithToken = { ...request, user_token: this.token }
    const meta = this.authMetadata()

    try {
      const res = await callUnary<any, TRes>(client, methodName, reqWithToken, meta)
      return res
    } catch (err: any) {
      // Auto-retry on UNAUTHENTICATED (password mode only)
      if (err?.code === grpc.status.UNAUTHENTICATED) {
        if (this.usingApiKey) {
          throw new LegionAuthError("LEGION_API_KEY rejected. Token may be revoked or expired.")
        }

        // Re-authenticate and retry
        await this.authenticate()
        const retryReq = { ...request, user_token: this.token }
        const retryMeta = this.authMetadata()
        return await callUnary<any, TRes>(client, methodName, retryReq, retryMeta)
      }
      throw err
    }
  }

  // -------------------------------------------------------------------------
  // Public API Methods — Agent Skill Service
  // -------------------------------------------------------------------------

  /** Identity bootstrap. Returns agent identity, skills, available agents. */
  async whoAmI(opts?: { agentId?: string; companyId?: string; projectId?: string }): Promise<WhoAmIResponse> {
    return this.callWithAuth(this.agentSkillClient, "WhoAmI", {
      agent_id: opts?.agentId ?? "",
      company_id: opts?.companyId ?? "",
      project_id: opts?.projectId ?? "",
    })
  }

  /** Get combined system prompt for delegation. */
  async getAgentContext(agentId: string, projectId?: string): Promise<GetAgentContextResponse> {
    return this.callWithAuth(this.agentSkillClient, "GetAgentContext", {
      agent_id: agentId,
      project_id: projectId ?? "",
    })
  }

  /** Create a new specialist agent. */
  async createAgent(opts: {
    companyId: string
    name: string
    role: string
    personality: string
    mainResponsibilities: string
    systemPrompt: string
    whenToUse: string
    capabilities?: string[]
    specialization?: string
    projectId?: string
  }): Promise<CreateAgentResponse> {
    return this.callWithAuth(this.agentSkillClient, "CreateAgent", {
      company_id: opts.companyId,
      name: opts.name,
      role: opts.role,
      personality: opts.personality,
      main_responsibilities: opts.mainResponsibilities,
      system_prompt: opts.systemPrompt,
      when_to_use: opts.whenToUse,
      capabilities: opts.capabilities ?? [],
      specialization: opts.specialization ?? "",
      project_id: opts.projectId ?? "",
    })
  }

  /** Delete an agent and clean up all associations. */
  async deleteAgent(agentId: string): Promise<DeleteAgentResponse> {
    return this.callWithAuth(this.agentSkillClient, "DeleteAgent", {
      agent_id: agentId,
    })
  }

  /** Update an existing agent. Uses sentinel booleans for partial updates. */
  async updateAgent(
    agentId: string,
    opts?: {
      name?: string
      personality?: string
      mainResponsibilities?: string
      systemPrompt?: string
      whenToUse?: string
      metadataJson?: string
      projectId?: string
      public?: boolean
    },
  ): Promise<UpdateAgentResponse> {
    return this.callWithAuth(this.agentSkillClient, "UpdateAgent", {
      agent_id: agentId,
      name: opts?.name ?? "",
      name_provided: opts?.name !== undefined,
      personality: opts?.personality ?? "",
      personality_provided: opts?.personality !== undefined,
      main_responsibilities: opts?.mainResponsibilities ?? "",
      main_responsibilities_provided: opts?.mainResponsibilities !== undefined,
      system_prompt: opts?.systemPrompt ?? "",
      system_prompt_provided: opts?.systemPrompt !== undefined,
      when_to_use: opts?.whenToUse ?? "",
      when_to_use_provided: opts?.whenToUse !== undefined,
      metadata_json: opts?.metadataJson ?? "",
      metadata_provided: opts?.metadataJson !== undefined,
      project_id: opts?.projectId ?? "",
      project_id_provided: opts?.projectId !== undefined,
      public: opts?.public ?? false,
      public_provided: opts?.public !== undefined,
    })
  }

  /** Link an expertise document to an agent as a skill. */
  async linkAgentSkill(agentId: string, expertiseId: string): Promise<LinkAgentSkillResponse> {
    return this.callWithAuth(this.agentSkillClient, "LinkAgentSkill", {
      agent_id: agentId,
      expertise_id: expertiseId,
    })
  }

  /** Remove an expertise link from an agent. */
  async unlinkAgentSkill(agentId: string, expertiseId: string): Promise<UnlinkAgentSkillResponse> {
    return this.callWithAuth(this.agentSkillClient, "UnlinkAgentSkill", {
      agent_id: agentId,
      expertise_id: expertiseId,
    })
  }

  /** Get lightweight skill overview for an agent. */
  async getAgentSkills(agentId: string): Promise<GetAgentSkillsResponse> {
    return this.callWithAuth(this.agentSkillClient, "GetAgentSkills", {
      agent_id: agentId,
    })
  }

  /** Semantic search within one skill's chunks. */
  async searchSkillDetails(expertiseId: string, query: string, limit = 5): Promise<SearchSkillDetailsResponse> {
    return this.callWithAuth(this.agentSkillClient, "SearchSkillDetails", {
      expertise_id: expertiseId,
      query,
      limit,
    })
  }

  /** Get sections for one expertise document. */
  async getSkillSections(expertiseId: string): Promise<GetSkillSectionsResponse> {
    return this.callWithAuth(this.agentSkillClient, "GetSkillSections", {
      expertise_id: expertiseId,
    })
  }

  /** Get full content of a specific skill section. */
  async getSkillContent(chunkId: string): Promise<GetSkillContentResponse> {
    return this.callWithAuth(this.agentSkillClient, "GetSkillContent", {
      chunk_id: chunkId,
    })
  }

  /** Fetch full workflow content by ID. */
  async getWorkflowById(workflowId: string): Promise<GetWorkflowByIdResponse> {
    return this.callWithAuth(this.agentSkillClient, "GetWorkflowById", {
      workflow_id: workflowId,
    })
  }

  /** Create a new workflow. */
  async createWorkflow(opts: {
    companyId: string
    name: string
    content: string
    signals: string[]
    whenToUse: string
    description?: string
    role?: string
    agentId?: string
    projectId?: string
    public?: boolean
    metadataJson?: string
  }): Promise<CreateWorkflowResponse> {
    return this.callWithAuth(this.agentSkillClient, "CreateWorkflow", {
      company_id: opts.companyId,
      name: opts.name,
      content: opts.content,
      signals: opts.signals,
      when_to_use: opts.whenToUse,
      description: opts.description ?? "",
      role: opts.role ?? "",
      agent_id: opts.agentId ?? "",
      project_id: opts.projectId ?? "",
      public: opts.public ?? false,
      metadata_json: opts.metadataJson ?? "",
    })
  }

  /** Update an existing workflow. Uses sentinel booleans for partial updates. */
  async updateWorkflow(
    workflowId: string,
    opts?: {
      name?: string
      content?: string
      signals?: string[]
      whenToUse?: string
      description?: string
      role?: string
      agentId?: string
      projectId?: string
      public?: boolean
      metadataJson?: string
    },
  ): Promise<UpdateWorkflowResponse> {
    return this.callWithAuth(this.agentSkillClient, "UpdateWorkflow", {
      workflow_id: workflowId,
      name: opts?.name ?? "",
      name_provided: opts?.name !== undefined,
      content: opts?.content ?? "",
      content_provided: opts?.content !== undefined,
      signals: opts?.signals ?? [],
      signals_provided: opts?.signals !== undefined,
      when_to_use: opts?.whenToUse ?? "",
      when_to_use_provided: opts?.whenToUse !== undefined,
      description: opts?.description ?? "",
      description_provided: opts?.description !== undefined,
      role: opts?.role ?? "",
      role_provided: opts?.role !== undefined,
      agent_id: opts?.agentId ?? "",
      agent_id_provided: opts?.agentId !== undefined,
      project_id: opts?.projectId ?? "",
      project_id_provided: opts?.projectId !== undefined,
      public: opts?.public ?? false,
      public_provided: opts?.public !== undefined,
      metadata_json: opts?.metadataJson ?? "",
      metadata_provided: opts?.metadataJson !== undefined,
    })
  }

  /** Delete a workflow by ID. */
  async deleteWorkflow(workflowId: string): Promise<DeleteWorkflowResponse> {
    return this.callWithAuth(this.agentSkillClient, "DeleteWorkflow", {
      workflow_id: workflowId,
    })
  }

  /** List visible workflows with optional filters. */
  async listWorkflows(opts: {
    companyId: string
    role?: string
    agentId?: string
    projectId?: string
    limit?: number
    offset?: number
  }): Promise<ListWorkflowsResponse> {
    return this.callWithAuth(this.agentSkillClient, "ListWorkflows", {
      company_id: opts.companyId,
      role: opts.role ?? "",
      agent_id: opts.agentId ?? "",
      project_id: opts.projectId ?? "",
      limit: opts.limit ?? 50,
      offset: opts.offset ?? 0,
    })
  }

  /** List all agents in a company with combined system prompts. */
  async listCompanyAgents(companyId: string, projectId?: string): Promise<ListCompanyAgentsResponse> {
    return this.callWithAuth(this.agentSkillClient, "ListCompanyAgents", {
      company_id: companyId,
      project_id: projectId ?? "",
    })
  }

  // -------------------------------------------------------------------------
  // Public API Methods — Knowledge Service
  // -------------------------------------------------------------------------

  /** Hybrid semantic search across knowledge. */
  async queryKnowledge(query: string, projectId: string, limit = 10): Promise<QueryKnowledgeResponse> {
    return this.callWithAuth(this.knowledgeClient, "QueryKnowledge", {
      query,
      project_id: projectId,
      limit,
    })
  }

  /** Fast vector-only search (identical to queryKnowledge). */
  async fastQuery(query: string, projectId: string, limit = 10): Promise<QueryKnowledgeResponse> {
    return this.callWithAuth(this.knowledgeClient, "FastQuery", {
      query,
      project_id: projectId,
      limit,
    })
  }

  /** Store knowledge for semantic search. */
  async createKnowledge(
    text: string,
    projectId: string,
    whenToUse: string,
    opts?: { metadata?: Record<string, string>; requestId?: string },
  ): Promise<CreateKnowledgeResponse> {
    return this.callWithAuth(this.knowledgeClient, "CreateKnowledge", {
      text,
      project_id: projectId,
      when_to_use: whenToUse,
      metadata: opts?.metadata ?? {},
      request_id: opts?.requestId ?? "",
    })
  }

  /** Filter knowledge by metadata fields. */
  async searchByTags(
    projectId: string,
    opts?: {
      keywords?: string[]
      chunkType?: string
      hasCode?: boolean
      sectionTitle?: string
      sectionLevel?: number
      limit?: number
      offset?: number
    },
  ): Promise<QueryKnowledgeResponse> {
    return this.callWithAuth(this.knowledgeClient, "SearchByTags", {
      project_id: projectId,
      keywords: opts?.keywords ?? [],
      chunk_type: opts?.chunkType ?? "",
      has_code: opts?.hasCode ?? false,
      section_title: opts?.sectionTitle ?? "",
      section_level: opts?.sectionLevel ?? 0,
      limit: opts?.limit ?? 10,
      offset: opts?.offset ?? 0,
    })
  }

  /** Run custom Cypher queries on Neo4j knowledge graph. */
  async exploreGraph(
    cypher: string,
    projectId: string,
    opts?: { params?: Record<string, string>; limit?: number },
  ): Promise<ExploreGraphResponse> {
    return this.callWithAuth(this.knowledgeClient, "ExploreGraph", {
      cypher,
      project_id: projectId,
      params: opts?.params ?? {},
      limit: opts?.limit ?? 100,
    })
  }

  // -------------------------------------------------------------------------
  // Public API Methods — Engagement Service
  // -------------------------------------------------------------------------

  /** Create a new engagement (work session). */
  async createEngagement(opts: {
    projectId: string
    name: string
    ultimateGoal: string
    companyId?: string
    agentId?: string
    summary?: string
    engagementId?: string
  }): Promise<CreateEngagementResponse> {
    return this.callWithAuth(this.engagementClient, "CreateEngagement", {
      project_id: opts.projectId,
      name: opts.name,
      ultimate_goal: opts.ultimateGoal,
      company_id: opts.companyId ?? "",
      agent_id: opts.agentId ?? "",
      summary: opts.summary ?? "",
      engagement_id: opts.engagementId ?? "",
    })
  }

  /** Get engagement details with entry metadata. */
  async getEngagement(engagementId: string): Promise<GetEngagementResponse> {
    return this.callWithAuth(this.engagementClient, "GetEngagement", {
      engagement_id: engagementId,
    })
  }

  /** List engagements for a project. */
  async listEngagements(
    projectId: string,
    opts?: { status?: string; limit?: number; offset?: number; engagementId?: string; companyId?: string },
  ): Promise<ListEngagementsResponse> {
    return this.callWithAuth(this.engagementClient, "ListEngagements", {
      project_id: projectId,
      company_id: opts?.companyId ?? "",
      status: opts?.status ?? "",
      limit: opts?.limit ?? 50,
      offset: opts?.offset ?? 0,
      engagement_id: opts?.engagementId ?? "",
    })
  }

  /** Update engagement details. */
  async updateEngagement(
    engagementId: string,
    opts?: { name?: string; status?: string; summary?: string; ultimateGoal?: string; parentEngagementId?: string },
  ): Promise<UpdateEngagementResponse> {
    return this.callWithAuth(this.engagementClient, "UpdateEngagement", {
      engagement_id: engagementId,
      name: opts?.name ?? "",
      status: opts?.status ?? "",
      summary: opts?.summary ?? "",
      ultimate_goal: opts?.ultimateGoal ?? "",
      parent_engagement_id: opts?.parentEngagementId ?? "",
    })
  }

  /** Add an entry to an engagement. */
  async addEntry(opts: {
    engagementId: string
    entryType: string
    title: string
    content: string
    agentId?: string
    references?: string[]
    tags?: string[]
  }): Promise<AddEntryResponse> {
    return this.callWithAuth(this.engagementClient, "AddEntry", {
      engagement_id: opts.engagementId,
      entry_type: opts.entryType,
      title: opts.title,
      content: opts.content,
      agent_id: opts.agentId ?? "",
      references: opts.references ?? [],
      tags: opts.tags ?? [],
    })
  }

  /** Update an existing entry's content, references, or tags. */
  async updateEntry(
    entryId: string,
    opts?: { content?: string; references?: string[]; tags?: string[] },
  ): Promise<UpdateEntryResponse> {
    return this.callWithAuth(this.engagementClient, "UpdateEntry", {
      entry_id: entryId,
      content: opts?.content ?? "",
      references: opts?.references ?? [],
      tags: opts?.tags ?? [],
    })
  }

  /** Get a single entry with full content. */
  async getEntry(entryId: string): Promise<GetEntryResponse> {
    return this.callWithAuth(this.engagementClient, "GetEntry", {
      entry_id: entryId,
    })
  }

  /** Get all entries for an engagement with full content. */
  async getEntries(engagementId: string, entryType?: string): Promise<GetEntriesResponse> {
    return this.callWithAuth(this.engagementClient, "GetEntries", {
      engagement_id: engagementId,
      entry_type: entryType ?? "",
    })
  }

  /** Search across engagement entries. */
  async searchEntries(
    query: string,
    projectId: string,
    opts?: {
      limit?: number
      entryType?: string
      engagementId?: string
      offset?: number
      companyId?: string
    },
  ): Promise<SearchEntriesResponse> {
    return this.callWithAuth(this.engagementClient, "SearchEntries", {
      query,
      project_id: projectId,
      company_id: opts?.companyId ?? "",
      limit: opts?.limit ?? 10,
      entry_type: opts?.entryType ?? "",
      engagement_id: opts?.engagementId ?? "",
      offset: opts?.offset ?? 0,
    })
  }

  /** Get formatted resumption context for an engagement. */
  async resumeEngagement(engagementId: string): Promise<ResumeEngagementResponse> {
    return this.callWithAuth(this.engagementClient, "ResumeEngagement", {
      engagement_id: engagementId,
    })
  }

  // -------------------------------------------------------------------------
  // Public API Methods — Memory Service
  // -------------------------------------------------------------------------

  /** Store short-term memory, optionally promote to permanent. */
  async remember(opts: {
    projectId: string
    agentId: string
    memoryKey: string
    content: string
    engagementId?: string
    ttlMinutes?: number
    promoteToPermanent?: boolean
    memoryType?: string
    importance?: number
  }): Promise<RememberResponse> {
    return this.callWithAuth(this.memoryClient, "Remember", {
      project_id: opts.projectId,
      agent_id: opts.agentId,
      memory_key: opts.memoryKey,
      content: opts.content,
      engagement_id: opts.engagementId ?? "",
      ttl_minutes: opts.ttlMinutes ?? 0,
      promote_to_permanent: opts.promoteToPermanent ?? false,
      memory_type: opts.memoryType ?? "",
      importance: opts.importance ?? 5,
    })
  }

  /** Semantic search across memories (working + permanent). */
  async recall(
    query: string,
    projectId: string,
    opts?: {
      agentId?: string
      limit?: number
      includePermanent?: boolean
      includeWorking?: boolean
      engagementId?: string
      memoryType?: string
      minImportance?: number
    },
  ): Promise<RecallResponse> {
    return this.callWithAuth(this.memoryClient, "Recall", {
      project_id: projectId,
      query,
      agent_id: opts?.agentId ?? "",
      limit: opts?.limit ?? 10,
      include_permanent: opts?.includePermanent ?? true,
      include_working: opts?.includeWorking ?? true,
      engagement_id: opts?.engagementId ?? "",
      memory_type: opts?.memoryType ?? "",
      min_importance: opts?.minImportance ?? 0,
    })
  }

  /** Create a permanent memory. */
  async createPermanentMemory(opts: {
    companyId: string
    projectId: string
    memoryType: string
    key: string
    content: string
    agentId?: string
    metadata?: Record<string, string>
    importance?: number
  }): Promise<CreatePermanentMemoryResponse> {
    return this.callWithAuth(this.memoryClient, "CreatePermanentMemory", {
      company_id: opts.companyId,
      project_id: opts.projectId,
      memory_type: opts.memoryType,
      key: opts.key,
      content: opts.content,
      agent_id: opts.agentId ?? "",
      metadata: opts.metadata ?? {},
      importance: opts.importance ?? 5,
    })
  }

  /** Get permanent memories with optional filters. */
  async getPermanentMemories(
    projectId: string,
    opts?: {
      agentId?: string
      memoryType?: string
      memoryId?: string
      key?: string
      limit?: number
      offset?: number
    },
  ): Promise<GetPermanentMemoriesResponse> {
    return this.callWithAuth(this.memoryClient, "GetPermanentMemories", {
      project_id: projectId,
      agent_id: opts?.agentId ?? "",
      memory_type: opts?.memoryType ?? "",
      memory_id: opts?.memoryId ?? "",
      key: opts?.key ?? "",
      limit: opts?.limit ?? 50,
      offset: opts?.offset ?? 0,
    })
  }

  /** Update an existing permanent memory. */
  async updatePermanentMemory(
    memoryId: string,
    opts?: {
      content?: string
      metadata?: Record<string, string>
      importance?: number
    },
  ): Promise<UpdatePermanentMemoryResponse> {
    return this.callWithAuth(this.memoryClient, "UpdatePermanentMemory", {
      memory_id: memoryId,
      content: opts?.content ?? "",
      metadata: opts?.metadata ?? {},
      importance: opts?.importance ?? 0,
    })
  }

  /** Delete a permanent memory. */
  async deletePermanentMemory(memoryId: string): Promise<DeletePermanentMemoryResponse> {
    return this.callWithAuth(this.memoryClient, "DeletePermanentMemory", {
      memory_id: memoryId,
    })
  }

  // /** Get overview of memory state for project/agent(s). */
  // async getActiveWorkStatus(projectId: string, agentId?: string): Promise<GetActiveWorkStatusResponse> {
  //   return this.callWithAuth(this.memoryClient, "GetActiveWorkStatus", {
  //     project_id: projectId,
  //     agent_id: agentId ?? "",
  //   })
  // }

  // -------------------------------------------------------------------------
  // Public API Methods — Task Service
  // -------------------------------------------------------------------------

  /** Create a new task. */
  async createTask(opts: {
    title: string
    ultimateGoal: string
    projectId?: string
    companyId?: string
    engagementId?: string
    description?: string
    priority?: string
    assignedAgentId?: string
    createdByAgentId?: string
  }): Promise<CreateTaskResponse> {
    return this.callWithAuth(this.taskClient, "CreateTask", {
      title: opts.title,
      ultimate_goal: opts.ultimateGoal,
      project_id: opts.projectId ?? "",
      company_id: opts.companyId ?? "",
      engagement_id: opts.engagementId ?? "",
      description: opts.description ?? "",
      priority: opts.priority ?? "medium",
      assigned_agent_id: opts.assignedAgentId ?? "",
      created_by_agent_id: opts.createdByAgentId ?? "",
    })
  }

  /** Get task details with linked artifacts. */
  async getTask(taskId: string): Promise<GetTaskResponse> {
    return this.callWithAuth(this.taskClient, "GetTask", {
      task_id: taskId,
    })
  }

  /** List tasks with optional filters. */
  async listTasks(opts?: {
    projectId?: string
    companyId?: string
    engagementId?: string
    agentId?: string
    status?: string
    limit?: number
    offset?: number
  }): Promise<ListTasksResponse> {
    return this.callWithAuth(this.taskClient, "ListTasks", {
      project_id: opts?.projectId ?? "",
      company_id: opts?.companyId ?? "",
      engagement_id: opts?.engagementId ?? "",
      agent_id: opts?.agentId ?? "",
      status: opts?.status ?? "",
      limit: opts?.limit ?? 50,
      offset: opts?.offset ?? 0,
    })
  }

  /** Update task (status, assignment, blockers, priority). */
  async updateTask(
    taskId: string,
    opts?: {
      status?: string
      assignedAgentId?: string
      blockers?: string
      priority?: string
      ultimateGoal?: string
    },
  ): Promise<UpdateTaskResponse> {
    return this.callWithAuth(this.taskClient, "UpdateTask", {
      task_id: taskId,
      status: opts?.status ?? "",
      assigned_agent_id: opts?.assignedAgentId ?? "",
      blockers: opts?.blockers ?? "",
      priority: opts?.priority ?? "",
      ultimate_goal: opts?.ultimateGoal ?? "",
    })
  }

  /** Mark task as completed. */
  async completeTask(taskId: string): Promise<CompleteTaskResponse> {
    return this.callWithAuth(this.taskClient, "CompleteTask", {
      task_id: taskId,
    })
  }

  /** Assign task to an agent. */
  async assignTask(taskId: string, agentId: string): Promise<AssignTaskResponse> {
    return this.callWithAuth(this.taskClient, "AssignTask", {
      task_id: taskId,
      agent_id: agentId,
    })
  }

  /** Link an artifact to a task for traceability. */
  async linkArtifact(taskId: string, artifactType: string, artifactId: string): Promise<LinkArtifactResponse> {
    return this.callWithAuth(this.taskClient, "LinkArtifact", {
      task_id: taskId,
      artifact_type: artifactType,
      artifact_id: artifactId,
    })
  }

  /** Get artifacts linked to a task. */
  async getArtifacts(taskId: string, artifactType?: string): Promise<GetArtifactsResponse> {
    return this.callWithAuth(this.taskClient, "GetArtifacts", {
      task_id: taskId,
      artifact_type: artifactType ?? "",
    })
  }

  // -------------------------------------------------------------------------
  // Public API Methods — Code Service
  // -------------------------------------------------------------------------

  /** Search indexed code by natural language or snippet. */
  async findSimilarCode(
    query: string,
    opts?: { language?: string; projectId?: string; limit?: number },
  ): Promise<FindSimilarCodeResponse> {
    return this.callWithAuth(this.codeClient, "FindSimilarCode", {
      query,
      language: opts?.language ?? "",
      project_id: opts?.projectId ?? "",
      limit: opts?.limit ?? 10,
    })
  }

  /** Analyze blast radius of changing a function/class. */
  async analyzeImpact(
    entityName: string,
    entityType: string,
    projectId: string,
    maxDepth = 3,
  ): Promise<AnalyzeImpactResponse> {
    return this.callWithAuth(this.codeClient, "AnalyzeImpact", {
      entity_name: entityName,
      entity_type: entityType,
      project_id: projectId,
      max_depth: maxDepth,
    })
  }

  /** Trace execution flow from an entry point. */
  async traceExecutionFlow(entryPoint: string, projectId: string, maxDepth = 5): Promise<TraceExecutionFlowResponse> {
    return this.callWithAuth(this.codeClient, "TraceExecutionFlow", {
      entry_point: entryPoint,
      project_id: projectId,
      max_depth: maxDepth,
    })
  }

  /** Index source code for semantic search. */
  async createCode(
    code: string,
    filename: string,
    opts?: { metadata?: Record<string, string>; requestId?: string },
  ): Promise<CreateCodeResponse> {
    return this.callWithAuth(this.codeClient, "CreateCode", {
      code,
      filename,
      metadata: opts?.metadata ?? {},
      request_id: opts?.requestId ?? "",
    })
  }

  // -------------------------------------------------------------------------
  // Public API Methods — Expertise Service
  // -------------------------------------------------------------------------

  /** Store structured knowledge with hierarchical sections. */
  async createExpertise(
    text: string,
    whenToUse: string,
    opts?: {
      projectId?: string
      companyId?: string
      metadata?: Record<string, string>
      requestId?: string
    },
  ): Promise<CreateExpertiseResponse> {
    return this.callWithAuth(this.expertiseClient, "CreateExpertise", {
      text,
      when_to_use: whenToUse,
      project_id: opts?.projectId ?? "",
      company_id: opts?.companyId ?? "",
      metadata: opts?.metadata ?? {},
      request_id: opts?.requestId ?? "",
    })
  }

  /** Add a section to an existing expertise document. */
  async addExpertiseChunk(
    expertiseId: string,
    content: string,
    opts?: { parentChunkId?: string; projectId?: string },
  ): Promise<AddExpertiseChunkResponse> {
    return this.callWithAuth(this.expertiseClient, "AddExpertiseChunk", {
      expertise_id: expertiseId,
      content,
      parent_chunk_id: opts?.parentChunkId ?? "",
      project_id: opts?.projectId ?? "",
    })
  }

  /** Get full content of a specific expertise document. */
  async getExpertise(expertiseId: string): Promise<GetExpertiseResponse> {
    return this.callWithAuth(this.expertiseClient, "GetExpertise", {
      expertise_id: expertiseId,
    })
  }

  /** Search expertise documents. */
  async queryExpertise(
    query: string,
    opts?: { projectId?: string; companyId?: string; limit?: number },
  ): Promise<QueryExpertiseResponse> {
    return this.callWithAuth(this.expertiseClient, "QueryExpertise", {
      query,
      project_id: opts?.projectId ?? "",
      company_id: opts?.companyId ?? "",
      limit: opts?.limit ?? 10,
    })
  }

  /** List expertise documents. */
  async listExpertise(opts?: {
    projectId?: string
    companyId?: string
    limit?: number
    offset?: number
  }): Promise<ListExpertiseResponse> {
    return this.callWithAuth(this.expertiseClient, "ListExpertise", {
      project_id: opts?.projectId ?? "",
      company_id: opts?.companyId ?? "",
      limit: opts?.limit ?? 100,
      offset: opts?.offset ?? 0,
    })
  }

  /** Update an existing expertise. Only provided fields are changed. */
  async updateExpertise(expertiseId: string, opts?: { whenToUse?: string }): Promise<UpdateExpertiseResponse> {
    return this.callWithAuth(this.expertiseClient, "UpdateExpertise", {
      expertise_id: expertiseId,
      when_to_use: opts?.whenToUse ?? "",
      when_to_use_provided: opts?.whenToUse !== undefined,
    })
  }

  // -------------------------------------------------------------------------
  // Public API Methods — Lessons Learned Service
  // -------------------------------------------------------------------------

  /** Search past resolved issues for solutions. */
  async queryLessons(
    query: string,
    projectId: string,
    opts?: { categoryFilter?: string; limit?: number },
  ): Promise<QueryLessonsResponse> {
    return this.callWithAuth(this.lessonsClient, "QueryLessons", {
      query,
      project_id: projectId,
      category_filter: opts?.categoryFilter ?? "",
      limit: opts?.limit ?? 10,
    })
  }

  /** Record a resolved issue as a lesson learned. */
  async recordLesson(opts: {
    projectId: string
    category: string
    title: string
    symptom: string
    rootCause: string
    solution: string
    prevention: string
    severity?: string
    tags?: string[]
    filesChanged?: string[]
  }): Promise<RecordLessonResponse> {
    return this.callWithAuth(this.lessonsClient, "RecordLesson", {
      project_id: opts.projectId,
      category: opts.category,
      title: opts.title,
      symptom: opts.symptom,
      root_cause: opts.rootCause,
      solution: opts.solution,
      prevention: opts.prevention,
      severity: opts.severity ?? "medium",
      tags: opts.tags ?? [],
      files_changed: opts.filesChanged ?? [],
    })
  }

  // -------------------------------------------------------------------------
  // Public API Methods — Delegation Service
  // -------------------------------------------------------------------------

  /** Create a new delegation. */
  async createDelegation(opts: {
    companyId: string
    agentId: string
    taskDescription: string
    projectId?: string
    taskId?: string
    context?: string
    engagementId?: string
  }): Promise<CreateDelegationResponse> {
    return this.callWithAuth(this.delegationClient, "CreateDelegation", {
      company_id: opts.companyId,
      agent_id: opts.agentId,
      task_description: opts.taskDescription,
      project_id: opts.projectId ?? "",
      task_id: opts.taskId ?? "",
      context: opts.context ?? "",
      engagement_id: opts.engagementId ?? "",
    })
  }

  /** Get delegation status and progress. */
  async getDelegationStatus(delegationId: string): Promise<DelegationStatusResponse> {
    return this.callWithAuth(this.delegationClient, "GetDelegationStatus", {
      delegation_id: delegationId,
    })
  }

  /** Get full delegation result after completion. */
  async getDelegationResult(delegationId: string): Promise<DelegationResultResponse> {
    return this.callWithAuth(this.delegationClient, "GetDelegationResult", {
      delegation_id: delegationId,
    })
  }

  /** Get brief delegation status (minimal, for polling). */
  async getDelegationStatusBrief(delegationId: string): Promise<DelegationStatusBrief> {
    return this.callWithAuth(this.delegationClient, "GetDelegationStatusBrief", {
      delegation_id: delegationId,
    })
  }

  /** List delegations with optional filters. */
  async listDelegations(opts?: {
    projectId?: string
    agentId?: string
    statusFilter?: string
    limit?: number
    offset?: number
  }): Promise<ListDelegationsResponse> {
    return this.callWithAuth(this.delegationClient, "ListDelegations", {
      project_id: opts?.projectId ?? "",
      agent_id: opts?.agentId ?? "",
      status_filter: opts?.statusFilter ?? "",
      limit: opts?.limit ?? 20,
      offset: opts?.offset ?? 0,
    })
  }

  // -------------------------------------------------------------------------
  // Internal Delegation RPCs (no user_token)
  // -------------------------------------------------------------------------

  /** Update delegation progress (internal server RPC, no user_token). */
  async updateDelegationProgress(
    delegationId: string,
    currentAction: string,
    step: ProgressStep,
  ): Promise<UpdateProgressResponse> {
    return callUnary(this.delegationClient, "UpdateDelegationProgress", {
      delegation_id: delegationId,
      current_action: currentAction,
      step,
    })
  }

  /** Update delegation status with row-level locking (internal server RPC, no user_token). */
  async updateDelegationStatus(
    delegationId: string,
    newStatus: string,
    opts?: {
      resultSummary?: string
      toolsUsed?: string[]
      turns?: number
      costUsd?: number
      errorMessage?: string
    },
  ): Promise<UpdateStatusResponse> {
    return callUnary(this.delegationClient, "UpdateDelegationStatus", {
      delegation_id: delegationId,
      new_status: newStatus,
      result_summary: opts?.resultSummary ?? "",
      tools_used: opts?.toolsUsed ?? [],
      turns: opts?.turns ?? 0,
      cost_usd: opts?.costUsd ?? 0,
      error_message: opts?.errorMessage ?? "",
    })
  }

  /** Mark orphaned delegations as interrupted (internal server RPC, no user_token). */
  async markInterrupted(opts?: { companyId?: string; ownerId?: string }): Promise<MarkInterruptedResponse> {
    return callUnary(this.delegationClient, "MarkInterrupted", {
      company_id: opts?.companyId ?? "",
      owner_id: opts?.ownerId ?? "",
    })
  }

  /** Claim ownership of a delegation (internal server RPC, no user_token). */
  async claimDelegation(delegationId: string, ownerId: string): Promise<ClaimDelegationResponse> {
    return callUnary(this.delegationClient, "ClaimDelegation", {
      delegation_id: delegationId,
      owner_id: ownerId,
    })
  }

  /** Update heartbeat timestamp (internal server RPC, no user_token). */
  async updateHeartbeat(delegationId: string, ownerId: string): Promise<UpdateHeartbeatResponse> {
    return callUnary(this.delegationClient, "UpdateHeartbeat", {
      delegation_id: delegationId,
      owner_id: ownerId,
    })
  }

  // -------------------------------------------------------------------------
  // Public API Methods — Unified Search Service
  // -------------------------------------------------------------------------

  /** Unified search across all LEGION data types. */
  async unifiedSearch(
    query: string,
    projectId?: string,
    opts?: { types?: string[]; limitPerType?: number },
  ): Promise<UnifiedSearchResponse> {
    return this.callWithAuth(this.unifiedSearchClient, "UnifiedSearch", {
      query,
      project_id: projectId ?? "",
      types: opts?.types ?? [],
      limit_per_type: opts?.limitPerType ?? 10,
    })
  }

  // -------------------------------------------------------------------------
  // Conversation Extraction
  // -------------------------------------------------------------------------

  /** Store a structured extraction from a conversation turn. */
  async storeExtraction(opts: {
    engagementId?: string
    sessionId: string
    turnNumber: number
    agentId?: string
    userMessage?: string
    assistantMessage?: string
    extraction: TurnExtractionProto
    timestamp?: string
    taskId?: string
    delegationId?: string
  }): Promise<StoreExtractionResponse> {
    return this.callWithAuth(this.conversationExtractionClient, "StoreExtraction", {
      engagement_id: opts.engagementId ?? "",
      session_id: opts.sessionId,
      turn_number: opts.turnNumber,
      agent_id: opts.agentId ?? "",
      user_message: opts.userMessage ?? "",
      assistant_message: opts.assistantMessage ?? "",
      extraction: opts.extraction,
      timestamp: opts.timestamp ?? new Date().toISOString(),
      task_id: opts.taskId ?? "",
      delegation_id: opts.delegationId ?? "",
    })
  }

  /** Recall context from the graph for given entity names or session. */
  async recallContext(opts: {
    entityNames?: string[]
    engagementId?: string
    projectId?: string
    sessionId?: string
    maxHops?: number
    limit?: number
  }): Promise<RecallContextResponse> {
    return this.callWithAuth(this.conversationExtractionClient, "RecallContext", {
      entity_names: opts.entityNames ?? [],
      engagement_id: opts.engagementId ?? "",
      project_id: opts.projectId ?? "",
      session_id: opts.sessionId ?? "",
      max_hops: opts.maxHops ?? 2,
      limit: opts.limit ?? 20,
    })
  }

  /** Build a session bridge for cross-session continuity. */
  async buildSessionBridge(opts: { engagementId?: string; sessionId: string }): Promise<BuildSessionBridgeResponse> {
    return this.callWithAuth(this.conversationExtractionClient, "BuildSessionBridge", {
      engagement_id: opts.engagementId ?? "",
      session_id: opts.sessionId,
    })
  }

  /** Get user profile (preferences, recent decisions, active topics). */
  async getUserProfile(opts: { projectId?: string; userId?: string }): Promise<GetUserProfileResponse> {
    return this.callWithAuth(this.conversationExtractionClient, "GetUserProfile", {
      project_id: opts.projectId ?? "",
      user_id: opts.userId ?? "",
    })
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** Close all gRPC channels. Call when done. */
  close(): void {
    const clients = [
      this._authClient,
      this._agentSkillClient,
      this._engagementClient,
      this._taskClient,
      this._knowledgeClient,
      this._expertiseClient,
      this._memoryClient,
      this._delegationClient,
      this._codeClient,
      this._lessonsClient,
      this._ingestionClient,
      this._proxyClient,
      this._sessionClient,
      this._conversationExtractionClient,
      this._unifiedSearchClient,
    ]
    for (const client of clients) {
      if (client) {
        try {
          client.close()
        } catch {
          // ignore close errors
        }
      }
    }
  }
}
