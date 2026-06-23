import config from '../config/environment.js';
import logger from '../utils/logger.js';

/**
 * Time Quantizer Module
 * 
 * Intercepts dynamic timestamps from Roo Code messages and replaces them
 * with quantized timestamps (frozen in configurable time blocks).
 * This stabilizes the LLM cache, increasing cache hit rates to ~95%.
 * 
 * Default: 4-hour blocks [0-4, 4-8, 8-12, 12-16, 16-20, 20-24]
 */

// Regex to detect Roo Code's dynamic timestamp format
// Matches: "Current time is Tuesday, June 23, 2026 at 02:32 PM"
// Also matches variations with or without "(Quantized for Cache)" suffix
const TIMESTAMP_PATTERN = /Current time is \w+, \w+ \d+, \d{4} at \d{2}:\d{2} (?:AM|PM)(?: \(Quantized for Cache\))?/g;

// Full timestamp pattern for replacement (includes the quantized suffix)
const FULL_TIMESTAMP_PATTERN = /Current time is \w+, \w+ \d+, \d{4} at \d{2}:\d{2} (?:AM|PM)(?: \(Quantized for Cache\))?/g;

/**
 * Get the quantized timestamp string for a given date
 * @param {Date} dt - The date to quantize
 * @param {number} blockSize - Block size in hours (default from config)
 * @returns {string} Quantized timestamp string
 */
function getQuantizedTimestamp(dt, blockSize) {
  blockSize = blockSize || config.quantizeBlockSize || 4;
  
  const hour = Math.floor(dt.getHours() / blockSize) * blockSize;
  const quantized = new Date(dt);
  quantized.setHours(hour, 0, 0, 0);
  
  // Format: "Tuesday, June 23, 2026 at 12:00 PM"
  const options = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  };
  
  return quantized.toLocaleString('en-US', options);
}

/**
 * Quantize the current time and return the frozen timestamp string
 * @param {number} blockSize - Block size in hours (default from config)
 * @returns {string} Quantized timestamp string
 */
function quantizeCurrentTime(blockSize) {
  const now = new Date();
  return getQuantizedTimestamp(now, blockSize);
}

/**
 * Sanitize messages by replacing dynamic timestamps with quantized ones
 * @param {Array} messages - The messages array from the request
 * @param {string} quantizedTime - The pre-quantized timestamp to use
 * @returns {Array} Sanitized messages array
 */
function sanitizeMessages(messages, quantizedTime) {
  if (!Array.isArray(messages)) {
    return messages;
  }
  
  const sanitized = messages.map(msg => {
    if (!msg || typeof msg !== 'object') {
      return msg;
    }
    
    const content = msg.content;
    
    if (typeof content === 'string') {
      // Replace dynamic timestamp with quantized one
      const newContent = content.replace(FULL_TIMESTAMP_PATTERN, quantizedTime);
      if (newContent !== content) {
        logger.proxy('[TimeQuantizer] Replaced timestamp in string message', {
          original: content.substring(0, 80) + '...',
          quantized: quantizedTime,
        });
      }
      return { ...msg, content: newContent };
    }
    
    if (Array.isArray(content)) {
      // Handle multimodal content (text + images)
      const newContent = content.map(block => {
        if (block && block.type === 'text' && typeof block.text === 'string') {
          const newText = block.text.replace(FULL_TIMESTAMP_PATTERN, quantizedTime);
          if (newText !== block.text) {
            logger.proxy('[TimeQuantizer] Replaced timestamp in multimodal block', {
              quantized: quantizedTime,
            });
          }
          return { ...block, text: newText };
        }
        return block;
      });
      return { ...msg, content: newContent };
    }
    
    return msg;
  });
  
  return sanitized;
}

/**
 * Extract the original timestamp from messages (for audit/debugging)
 * @param {Array} messages - The messages array from the request
 * @returns {string|null} The original timestamp string, or null if not found
 */
function extractOriginalTimestamp(messages) {
  if (!Array.isArray(messages)) {
    return null;
  }
  
  for (const msg of messages) {
    if (!msg || typeof msg !== 'object') continue;
    
    const content = msg.content;
    
    if (typeof content === 'string') {
      const match = content.match(TIMESTAMP_PATTERN);
      if (match) {
        return match[0];
      }
    }
    
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block && block.type === 'text' && typeof block.text === 'string') {
          const match = block.text.match(TIMESTAMP_PATTERN);
          if (match) {
            return match[0];
          }
        }
      }
    }
  }
  
  return null;
}

/**
 * Get the quantization block identifier string
 * @param {Date} dt - The date to get the block for
 * @param {number} blockSize - Block size in hours
 * @returns {string} Block identifier (e.g., "2026-06-23/12-16")
 */
function getQuantizationBlock(dt, blockSize) {
  blockSize = blockSize || config.quantizeBlockSize || 4;
  const hour = Math.floor(dt.getHours() / blockSize) * blockSize;
  const nextHour = hour + blockSize;
  
  const dateStr = dt.toISOString().split('T')[0];
  return `${dateStr}/${hour.toString().padStart(2, '0')}-${nextHour.toString().padStart(2, '0')}`;
}

/**
 * Estimate token count from text
 * Uses a simple heuristic: ~1.3 tokens per word
 * @param {string} text - The text to estimate tokens for
 * @returns {number} Estimated token count
 */
function estimateTokens(text) {
  if (!text || typeof text !== 'string') {
    return 0;
  }
  
  // Split by whitespace and apply correction factor
  const wordCount = text.trim().split(/\s+/).filter(w => w.length > 0).length;
  return Math.ceil(wordCount * 1.3);
}

/**
 * Estimate total tokens in a messages array
 * @param {Array} messages - The messages array
 * @returns {number} Estimated total tokens
 */
function estimateMessageTokens(messages) {
  if (!Array.isArray(messages)) {
    return 0;
  }
  
  let totalTokens = 0;
  
  for (const msg of messages) {
    if (!msg || typeof msg !== 'object') continue;
    
    const content = msg.content;
    
    if (typeof content === 'string') {
      totalTokens += estimateTokens(content);
    }
    
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block && block.type === 'text' && typeof block.text === 'string') {
          totalTokens += estimateTokens(block.text);
        }
      }
    }
  }
  
  return totalTokens;
}

/**
 * Detect if a response was likely a cache hit
 * Uses response time comparison against historical averages
 * @param {number} responseTimeMs - Current response time in milliseconds
 * @param {number} avgResponseTimeMs - Average response time for similar requests
 * @param {number} threshold - Ratio threshold (default 0.6 = 60% of avg)
 * @returns {object} Detection result with hit status and confidence
 */
function detectCacheHit(responseTimeMs, avgResponseTimeMs, threshold) {
  threshold = threshold || 0.6;
  
  if (!avgResponseTimeMs || avgResponseTimeMs <= 0) {
    return { hit: false, confidence: 0, reason: 'no_baseline' };
  }
  
  const ratio = responseTimeMs / avgResponseTimeMs;
  
  if (ratio < 0.4) {
    return { hit: true, confidence: 1 - ratio, reason: 'very_fast_response' };
  } else if (ratio < 0.6) {
    return { hit: true, confidence: 1 - ratio, reason: 'fast_response' };
  } else if (ratio < 0.8) {
    return { hit: true, confidence: 0.5, reason: 'moderately_fast' };
  }
  
  return { hit: false, confidence: 0, reason: 'normal_response' };
}

/**
 * Process a chat completion request: sanitize messages and return metadata
 * @param {object} requestBody - The request body from the client
 * @returns {object} Processed request with metadata
 */
function processRequest(requestBody) {
  if (!config.quantizeEnabled) {
    return {
      requestBody,
      metadata: {
        quantizationApplied: false,
        reason: 'disabled',
      },
    };
  }
  
  const blockSize = config.quantizeBlockSize || 4;
  const now = new Date();
  const quantizedTime = getQuantizedTimestamp(now, blockSize);
  const quantizationBlock = getQuantizationBlock(now, blockSize);
  
  // Extract original timestamp for audit
  const originalTimestamp = requestBody?.messages 
    ? extractOriginalTimestamp(requestBody.messages) 
    : null;
  
  // Estimate tokens before sanitization
  const tokensBefore = requestBody?.messages 
    ? estimateMessageTokens(requestBody.messages) 
    : 0;
  
  // Sanitize messages
  const sanitizedMessages = requestBody?.messages
    ? sanitizeMessages(requestBody.messages, quantizedTime)
    : requestBody?.messages;
  
  // Estimate tokens after sanitization (should be similar)
  const tokensAfter = sanitizedMessages
    ? estimateMessageTokens(sanitizedMessages)
    : 0;
  
  const processedBody = {
    ...requestBody,
    messages: sanitizedMessages,
  };
  
  const metadata = {
    quantizationApplied: true,
    quantizationBlock,
    originalTimestamp,
    quantizedTimestamp: quantizedTime,
    tokensBefore,
    tokensAfter,
    timestampReplaced: !!originalTimestamp,
  };
  
  logger.proxy('[TimeQuantizer] Request processed', metadata);
  
  return {
    requestBody: processedBody,
    metadata,
  };
}

export default {
  quantizeCurrentTime,
  getQuantizedTimestamp,
  sanitizeMessages,
  extractOriginalTimestamp,
  getQuantizationBlock,
  estimateTokens,
  estimateMessageTokens,
  detectCacheHit,
  processRequest,
};
