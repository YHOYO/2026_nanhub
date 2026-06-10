/**
 * NaN Cloud Image Generation - Prompt Expander
 *
 * This module uses an LLM (via NaN API) to transform simple user prompts
 * into structured, high-density semantic prompts optimized for FLUX.2 [klein] 9B.
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
   * @param {string} options.apiBase - Override API base URL
   * @param {string} options.apiKey - Override API key
   * @returns {Promise<{expandedPrompt: string, structuredData: object|null, model: string, tokens: object}>}
   */
  async expandPrompt(userPrompt, options = {}) {
    const startTime = Date.now();
    const {
      model = nanCloudConfig.promptExpansion.defaultModel,
      mode = 'json',
      apiBase = null,
      apiKey = null,
    } = options;

    // Validate that we have a model and prompt
    if (!userPrompt || typeof userPrompt !== 'string' || userPrompt.trim().length === 0) {
      throw new Error('PROMPT_REQUIRED: El prompt del usuario es requerido para la expansión');
    }

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

    logger.info('Prompt expanded successfully', {
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
      model,
      mode,
      tokens,
      elapsedMs,
    };
  },

  /**
   * Build the user message for the LLM based on mode
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
  async _callLLM({ model, systemPrompt, userMessage, apiBase, apiKey }) {
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
      max_tokens: nanCloudConfig.promptExpansion.maxTokens,
      temperature: nanCloudConfig.promptExpansion.temperature,
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
      signal: AbortSignal.timeout(nanCloudConfig.promptExpansion.timeout),
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
};

export default PromptExpander;
