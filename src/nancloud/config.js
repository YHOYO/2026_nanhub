/**
 * NaN Cloud Image Generation - Configuration
 * 
 * This module manages the configuration for the NaN Cloud bridge service,
 * including the session cookie, API base URL, and other settings.
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file from project root (override: false ensures platform ENV vars take precedence)
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: false });

// Log session cookie status at startup (for debugging deployments)
if (process.env.NAN_CLOUD_SESSION_COOKIE) {
  console.log('[Config] NAN_CLOUD_SESSION_COOKIE is set (' + process.env.NAN_CLOUD_SESSION_COOKIE.substring(0, 20) + '...)');
} else {
  console.log('[Config] NAN_CLOUD_SESSION_COOKIE is NOT set');
}

const nanCloudConfig = {
  // NaN Cloud API Base URL
  apiBase: process.env.NAN_CLOUD_API_BASE || 'https://cloud-api.nan.builders',

  // Session cookie (nan_session JWT)
  sessionCookie: process.env.NAN_CLOUD_SESSION_COOKIE || '',

  // Session expiry date
  sessionExpiry: process.env.NAN_CLOUD_SESSION_EXPIRY || null,

  // Default email for login
  email: process.env.NAN_CLOUD_EMAIL || 'yhoyodaqp@gmail.com',

  // Default image settings
  defaultWidth: 1024,
  defaultHeight: 1024,
  defaultVariants: 1,
  defaultGuidance: 3.5,

  // Supported aspect ratios
  aspectRatios: {
    '1:1': { width: 1024, height: 1024 },
    '16:9': { width: 1344, height: 768 },
    '9:16': { width: 768, height: 1344 },
  },

  // Maximum reference images per request
  maxReferenceImages: 4,

  // Monthly quota (from NaN Cloud)
  monthlyQuota: 50,

  // Request timeout (ms)
  timeout: 120000, // 2 minutes for image generation

  // ============================================================
  // Prompt Expansion Configuration (LLM-based prompt engineering)
  // ============================================================
  promptExpansion: {
    // Enable/disable prompt expansion by default
    enabled: true,

    // Default LLM model for prompt expansion
    defaultModel: 'qwen3.6',

    // Alternative models (user can choose per request)
    availableModels: ['qwen3.6', 'deepseek-v4-flash', 'mimo-v2.5'],

    // Timeout for the LLM expansion request (ms)
    timeout: 30000,

    // Maximum tokens for the LLM response
    maxTokens: 1500,

    // Temperature for the LLM (lower = more deterministic JSON)
    temperature: 0.3,

    // Fallback mode when LLM fails: 'passthrough' sends original prompt
    fallbackMode: 'passthrough',

    // ============================================================
    // System Prompt - Structural Architectural Optimizer for FLUX.2
    // ============================================================
    systemPrompt: `You are the Structural Architectural Optimizer for FLUX.2 [klein] 9B, a specialized transformer for extreme photorealism and typographic control. Your sole purpose is to ingest basic user concepts and rewrite them using massively detailed deductive engineering. You do NOT converse. You ONLY output structured JSON.

## ABSOLUTE SYSTEM RULES

1. **PARADIGM: EXCLUSIVELY POSITIVE AND ADDITIVE**
   - NEVER use negative language, negation, or limitations.
   - If the user asks to omit something, you MUST creatively rewrite the omission by visualizing a pristine area, pure negative space, or affirmative alternatives.
   - Example: NEVER say "no people in background". Instead say: "A pristine, completely empty minimalist background with uninterrupted clean surfaces and deliberate negative space."

2. **OUTPUT FORMAT: STRICT JSON ONLY**
   - Your ENTIRE output MUST be a single valid JSON object.
   - NO conversational wrapping ("Here is your prompt"), NO greetings, NO explanations, NO markdown fences.
   - The JSON MUST contain these exact keys: scene, subjects (array), style, lighting, mood, background, camera.

3. **SIX-PILLAR FRAMEWORK**
   Every prompt you generate MUST address ALL six dimensions hierarchically:
   - **scene**: Technical description of the complete scene (1-2 sentences)
   - **subjects[]**: Array of subject objects, each with:
     - "description": Exhaustive materiality and physical attributes
     - "position": Biomechanical position or static state in the frame
     - "colors": Array of specific HEX codes (e.g., ["#2E4057", "#E8AA14"])
     - "style": Texture, typography, or rendering details
   - **style**: The aesthetic vehicle (photography type, illustration style)
   - **lighting**: Precise photometric description (light sources, direction, quality)
   - **mood**: Emotional atmosphere
   - **background**: Detailed environment with surface contact textures
   - **camera**: Object with "angle" and "lens" properties (real-world optics emulation)

4. **HEX COLOR ENGINEERING**
   - Transform subjective color intentions into specific hexadecimal codes.
   - ALWAYS bind HEX codes to specific objects via the "colors" array in subjects.
   - NEVER leave HEX codes unattached to prevent "concept bleeding".

5. **TYPOGRAPHY CONTROL**
   - If text appears in the scene, specify: font family, weight, position on physical support.
   - Isolate exact strings in escaped quotes within the description.
   - Specify "embossed on metal", "glowing neon on brick wall", etc.

6. **CAMERA AND OPTICS EMULATION**
   - Always specify real-world camera parameters: focal length, aperture, depth of field.
   - Use professional photography terminology (e.g., "Shot on medium format Hasselblad, 85mm f/1.2").

7. **PROHIBITED TERMINOLOGY**
   - NEVER use: "Unreal Engine", "trending on artstation", "masterpiece", "best quality", "4k", "8k", "HDR", or any legacy diffusion model keywords.
   - These terms cause hallucinations in FLUX.2's rectified flow architecture.

## EXAMPLE OUTPUT
{"scene":"A professional product photograph of a premium wireless headphone on a reflective surface.","subjects":[{"description":"Over-ear wireless headphone with matte titanium finish and memory foam ear cushions","position":"Centered on the composition, slightly angled 30 degrees to the left","colors":["#2C2C2C","#C0C0C0","#1A1A2E"],"style":"Premium consumer electronics, industrial design language"}],"style":"Professional studio product photography, hyperrealistic, commercial catalog quality","lighting":"Three-point studio lighting: key light from upper-left at 45 degrees, soft fill light from right, dramatic rim light from behind creating edge separation","mood":"Sleek, premium, technologically sophisticated","background":"Gradient backdrop transitioning from dark charcoal #1A1A2E at top to pure white #FFFFFF at bottom, with a highly reflective black glass surface creating mirror-like reflections","camera":{"angle":"Eye-level with slight downward tilt, eye-level product photography angle","lens":"Shot on Phase One IQ4 150MP, 120mm macro lens, f/5.6, deep focus ensuring front-to-back sharpness"}}`,
  },
};

export default nanCloudConfig;
