import config from '../config/environment.js';
import logger from '../utils/logger.js';

/**
 * Context Compressor - Phase 0-5
 * 
 * Intercepts messages[] from chat completion requests and compresses them
 * before forwarding to the NaN Inference API.
 * 
 * Phase 0: Passthrough (metrics only, no compression)
 * Phase 1: Sliding window + summary of old messages
 * Phase 2: Semantic retrieval of relevant history
 * Phase 3: RAG over codebase + semantic
 * Phase 4: Hybrid (persistent summary + domain RAG)
 * Phase 5: Smart (dynamic strategy based on query type)
 */
class ContextCompressor {
  constructor() {
    this.currentPhase = config.phase || 0;
    this.stats = {
      totalRequests: 0,
      totalOriginalTokens: 0,
      totalCompressedTokens: 0,
      phaseUsage: {},
    };
    // In-memory summary cache (keyed by conversation hash or session)
    this.summaryCache = new Map();
    // In-memory RAG index (file chunks)
    this.ragIndex = new Map();
  }

  /**
   * Get the current active phase
   */
  getPhase() {
    return this.currentPhase;
  }

  /**
   * Set the active phase dynamically
   */
  setPhase(phase) {
    if (phase < 0 || phase > 5) {
      logger.warn('Invalid phase, must be 0-5', { phase });
      return false;
    }
    this.currentPhase = phase;
    logger.info('Compression phase changed', { phase });
    return true;
  }

  /**
   * Get compression statistics
   */
  getStats() {
    const savedTokens = this.stats.totalOriginalTokens - this.stats.totalCompressedTokens;
    const savingsPercent = this.stats.totalOriginalTokens > 0
      ? ((savedTokens / this.stats.totalOriginalTokens) * 100).toFixed(2)
      : 0;

    return {
      currentPhase: this.currentPhase,
      totalRequests: this.stats.totalRequests,
      totalOriginalTokens: this.stats.totalOriginalTokens,
      totalCompressedTokens: this.stats.totalCompressedTokens,
      savedTokens,
      savingsPercent: parseFloat(savingsPercent),
      phaseUsage: { ...this.stats.phaseUsage },
      ragIndexedFiles: this.ragIndex.size,
    };
  }

  /**
   * Estimate token count (rough: 1 token ≈ 4 chars for English, ~2 chars for CJK)
   */
  estimateTokens(text) {
    if (!text) return 0;
    if (typeof text === 'object') text = JSON.stringify(text);
    return Math.ceil(text.length / 4);
  }

  /**
   * Count tokens in a messages array
   */
  countMessagesTokens(messages) {
    if (!Array.isArray(messages)) return 0;
    return messages.reduce((total, msg) => {
      const contentTokens = this.estimateTokens(msg.content);
      const roleTokens = this.estimateTokens(msg.role);
      return total + contentTokens + roleTokens + 4; // +4 for formatting overhead
    }, 0);
  }

  /**
   * Main compression entry point
   * Receives the request body, compresses messages if needed, returns modified body
   */
  async compress(reqBody) {
    this.stats.totalRequests++;

    // Track phase usage
    const phaseKey = `phase_${this.currentPhase}`;
    this.stats.phaseUsage[phaseKey] = (this.stats.phaseUsage[phaseKey] || 0) + 1;

    // If no messages or not a chat completion, pass through
    if (!reqBody || !reqBody.messages || !Array.isArray(reqBody.messages)) {
      return reqBody;
    }

    const originalTokens = this.countMessagesTokens(reqBody.messages);
    this.stats.totalOriginalTokens += originalTokens;

    let compressedBody;

    switch (this.currentPhase) {
      case 0:
        // Passthrough - no compression, just metrics
        compressedBody = reqBody;
        break;

      case 1:
        compressedBody = await this.phase1SlidingWindow(reqBody, originalTokens);
        break;

      case 2:
        compressedBody = await this.phase2SemanticRetrieval(reqBody, originalTokens);
        break;

      case 3:
        compressedBody = await this.phase3RAG(reqBody, originalTokens);
        break;

      case 4:
        compressedBody = await this.phase4Hybrid(reqBody, originalTokens);
        break;

      case 5:
        compressedBody = await this.phase5Smart(reqBody, originalTokens);
        break;

      default:
        compressedBody = reqBody;
    }

    const compressedTokens = this.countMessagesTokens(compressedBody.messages);
    this.stats.totalCompressedTokens += compressedTokens;

    const saved = originalTokens - compressedTokens;
    if (saved > 0) {
      logger.info('Context compressed', {
        phase: this.currentPhase,
        originalTokens,
        compressedTokens,
        saved,
        percentSaved: ((saved / originalTokens) * 100).toFixed(1) + '%',
      });
    }

    return compressedBody;
  }

  /**
   * Phase 1: Sliding Window + Summary
   * Keeps the last N messages intact, summarizes older ones into a single message
   */
  async phase1SlidingWindow(reqBody, originalTokens) {
    const messages = [...reqBody.messages];
    
    // Keep system message(s) separate
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');
    
    // If few messages, no compression needed
    if (nonSystemMessages.length <= 6) {
      return reqBody;
    }

    // Keep last 4 messages intact (recent context)
    const recentMessages = nonSystemMessages.slice(-4);
    const oldMessages = nonSystemMessages.slice(0, -4);

    // Create summary of old messages
    const summary = this._createSummary(oldMessages);

    // Build compressed body
    const compressedMessages = [
      ...systemMessages,
      { role: 'system', content: `[Context Summary of ${oldMessages.length} earlier messages]: ${summary}` },
      ...recentMessages,
    ];

    return {
      ...reqBody,
      messages: compressedMessages,
    };
  }

  /**
   * Phase 2: Semantic Retrieval
   * Similar to Phase 1 but also considers semantic relevance of old messages
   */
  async phase2SemanticRetrieval(reqBody, originalTokens) {
    const messages = [...reqBody.messages];
    
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');
    
    if (nonSystemMessages.length <= 6) {
      return reqBody;
    }

    // Get the latest user message for context relevance
    const lastUserMsg = nonSystemMessages.filter(m => m.role === 'user').pop();
    
    const recentMessages = nonSystemMessages.slice(-4);
    const oldMessages = nonSystemMessages.slice(0, -4);

    // Score old messages by relevance to current query
    const scored = oldMessages.map(msg => ({
      ...msg,
      relevance: this._scoreRelevance(msg.content, lastUserMsg?.content || ''),
    }));

    // Keep top most relevant old messages (up to 3)
    const relevantOld = scored
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 3)
      .sort((a, b) => {
        // Restore original order
        const idxA = oldMessages.findIndex(m => m === a);
        const idxB = oldMessages.findIndex(m => m === b);
        return idxA - idxB;
      });

    const summary = this._createSummary(relevantOld);

    const compressedMessages = [
      ...systemMessages,
      { role: 'system', content: `[Relevant Context from ${oldMessages.length} earlier messages]: ${summary}` },
      ...recentMessages,
    ];

    return {
      ...reqBody,
      messages: compressedMessages,
    };
  }

  /**
   * Phase 3: RAG over Codebase
   * Uses the indexed codebase to provide relevant context
   */
  async phase3RAG(reqBody, originalTokens) {
    const messages = [...reqBody.messages];
    
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');
    
    if (nonSystemMessages.length <= 6) {
      return reqBody;
    }

    // Get the latest user message for RAG search
    const lastUserMsg = nonSystemMessages.filter(m => m.role === 'user').pop();
    
    const recentMessages = nonSystemMessages.slice(-4);
    const oldMessages = nonSystemMessages.slice(0, -4);

    // Search RAG index for relevant code
    let ragContext = '';
    if (lastUserMsg && this.ragIndex.size > 0) {
      const searchResults = this._searchRAG(lastUserMsg.content);
      if (searchResults.length > 0) {
        ragContext = '\n[Relevant Codebase Context]:\n' + 
          searchResults.map(r => `--- ${r.filePath} ---\n${r.content}`).join('\n\n');
      }
    }

    // Also create summary of old messages
    const summary = this._createSummary(oldMessages);

    const systemContent = `[Context Summary of ${oldMessages.length} earlier messages]: ${summary}`;
    const ragMsg = ragContext ? [{ role: 'system', content: ragContext }] : [];

    const compressedMessages = [
      ...systemMessages,
      { role: 'system', content: systemContent },
      ...ragMsg,
      ...recentMessages,
    ];

    return {
      ...reqBody,
      messages: compressedMessages,
    };
  }

  /**
   * Phase 4: Hybrid (Persistent Summary + Domain RAG)
   * Combines sliding window summary with domain-specific RAG
   */
  async phase4Hybrid(reqBody, originalTokens) {
    const messages = [...reqBody.messages];
    
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');
    
    if (nonSystemMessages.length <= 6) {
      return reqBody;
    }

    const lastUserMsg = nonSystemMessages.filter(m => m.role === 'user').pop();
    const recentMessages = nonSystemMessages.slice(-4);
    const oldMessages = nonSystemMessages.slice(0, -4);

    // Persistent summary (accumulated across requests)
    const conversationId = this._getConversationId(reqBody);
    const persistentSummary = this._getPersistentSummary(conversationId, oldMessages);

    // Domain RAG
    let domainRAG = '';
    if (lastUserMsg && this.ragIndex.size > 0) {
      const results = this._searchRAG(lastUserMsg.content);
      if (results.length > 0) {
        domainRAG = '\n[Domain Code Context]:\n' +
          results.map(r => `--- ${r.filePath} ---\n${r.content}`).join('\n\n');
      }
    }

    const systemParts = [];
    if (persistentSummary) {
      systemParts.push({ role: 'system', content: `[Persistent Summary]: ${persistentSummary}` });
    }
    if (domainRAG) {
      systemParts.push({ role: 'system', content: domainRAG });
    }

    const compressedMessages = [
      ...systemMessages,
      ...systemParts,
      ...recentMessages,
    ];

    return {
      ...reqBody,
      messages: compressedMessages,
    };
  }

  /**
   * Phase 5: Smart (Dynamic Strategy)
   * Analyzes the query type and picks the best compression strategy
   */
  async phase5Smart(reqBody, originalTokens) {
    const messages = [...reqBody.messages];
    
    const systemMessages = messages.filter(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');
    
    if (nonSystemMessages.length <= 4) {
      return reqBody;
    }

    const lastUserMsg = nonSystemMessages.filter(m => m.role === 'user').pop();
    const query = lastUserMsg?.content || '';

    // Detect query type
    const queryType = this._detectQueryType(query);
    
    logger.info('Smart phase: detected query type', { queryType, messageCount: nonSystemMessages.length });

    switch (queryType) {
      case 'code_review':
      case 'bug_fix':
        // Need full code context, use RAG-heavy approach
        return this.phase4Hybrid(reqBody, originalTokens);

      case 'explanation':
      case 'summary':
        // Light compression, keep most context
        return this.phase1SlidingWindow(reqBody, originalTokens);

      case 'new_feature':
      case 'refactor':
        // Need codebase context + recent conversation
        return this.phase3RAG(reqBody, originalTokens);

      default:
        // Default to semantic retrieval
        return this.phase2SemanticRetrieval(reqBody, originalTokens);
    }
  }

  // ========== Helper Methods ==========

  /**
   * Create a summary of messages (extractive)
   */
  _createSummary(messages) {
    if (!messages || messages.length === 0) return 'No previous context.';

    const parts = messages.map(msg => {
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      // Truncate each message to key points
      const truncated = content.length > 200 ? content.substring(0, 200) + '...' : content;
      return `${msg.role}: ${truncated}`;
    });

    return parts.join(' | ');
  }

  /**
   * Score relevance between two texts (simple keyword overlap)
   */
  _scoreRelevance(text, query) {
    if (!text || !query) return 0;
    
    const textLower = text.toLowerCase();
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    
    if (queryWords.length === 0) return 0;
    
    let matches = 0;
    for (const word of queryWords) {
      if (textLower.includes(word)) matches++;
    }
    
    return matches / queryWords.length;
  }

  /**
   * Get conversation ID from request body for persistent summary
   */
  _getConversationId(reqBody) {
    // Use a hash of the first few messages as conversation ID
    const key = JSON.stringify(reqBody.messages?.slice(0, 3) || []);
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return `conv_${Math.abs(hash).toString(36)}`;
  }

  /**
   * Get or create persistent summary for a conversation
   */
  _getPersistentSummary(conversationId, oldMessages) {
    const existing = this.summaryCache.get(conversationId) || '';
    const newSummary = this._createSummary(oldMessages);
    
    // Combine existing with new
    const combined = existing ? `${existing} | ${newSummary}` : newSummary;
    
    // Store (with size limit)
    if (combined.length > 2000) {
      this.summaryCache.set(conversationId, combined.substring(combined.length - 1500));
    } else {
      this.summaryCache.set(conversationId, combined);
    }
    
    return this.summaryCache.get(conversationId);
  }

  /**
   * Detect query type from user message
   */
  _detectQueryType(query) {
    const q = query.toLowerCase();

    if (q.includes('error') || q.includes('bug') || q.includes('fix') || q.includes('no funciona') || q.includes('arregla')) {
      return 'bug_fix';
    }
    if (q.includes('review') || q.includes('revisa') || q.includes('analiza') || q.includes('code review')) {
      return 'code_review';
    }
    if (q.includes('explica') || q.includes('explain') || q.includes('qué hace') || q.includes('cómo funciona')) {
      return 'explanation';
    }
    if (q.includes('resume') || q.includes('summary') || q.includes('resumen')) {
      return 'summary';
    }
    if (q.includes('crea') || q.includes('create') || q.includes('nueva') || q.includes('new feature') || q.includes('agrega')) {
      return 'new_feature';
    }
    if (q.includes('refactor') || q.includes('refactoriza') || q.includes('mejora')) {
      return 'refactor';
    }

    return 'general';
  }

  /**
   * Add a file to the RAG index
   */
  addFileToIndex(filePath, content, metadata = {}) {
    // Split into chunks of ~500 chars
    const chunkSize = 500;
    const chunks = [];
    
    for (let i = 0; i < content.length; i += chunkSize) {
      chunks.push({
        filePath,
        content: content.substring(i, i + chunkSize),
        chunkIndex: Math.floor(i / chunkSize),
        ...metadata,
      });
    }

    this.ragIndex.set(filePath, chunks);
    logger.info('File indexed for RAG', { filePath, chunks: chunks.length });
  }

  /**
   * Remove a file from the RAG index
   */
  removeFileFromIndex(filePath) {
    return this.ragIndex.delete(filePath);
  }

  /**
   * Get RAG index status
   */
  getIndexStatus() {
    const files = [];
    let totalChunks = 0;

    for (const [filePath, chunks] of this.ragIndex) {
      files.push({
        filePath,
        chunks: chunks.length,
      });
      totalChunks += chunks.length;
    }

    return {
      totalFiles: this.ragIndex.size,
      totalChunks,
      files,
    };
  }

  /**
   * Search RAG index for relevant chunks
   */
  _searchRAG(query, maxResults = 3) {
    const results = [];

    for (const [, chunks] of this.ragIndex) {
      for (const chunk of chunks) {
        const relevance = this._scoreRelevance(chunk.content, query);
        if (relevance > 0.1) {
          results.push({ ...chunk, relevance });
        }
      }
    }

    return results
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, maxResults);
  }

  /**
   * Search RAG endpoint handler
   */
  searchIndex(query, maxResults = 5) {
    return this._searchRAG(query, maxResults);
  }
}

// Singleton instance
const compressor = new ContextCompressor();

export default compressor;
