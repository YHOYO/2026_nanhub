/**
 * NaN Cloud Image Generation - Prompt Expander v2
 *
 * This module uses an LLM (via NaN API) to transform simple user prompts
 * into structured, high-density semantic prompts optimized for FLUX.2 [klein] 9B.
 *
 * Implements a Two-Phase Expansion System:
 *   Phase 1: Analysis - Decomposes user input into structured elements
 *   Phase 2: Expansion - Generates coherent prompt based on analysis
 *
 * Also maintains backward compatibility with the original single-phase mode.
 *
 * Implements the Six-Pillar Structural Framework:
 *   1. Subject (materiality, physical attributes)
 *   2. Action/State (position in frame)
 *   3. Style (aesthetic vehicle)
 *   4. Context (surrounding environment, surface textures)
 *   5. Lighting (photometric precision)
 *   6. Camera (real-world optics emulation)
 */

import nanCloudConfig from './config.js';
import logger from '../utils/logger.js';

const PromptExpander = {
  /**
   * Expand a simple user prompt into a structured FLUX.2-optimized prompt.
   *
   * @param {string} userPrompt - The raw user prompt
   * @param {object} options - Expansion options
   * @param {string} options.model - LLM model to use (default: config default)
   * @param {string} options.mode - 'json' for structured JSON output, 'natural' for natural language
   * @param {boolean} options.twoPhaseMode - Enable two-phase expansion (default: true)
   * @param {string} options.apiBase - Override API base URL
   * @param {string} options.apiKey - Override API key
   * @returns {Promise<{expandedPrompt: string, structuredData: object|null, analysis: object|null, model: string, tokens: object}>}
   */
  async expandPrompt(userPrompt, options = {}) {
    const startTime = Date.now();
    const {
      model = nanCloudConfig.promptExpansion.defaultModel,
      mode = 'json',
      twoPhaseMode = nanCloudConfig.promptExpansion.analysis?.enabled ?? true,
      apiBase = null,
      apiKey = null,
    } = options;

    // Validate that we have a model and prompt
    if (!userPrompt || typeof userPrompt !== 'string' || userPrompt.trim().length === 0) {
      throw new Error('PROMPT_REQUIRED: El prompt del usuario es requerido para la expansión');
    }

    // Two-phase mode (new approach)
    logger.info('[PromptExpander] expandPrompt called', {
      inputLength: userPrompt.trim().length,
      mode,
      twoPhaseMode,
      model,
    });

    if (twoPhaseMode && mode === 'json') {
      try {
        logger.info('[PromptExpander] Starting two-phase prompt expansion', {
          inputLength: userPrompt.trim().length,
        });

        // Phase 1: Analysis
        const analysis = await this.analyzePrompt(userPrompt.trim(), {
          model: options.analysisModel || nanCloudConfig.promptExpansion.analysis?.model,
          apiBase,
          apiKey,
        });

        // Phase 2: Expansion with analysis
        const expansionResult = await this.expandWithAnalysis(userPrompt.trim(), analysis, {
          model: options.expansionModel || nanCloudConfig.promptExpansion.expansion?.model || model,
          apiBase,
          apiKey,
        });

        // Coherence validation
        const coherenceCheck = this.validateCoherence(analysis, expansionResult.structuredData);

        if (!coherenceCheck.valid) {
          logger.warn('Coherence check failed, falling back to simple mode', {
            issues: coherenceCheck.issues,
          });
          return this._expandSimple(userPrompt, options);
        }

        const elapsedMs = Date.now() - startTime;
        const totalTokens = {
          analysis: analysis._tokens || { prompt: 0, completion: 0, total: 0 },
          expansion: expansionResult.tokens || { prompt: 0, completion: 0, total: 0 },
          total: (analysis._tokens?.total || 0) + (expansionResult.tokens?.total || 0),
        };

        logger.info('Two-phase prompt expansion completed', {
          model: expansionResult.model,
          inputLength: userPrompt.length,
          outputLength: expansionResult.expandedPrompt.length,
          elementsFound: analysis.elements?.length || 0,
          conflictsFound: analysis.analysis?.conflicts?.length || 0,
          coherenceScore: coherenceCheck.score,
          elapsedMs,
          tokens: totalTokens,
        });

        return {
          expandedPrompt: expansionResult.expandedPrompt,
          structuredData: expansionResult.structuredData,
          analysis: analysis,
          model: expansionResult.model,
          mode,
          tokens: totalTokens,
          elapsedMs,
          twoPhase: true,
          coherence: coherenceCheck,
        };
      } catch (error) {
        logger.error('[PromptExpander] Two-phase expansion failed, falling back to simple mode', {
          error: error.message,
          stack: error.stack,
        });
        return this._expandSimple(userPrompt, options);
      }
    }

    logger.info('[PromptExpander] Using simple mode (twoPhaseMode=false or mode!=json)', { mode, twoPhaseMode });
    // Simple mode (backward compatibility)
    return this._expandSimple(userPrompt, options);
  },

  /**
   * Phase 1: Analyze user prompt and extract structured elements
   *
   * @param {string} userPrompt - The raw user prompt
   * @param {object} options - Analysis options
   * @returns {Promise<object>} Structured analysis object
   */
  async analyzePrompt(userPrompt, options = {}) {
    const {
      model = nanCloudConfig.promptExpansion.analysis?.model || nanCloudConfig.promptExpansion.defaultModel,
      apiBase = null,
      apiKey = null,
    } = options;

    logger.info('[PromptExpander] analyzePrompt started', {
      model,
      inputLength: userPrompt.length,
    });

    // Build the analysis message
    const userMessage = this._buildAnalysisMessage(userPrompt);

    // Call the LLM with analysis system prompt
    const llmResponse = await this._callLLM({
      model,
      systemPrompt: nanCloudConfig.promptExpansion.analysisSystemPrompt,
      userMessage,
      apiBase,
      apiKey,
      timeout: nanCloudConfig.promptExpansion.analysis?.timeout,
      maxTokens: nanCloudConfig.promptExpansion.analysis?.maxTokens,
      temperature: nanCloudConfig.promptExpansion.analysis?.temperature,
    });

    const rawOutput = llmResponse.content;

    logger.info('[PromptExpander] analyzePrompt LLM response received', {
      rawOutputLength: rawOutput.length,
      rawOutputPreview: rawOutput.substring(0, 300),
      tokens: llmResponse.tokens,
    });

    // Parse the analysis response
    const parsed = this._parseAnalysisResponse(rawOutput);

    // Validate analysis structure
    const validated = this._validateAnalysisStructure(parsed);

    logger.info('[PromptExpander] analyzePrompt completed', {
      elementsCount: validated.elements?.length || 0,
      conflictsCount: validated.analysis?.conflicts?.length || 0,
      dominantStyle: validated.analysis?.dominant_style,
    });

    // Attach tokens for later use
    validated._tokens = llmResponse.tokens;
    validated._model = model;

    return validated;
  },

  /**
   * Phase 2: Expand prompt using analysis from Phase 1
   *
   * @param {string} userPrompt - The original user prompt
   * @param {object} analysis - Analysis from Phase 1
   * @param {object} options - Expansion options
   * @returns {Promise<{expandedPrompt: string, structuredData: object, model: string, tokens: object}>}
   */
  async expandWithAnalysis(userPrompt, analysis, options = {}) {
    const {
      model = nanCloudConfig.promptExpansion.expansion?.model || nanCloudConfig.promptExpansion.defaultModel,
      apiBase = null,
      apiKey = null,
    } = options;

    // Build the expansion message with analysis context
    const userMessage = this._buildExpansionMessage(userPrompt, analysis);

    // Call the LLM with expansion system prompt
    const llmResponse = await this._callLLM({
      model,
      systemPrompt: nanCloudConfig.promptExpansion.expansionSystemPrompt,
      userMessage,
      apiBase,
      apiKey,
      timeout: nanCloudConfig.promptExpansion.expansion?.timeout,
      maxTokens: nanCloudConfig.promptExpansion.expansion?.maxTokens,
      temperature: nanCloudConfig.promptExpansion.expansion?.temperature,
    });

    const rawOutput = llmResponse.content;

    // Parse the expansion response
    const parsed = this._parseResponse(rawOutput, 'json');

    // Validate Six-Pillar structure
    const validated = this._validateStructure(parsed);

    // Build the final prompt string for FLUX.2
    const expandedPrompt = this._buildFinalPrompt(validated, 'json');

    return {
      expandedPrompt,
      structuredData: validated,
      model,
      tokens: llmResponse.tokens,
    };
  },

  /**
   * Validate coherence between analysis and expanded prompt
   *
   * @param {object} analysis - Analysis from Phase 1
   * @param {object} expandedData - Structured data from Phase 2
   * @returns {{valid: boolean, issues: string[], score: number}}
   */
  validateCoherence(analysis, expandedData) {
    const issues = [];
    let score = 1.0;

    if (!analysis || !expandedData) {
      return { valid: false, issues: ['Missing analysis or expanded data'], score: 0 };
    }

    // Check if primary style is represented
    if (analysis.recommendation?.primary_style) {
      const primaryStyle = analysis.recommendation.primary_style.toLowerCase();
      const sceneText = (expandedData.scene || '').toLowerCase();
      const styleText = (expandedData.style || '').toLowerCase();

      if (!sceneText.includes(primaryStyle.split(' ')[0]) && !styleText.includes(primaryStyle.split(' ')[0])) {
        issues.push(`Primary style "${analysis.recommendation.primary_style}" may not be adequately represented`);
        score -= 0.2;
      }
    }

    // Check if lighting recommendation is followed
    if (analysis.recommendation?.lighting) {
      const recommendedLighting = analysis.recommendation.lighting.toLowerCase();
      const actualLighting = (expandedData.lighting || '').toLowerCase();
      
      // Simple keyword matching
      const lightingKeywords = recommendedLighting.split(' ').filter(w => w.length > 4);
      const hasLightingMatch = lightingKeywords.some(kw => actualLighting.includes(kw));
      
      if (!hasLightingMatch && lightingKeywords.length > 0) {
        issues.push('Lighting may not match recommendation');
        score -= 0.1;
      }
    }

    // Check conflict resolution
    if (analysis.analysis?.conflicts?.length > 0) {
      const maxConflicts = nanCloudConfig.promptExpansion.coherence?.maxConflictsAllowed || 3;
      if (analysis.analysis.conflicts.length > maxConflicts) {
        issues.push(`Too many conflicts detected: ${analysis.analysis.conflicts.length} (max: ${maxConflicts})`);
        score -= 0.15;
      }
    }

    // Check if all high-priority elements are represented
    if (analysis.elements && nanCloudConfig.promptExpansion.coherence?.requireAllElements) {
      const highPriorityElements = analysis.elements.filter(e => e.priority <= 2);
      const allText = JSON.stringify(expandedData).toLowerCase();
      
      for (const element of highPriorityElements) {
        const keywords = element.keywords || [];
        const hasRepresentation = keywords.some(kw => allText.includes(kw.toLowerCase()));
        
        if (!hasRepresentation && keywords.length > 0) {
          issues.push(`High-priority element "${element.text}" may not be represented`);
          score -= 0.05;
        }
      }
    }

    // Clamp score between 0 and 1
    score = Math.max(0, Math.min(1, score));

    return {
      valid: issues.length === 0 || score >= 0.6,
      issues,
      score,
    };
  },

  /**
   * Simple mode expansion (backward compatibility)
   */
  async _expandSimple(userPrompt, options = {}) {
    const startTime = Date.now();
    const {
      model = nanCloudConfig.promptExpansion.defaultModel,
      mode = 'json',
      apiBase = null,
      apiKey = null,
    } = options;

    // Build the user message based on mode
    const userMessage = this._buildUserMessage(userPrompt, mode);

    // Call the LLM
    const llmResponse = await this._callLLM({
      model,
      systemPrompt: nanCloudConfig.promptExpansion.systemPrompt,
      userMessage,
      apiBase,
      apiKey,
    });

    const tokens = llmResponse.tokens;
    const rawOutput = llmResponse.content;

    // Parse the LLM response
    const parsed = this._parseResponse(rawOutput, mode);

    // Validate the parsed structure
    const validated = this._validateStructure(parsed);

    // Build the final prompt string for FLUX.2
    const expandedPrompt = this._buildFinalPrompt(validated, mode);

    const elapsedMs = Date.now() - startTime;

    logger.info('Prompt expanded successfully (simple mode)', {
      model,
      mode,
      inputLength: userPrompt.length,
      outputLength: expandedPrompt.length,
      elapsedMs,
      tokens,
    });

    return {
      expandedPrompt,
      structuredData: validated,
      analysis: null,
      model,
      mode,
      tokens,
      elapsedMs,
      twoPhase: false,
    };
  },

  /**
   * Build the analysis message for Phase 1
   */
  _buildAnalysisMessage(userPrompt) {
    return `Analyze the following photographic prompt and extract all structured elements.

User prompt: "${userPrompt}"

Remember:
1. Extract ALL mentioned elements
2. Classify by exact category
3. Identify conflicts and suggest resolutions
4. Output: Valid JSON only with the specified structure`;
  },

  /**
   * Build the expansion message for Phase 2
   */
  _buildExpansionMessage(userPrompt, analysis) {
    // Clean analysis of internal fields
    const cleanAnalysis = {
      elements: analysis.elements,
      analysis: analysis.analysis,
      recommendation: analysis.recommendation,
    };

    return `Generate a detailed prompt for FLUX.2 based on the following analysis.

User original prompt: "${userPrompt}"

Provided analysis:
${JSON.stringify(cleanAnalysis, null, 2)}

Generate a prompt that:
1. Maintains the user's original intent
2. Respects the analysis and recommendations
3. Resolves conflicts coherently
4. Includes all relevant elements
5. Output: Valid JSON only with Six-Pillar structure`;
  },

  /**
   * Build the user message for the LLM based mode (legacy)
   */
  _buildUserMessage(userPrompt, mode) {
    if (mode === 'json') {
      return `Rewrite the following concept into a FLUX.2 [klein] 9B optimized prompt using the Six-Pillar Structural Framework. Output ONLY valid JSON.\n\nUser concept: "${userPrompt}"`;
    }

    // Natural language mode
    return `Rewrite the following concept into a FLUX.2 [klein] 9B optimized prompt using the Six-Pillar Structural Framework. Output a single detailed paragraph of descriptive text (no JSON, no markdown, no explanations). Focus on vivid, affirmative descriptions of subject, lighting, camera, and environment.\n\nUser concept: "${userPrompt}"`;
  },

  /**
   * Call the LLM via NaN API
   */
  async _callLLM({ model, systemPrompt, userMessage, apiBase, apiKey, timeout, maxTokens, temperature }) {
    // Import config lazily to avoid circular dependencies
    const envConfig = await import('../config/environment.js').then(m => m.default);

    const baseUrl = apiBase || envConfig.nanApiBaseUrl;
    const key = apiKey || envConfig.nanApiKey;

    if (!key) {
      throw new Error('NO_API_KEY: No hay API key configurada para el expansor de prompts');
    }

    const url = `${baseUrl}/chat/completions`;

    const requestBody = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: maxTokens || nanCloudConfig.promptExpansion.maxTokens,
      temperature: temperature ?? nanCloudConfig.promptExpansion.temperature,
      stream: false,
    };

    logger.debug('Calling LLM for prompt expansion', { model, url });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(timeout || nanCloudConfig.promptExpansion.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      logger.error('LLM expansion request failed', {
        status: response.status,
        model,
        error: errorText,
      });
      throw new Error(`LLM API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // Extract content from the response
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('LLM returned empty response: no content in choices[0].message.content');
    }

    // Extract token usage
    const tokens = {
      prompt: data.usage?.prompt_tokens || 0,
      completion: data.usage?.completion_tokens || 0,
      total: data.usage?.total_tokens || 0,
    };

    return { content: content.trim(), tokens };
  },

  /**
   * Parse the LLM response into a structured object
   */
  _parseResponse(rawOutput, mode) {
    if (mode === 'natural') {
      // In natural language mode, the output is just a string
      return { _rawText: rawOutput };
    }

    // JSON mode: try to extract and parse JSON
    try {
      // First, try direct parse
      return JSON.parse(rawOutput);
    } catch (e) {
      // If direct parse fails, try to extract JSON from markdown fences or surrounding text
      logger.warn('Direct JSON parse failed, attempting extraction', { error: e.message });

      // Try to extract JSON from markdown code blocks
      const jsonMatch = rawOutput.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1].trim());
        } catch (e2) {
          logger.warn('JSON extraction from code block failed', { error: e2.message });
        }
      }

      // Try to find JSON object boundaries
      const firstBrace = rawOutput.indexOf('{');
      const lastBrace = rawOutput.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        try {
          return JSON.parse(rawOutput.substring(firstBrace, lastBrace + 1));
        } catch (e3) {
          logger.warn('JSON extraction by braces failed', { error: e3.message });
        }
      }

      // If all parsing fails, return the raw text as a fallback
      logger.error('All JSON parsing attempts failed, using raw text', {
        rawOutput: rawOutput.substring(0, 200),
      });
      return { _rawText: rawOutput, _parseError: true };
    }
  },

  /**
   * Parse analysis response (Phase 1)
   */
  _parseAnalysisResponse(rawOutput) {
    try {
      // First, try direct parse
      return JSON.parse(rawOutput);
    } catch (e) {
      logger.warn('Direct JSON parse failed for analysis, attempting extraction', { error: e.message });

      // Try to extract JSON from markdown code blocks
      const jsonMatch = rawOutput.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1].trim());
        } catch (e2) {
          logger.warn('JSON extraction from code block failed for analysis', { error: e2.message });
        }
      }

      // Try to find JSON object boundaries
      const firstBrace = rawOutput.indexOf('{');
      const lastBrace = rawOutput.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        try {
          return JSON.parse(rawOutput.substring(firstBrace, lastBrace + 1));
        } catch (e3) {
          logger.warn('JSON extraction by braces failed for analysis', { error: e3.message });
        }
      }

      // If all parsing fails, throw error
      throw new Error('Failed to parse analysis response as JSON');
    }
  },

  /**
   * Validate analysis structure (Phase 1)
   */
  _validateAnalysisStructure(parsed) {
    // Ensure required top-level keys exist
    if (!parsed.elements || !Array.isArray(parsed.elements)) {
      parsed.elements = [];
    }

    if (!parsed.analysis) {
      parsed.analysis = {
        dominant_style: '',
        conflicts: [],
        resolutions: [],
      };
    }

    if (!parsed.recommendation) {
      parsed.recommendation = {
        primary_style: '',
        secondary_elements: [],
        lighting: '',
        mood: '',
        technical: '',
        avoid: [],
      };
    }

    // Validate each element
    for (let i = 0; i < parsed.elements.length; i++) {
      const element = parsed.elements[i];
      if (!element.text) parsed.elements[i].text = '';
      if (!element.category) parsed.elements[i].category = 'unknown';
      if (!element.priority) parsed.elements[i].priority = 3;
      if (!Array.isArray(element.compatibility)) parsed.elements[i].compatibility = [];
      if (!Array.isArray(element.keywords)) parsed.elements[i].keywords = [];
    }

    // Validate conflicts
    if (parsed.analysis.conflicts && Array.isArray(parsed.analysis.conflicts)) {
      for (let i = 0; i < parsed.analysis.conflicts.length; i++) {
        const conflict = parsed.analysis.conflicts[i];
        if (!conflict.elements) parsed.analysis.conflicts[i].elements = [];
        if (!conflict.type) parsed.analysis.conflicts[i].type = 'unknown';
        if (!conflict.severity) parsed.analysis.conflicts[i].severity = 'medium';
      }
    }

    return parsed;
  },

  /**
   * Validate the parsed structure against the expected schema
   */
  _validateStructure(parsed) {
    // If it's a raw text fallback (natural language or parse error)
    if (parsed._rawText) {
      return parsed;
    }

    // Validate required top-level keys
    const requiredKeys = ['scene', 'subjects', 'style', 'lighting', 'mood', 'background', 'camera'];
    const missingKeys = requiredKeys.filter(key => !(key in parsed));

    if (missingKeys.length > 0) {
      logger.warn('Prompt JSON missing required keys', { missingKeys });
      // Add missing keys with defaults
      for (const key of missingKeys) {
        switch (key) {
          case 'scene':
            parsed.scene = '';
            break;
          case 'subjects':
            parsed.subjects = [];
            break;
          case 'style':
            parsed.style = '';
            break;
          case 'lighting':
            parsed.lighting = '';
            break;
          case 'mood':
            parsed.mood = '';
            break;
          case 'background':
            parsed.background = '';
            break;
          case 'camera':
            parsed.camera = { angle: '', lens: '' };
            break;
        }
      }
    }

    // Validate subjects array
    if (!Array.isArray(parsed.subjects)) {
      parsed.subjects = [];
    }

    // Validate each subject has required fields
    for (let i = 0; i < parsed.subjects.length; i++) {
      const subject = parsed.subjects[i];
      if (!subject.description) {
        parsed.subjects[i].description = '';
      }
      if (!subject.position) {
        parsed.subjects[i].position = '';
      }
      if (!Array.isArray(subject.colors)) {
        parsed.subjects[i].colors = [];
      }
      if (!subject.style) {
        parsed.subjects[i].style = '';
      }

      // Validate HEX colors
      parsed.subjects[i].colors = subject.colors.filter(color => {
        if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
          return true;
        }
        logger.warn('Invalid HEX color in subject, removing', { color, subjectIndex: i });
        return false;
      });
    }

    // Validate camera object
    if (typeof parsed.camera !== 'object' || parsed.camera === null) {
      parsed.camera = { angle: '', lens: '' };
    }
    if (!parsed.camera.angle) parsed.camera.angle = '';
    if (!parsed.camera.lens) parsed.camera.lens = '';

    return parsed;
  },

  /**
   * Build the final prompt string for FLUX.2 from structured data
   */
  _buildFinalPrompt(validated, mode) {
    // If it's raw text (natural language mode or fallback), return as-is
    if (validated._rawText) {
      return validated._rawText;
    }

    // Build a comprehensive natural language prompt from the JSON structure
    const parts = [];

    // Scene
    if (validated.scene) {
      parts.push(validated.scene);
    }

    // Subjects
    if (validated.subjects && validated.subjects.length > 0) {
      for (const subject of validated.subjects) {
        let subjectStr = subject.description || '';

        if (subject.position) {
          subjectStr += `. Positioned ${subject.position}`;
        }

        if (subject.colors && subject.colors.length > 0) {
          subjectStr += `. Colors: ${subject.colors.join(', ')}`;
        }

        if (subject.style) {
          subjectStr += `. Style details: ${subject.style}`;
        }

        parts.push(subjectStr);
      }
    }

    // Style
    if (validated.style) {
      parts.push(`Style: ${validated.style}`);
    }

    // Lighting
    if (validated.lighting) {
      parts.push(`Lighting: ${validated.lighting}`);
    }

    // Mood
    if (validated.mood) {
      parts.push(`Mood: ${validated.mood}`);
    }

    // Background
    if (validated.background) {
      parts.push(`Background: ${validated.background}`);
    }

    // Camera
    if (validated.camera) {
      const cameraParts = [];
      if (validated.camera.angle) cameraParts.push(validated.camera.angle);
      if (validated.camera.lens) cameraParts.push(validated.camera.lens);
      if (cameraParts.length > 0) {
        parts.push(`Camera: ${cameraParts.join('. ')}`);
      }
    }

    return parts.join('. ');
  },

  /**
   * Check if prompt expansion is available (LLM is reachable)
   */
  async healthCheck() {
    try {
      const result = await this.expandPrompt('A simple test', {
        mode: 'natural',
        twoPhaseMode: false,
      });
      return {
        available: true,
        model: result.model,
        elapsedMs: result.elapsedMs,
      };
    } catch (error) {
      return {
        available: false,
        error: error.message,
      };
    }
  },

  /**
   * Check if two-phase expansion is available
   */
  async twoPhaseHealthCheck() {
    try {
      const analysis = await this.analyzePrompt('A simple portrait photograph');
      return {
        available: true,
        model: analysis._model,
        elementsFound: analysis.elements?.length || 0,
      };
    } catch (error) {
      return {
        available: false,
        error: error.message,
      };
    }
  },
};

export default PromptExpander;
