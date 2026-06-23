"""
Roo Code Cache Optimizer Proxy (NaN Builders)
==============================================
Versión mejorada con:
- Time quantization en bloques configurables
- Detección de cache hits
- Métricas expuestas como headers
- Streaming y non-streaming support
- Health check con estadísticas
- Logging estructurado
- Graceful shutdown

Uso:
    python optimizer_proxy.py
    
Variables de entorno:
    UPSTREAM_URL      - URL del upstream (default: https://api.nan.builders/v1)
    PORT              - Puerto del proxy (default: 8081)
    BLOCK_SIZE        - Tamaño del bloque en horas (default: 4)
    ENABLE_QUANTIZE   - Habilitar quantization (default: true)
    LOG_LEVEL         - Nivel de logging (default: INFO)
"""

import re
import os
import sys
import signal
import logging
from datetime import datetime, timezone
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
import httpx

# ============================================================
# Configuration
# ============================================================

UPSTREAM_URL = os.getenv("UPSTREAM_URL", "https://api.nan.builders/v1")
PORT = int(os.getenv("PORT", "8081"))
BLOCK_SIZE = int(os.getenv("BLOCK_SIZE", "4"))
ENABLE_QUANTIZE = os.getenv("ENABLE_QUANTIZE", "true").lower() == "true"
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

# Timestamp pattern - detects Roo Code's dynamic timestamp
# Matches: "Current time is Tuesday, June 23, 2026 at 02:32 PM"
# Also matches with optional "(Quantized for Cache)" suffix
TIMESTAMP_PATTERN = re.compile(
    r"Current time is \w+, \w+ \d+, \d{4} at \d{2}:\d{2} (?:AM|PM)(?: \(Quantized for Cache\))?"
)

# ============================================================
# Logging Setup
# ============================================================

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("nanproxy")

# ============================================================
# Time Quantization
# ============================================================


def quantize_time(dt: datetime, block_size: int = BLOCK_SIZE) -> str:
    """
    Freeze time to a quantized block.
    
    Example with block_size=4:
        Input:  2026-06-23 14:32:18
        Output: "Tuesday, June 23, 2026 at 12:00 PM"
    
    Blocks: [0-4, 4-8, 8-12, 12-16, 16-20, 20-24]
    """
    hour = (dt.hour // block_size) * block_size
    quantized = dt.replace(hour=hour, minute=0, second=0, microsecond=0)
    return quantized.strftime("%A, %B %d, %Y at %I:%M %p")


def get_quantization_block(dt: datetime, block_size: int = BLOCK_SIZE) -> str:
    """
    Get the quantization block identifier string.
    
    Example: "2026-06-23/12-16"
    """
    hour = (dt.hour // block_size) * block_size
    next_hour = hour + block_size
    date_str = dt.strftime("%Y-%m-%d")
    return f"{date_str}/{hour:02d}-{next_hour:02d}"


def sanitize_messages(messages: list, quantized_time: str) -> list:
    """
    Replace dynamic timestamps in messages with quantized time.
    
    Handles both string content and multimodal (array) content.
    """
    if not messages:
        return messages
    
    sanitized = []
    for msg in messages:
        if not isinstance(msg, dict):
            sanitized.append(msg)
            continue
        
        content = msg.get("content")
        
        if isinstance(content, str):
            new_content = TIMESTAMP_PATTERN.sub(quantized_time, content)
            if new_content != content:
                logger.debug(f"Replaced timestamp in message (role={msg.get('role')})")
            sanitized.append({**msg, "content": new_content})
        
        elif isinstance(content, list):
            # Handle multimodal content
            new_content = []
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    new_text = TIMESTAMP_PATTERN.sub(quantized_time, block.get("text", ""))
                    new_content.append({**block, "text": new_text} if new_text != block.get("text", "") else block)
                else:
                    new_content.append(block)
            sanitized.append({**msg, "content": new_content})
        
        else:
            sanitized.append(msg)
    
    return sanitized


def extract_original_timestamp(messages: list) -> Optional[str]:
    """Extract the original timestamp from messages for audit."""
    if not messages:
        return None
    
    for msg in messages:
        if not isinstance(msg, dict):
            continue
        
        content = msg.get("content")
        
        if isinstance(content, str):
            match = TIMESTAMP_PATTERN.search(content)
            if match:
                return match.group(0)
        
        elif isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    match = TIMESTAMP_PATTERN.search(block.get("text", ""))
                    if match:
                        return match.group(0)
    
    return None


# ============================================================
# Cache Hit Detection
# ============================================================

# Track response times per endpoint for cache detection
_endpoint_response_times: dict[str, list[float]] = {}


def detect_cache_hit(endpoint: str, response_time_ms: float) -> dict:
    """
    Detect if a response was likely a cache hit based on response time.
    
    Returns: {hit: bool, confidence: float, reason: str}
    """
    if endpoint not in _endpoint_response_times:
        _endpoint_response_times[endpoint] = []
    
    times = _endpoint_response_times[endpoint]
    times.append(response_time_ms)
    
    # Keep only last 20 responses
    if len(times) > 20:
        times.pop(0)
    
    # Need at least 3 responses for reliable detection
    if len(times) < 3:
        return {"hit": False, "confidence": 0, "reason": "insufficient_data"}
    
    avg_time = sum(times) / len(times)
    
    if avg_time <= 0:
        return {"hit": False, "confidence": 0, "reason": "invalid_avg"}
    
    ratio = response_time_ms / avg_time
    
    if ratio < 0.3:
        return {"hit": True, "confidence": 0.95, "reason": "very_fast"}
    elif ratio < 0.5:
        return {"hit": True, "confidence": 0.8, "reason": "fast"}
    elif ratio < 0.7:
        return {"hit": True, "confidence": 0.5, "reason": "moderate"}
    
    return {"hit": False, "confidence": 0, "reason": "normal"}


# ============================================================
# Token Estimation
# ============================================================


def estimate_tokens(text: str) -> int:
    """
    Estimate token count from text.
    Uses ~1.3 tokens per word as heuristic.
    """
    if not text:
        return 0
    words = text.split()
    return int(len(words) * 1.3)


def estimate_message_tokens(messages: list) -> int:
    """Estimate total tokens in a messages array."""
    total = 0
    for msg in messages:
        if not isinstance(msg, dict):
            continue
        content = msg.get("content")
        if isinstance(content, str):
            total += estimate_tokens(content)
        elif isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    total += estimate_tokens(block.get("text", ""))
    return total


# ============================================================
# Request Processing
# ============================================================


async def process_request(request: Request) -> tuple[dict, dict]:
    """
    Process incoming request: sanitize messages and return metadata.
    
    Returns: (processed_body, metadata)
    """
    body = await request.json()
    
    if not ENABLE_QUANTIZE or "messages" not in body:
        return body, {"quantizationApplied": False, "reason": "disabled"}
    
    now = datetime.now(timezone.utc)
    quantized_time = quantize_time(now)
    quantization_block = get_quantization_block(now)
    
    # Extract original timestamp for audit
    original_timestamp = extract_original_timestamp(body["messages"])
    
    # Estimate tokens before/after sanitization
    tokens_before = estimate_message_tokens(body["messages"])
    
    # Sanitize messages
    body["messages"] = sanitize_messages(body["messages"], quantized_time)
    
    # Estimate tokens after sanitization
    tokens_after = estimate_message_tokens(body["messages"])
    
    metadata = {
        "quantizationApplied": True,
        "quantizationBlock": quantization_block,
        "originalTimestamp": original_timestamp,
        "quantizedTimestamp": quantized_time,
        "tokensBefore": tokens_before,
        "tokensAfter": tokens_after,
        "timestampReplaced": original_timestamp is not None,
    }
    
    logger.info(f"[TimeQuantizer] Request processed: block={quantization_block}, replaced={metadata['timestampReplaced']}")
    
    return body, metadata


# ============================================================
# Response Processing
# ============================================================


async def process_response(response: httpx.Response, metadata: dict) -> dict:
    """
    Process outgoing response: extract usage and detect cache hit.
    
    Returns: {usage, cacheHit, quantizationBlock, ...}
    """
    start_time = datetime.now()
    
    # Read response content
    content = await response.aread()
    response_time_ms = (datetime.now() - start_time).total_seconds() * 1000
    
    result = {
        "content": content,
        "status_code": response.status_code,
        "headers": dict(response.headers),
    }
    
    # Try to parse JSON for usage stats
    try:
        data = response.json()
        
        if "usage" in data:
            result["usage"] = data["usage"]
            result["model"] = data.get("model")
        
        # Detect cache hit
        cache_detection = detect_cache_hit("/chat/completions", response_time_ms)
        result["cacheHit"] = cache_detection
        result["quantizationBlock"] = metadata.get("quantizationBlock")
        
    except Exception:
        # Not JSON (e.g., streaming)
        result["cacheHit"] = {"hit": False, "confidence": 0, "reason": "non_json"}
        result["quantizationBlock"] = metadata.get("quantizationBlock")
    
    return result


# ============================================================
# Streaming Response Generator
# ============================================================


async def stream_response(response_data: dict) -> None:
    """Stream response back to client."""
    content = response_data["content"]
    if isinstance(content, bytes):
        yield content
    else:
        yield content.encode("utf-8")


# ============================================================
# FastAPI App
# ============================================================


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Handle graceful shutdown."""
    logger.info(f"NaNProxy Cache Optimizer starting on port {PORT}")
    logger.info(f"Upstream: {UPSTREAM_URL}")
    logger.info(f"Quantization: block_size={BLOCK_SIZE}h, enabled={ENABLE_QUANTIZE}")
    yield
    logger.info("NaNProxy Cache Optimizer shutting down")


app = FastAPI(
    title="Roo Code Cache Optimizer Proxy",
    description="Intercepts Roo Code requests, quantizes timestamps for cache optimization",
    version="2.0.0",
    lifespan=lifespan,
)


@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    """
    Proxy endpoint for chat completions.
    
    Applies time quantization to messages before forwarding to upstream.
    Returns cache metrics as response headers.
    """
    try:
        # Process request (sanitize messages)
        body, metadata = await process_request(request)
        
        # Prepare headers
        headers = dict(request.headers)
        headers.pop("host", None)
        headers.pop("content-length", None)
        
        # Forward to upstream
        async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
            async with client.stream(
                "POST",
                f"{UPSTREAM_URL}/chat/completions",
                json=body,
                headers=headers,
            ) as response:
                # Process response
                response_data = await process_response(response, metadata)
                
                # Build response headers with cache info
                response_headers = {
                    "content-type": response.headers.get("content-type", "text/event-stream"),
                    "X-Quantization-Block": metadata.get("quantizationBlock", ""),
                    "X-Timestamp-Replaced": str(metadata.get("timestampReplaced", False)).lower(),
                    "X-Cache-Hit": str(response_data["cacheHit"].get("hit", False)).lower(),
                    "X-Cache-Confidence": str(response_data["cacheHit"].get("confidence", 0)),
                    "X-Cache-Reason": response_data["cacheHit"].get("reason", ""),
                }
                
                # Check if streaming
                content_type = response.headers.get("content-type", "")
                if "event-stream" in content_type:
                    # Streaming response
                    return StreamingResponse(
                        stream_response(response_data),
                        status_code=response.status_code,
                        headers=response_headers,
                        media_type="text/event-stream",
                    )
                else:
                    # Non-streaming response
                    return JSONResponse(
                        content=response_data,
                        status_code=response.status_code,
                        headers=response_headers,
                    )
    
    except httpx.TimeoutException:
        logger.error("Upstream timeout")
        raise HTTPException(status_code=504, detail="Upstream timeout")
    except httpx.HTTPError as e:
        logger.error(f"Upstream error: {e}")
        raise HTTPException(status_code=502, detail=f"Upstream error: {e}")


@app.get("/health")
async def health_check():
    """Health check endpoint with statistics."""
    total_endpoints = len(_endpoint_response_times)
    total_tracked = sum(len(v) for v in _endpoint_response_times.values())
    
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "uptime_seconds": 0,  # Would track process start time
        "quantization": {
            "enabled": ENABLE_QUANTIZE,
            "block_size_hours": BLOCK_SIZE,
        },
        "cache_detection": {
            "endpoints_tracked": total_endpoints,
            "total_responses_tracked": total_tracked,
        },
        "upstream": UPSTREAM_URL,
    }


@app.get("/stats")
async def stats_endpoint():
    """Detailed statistics endpoint."""
    endpoint_stats = {}
    
    for endpoint, times in _endpoint_response_times.items():
        if len(times) >= 3:
            avg_time = sum(times) / len(times)
            fast_responses = sum(1 for t in times if t < avg_time * 0.5)
            endpoint_stats[endpoint] = {
                "request_count": len(times),
                "avg_response_ms": round(avg_time, 2),
                "cache_hits_estimated": fast_responses,
            }
    
    return {
        "endpoint_stats": endpoint_stats,
        "configuration": {
            "upstream": UPSTREAM_URL,
            "block_size": BLOCK_SIZE,
            "quantization_enabled": ENABLE_QUANTIZE,
        },
    }


# ============================================================
# Signal Handlers
# ============================================================


def handle_signal(signum, frame):
    """Handle shutdown signals gracefully."""
    logger.info(f"Received signal {signum}, shutting down...")
    sys.exit(0)


signal.signal(signal.SIGINT, handle_signal)
signal.signal(signal.SIGTERM, handle_signal)


# ============================================================
# Main
# ============================================================


if __name__ == "__main__":
    import uvicorn
    
    logger.info(f"Starting NaNProxy Cache Optimizer on port {PORT}")
    logger.info(f"Upstream: {UPSTREAM_URL}")
    logger.info(f"Quantization: block_size={BLOCK_SIZE}h, enabled={ENABLE_QUANTIZE}")
    
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=PORT,
        log_level=LOG_LEVEL.lower(),
    )
