# Software Requirements Specification (SRS)

## Fashion Agent Autonomous System

**Document Version:** 1.0  
**Date:** 2026-02-24  
**Project:** Fashion Agent Autonomous  
**Repository:** GreatHavoc/Fashion-Agent-Autonomous

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Overall Description](#2-overall-description)
3. [System Architecture](#3-system-architecture)
4. [MCP Server Integrations](#4-mcp-server-integrations)
5. [Functional Requirements](#5-functional-requirements)
6. [Non-Functional Requirements](#6-non-functional-requirements)
7. [Data Models and State Management](#7-data-models-and-state-management)
8. [External Interface Requirements](#8-external-interface-requirements)
9. [Constraints and Assumptions](#9-constraints-and-assumptions)
10. [Glossary](#10-glossary)

---

## 1. Introduction

### 1.1 Purpose

This Software Requirements Specification (SRS) describes the functional and non-functional requirements for the **Fashion Agent Autonomous** system. The system is an AI-powered, multi-agent pipeline that autonomously scrapes fashion trend data from the web and fashion show videos, synthesizes insights, generates outfit designs tailored to the Indian youth market (18–26 age group), and produces runway-style presentation videos.

### 1.2 Scope

The Fashion Agent Autonomous system:

- Collects and scrapes fashion trend data from multiple online sources using MCP (Model Context Protocol) servers.
- Analyzes fashion show videos to identify silhouettes, colors, fabrics, and patterns.
- Synthesizes trend data from multiple sources into structured, actionable insights.
- Generates outfit designs using AI-powered image generation.
- Provides a Human-in-the-Loop (HITL) interface for reviewing, approving, rejecting, or editing outfit designs.
- Produces runway-style presentation videos from approved outfit images.
- Persists state and results in a cloud database (Supabase) and local SQLite checkpoint store.

### 1.3 Intended Audience

- Software engineers maintaining or extending the system
- Product managers and stakeholders evaluating system capabilities
- QA engineers designing test cases
- Fashion domain specialists configuring data sources

### 1.4 Document Conventions

| Term | Meaning |
|------|---------|
| Agent | An autonomous AI unit within the LangGraph workflow |
| MCP | Model Context Protocol – a standard for connecting LLMs to external tools/services |
| HITL | Human-in-the-Loop – a workflow pause point requiring a human decision |
| LangGraph | Graph-based orchestration framework used to define and run the multi-agent workflow |
| Node | A single agent or processing step in the LangGraph workflow graph |

### 1.5 References

- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- [LangChain MCP Adapters](https://github.com/langchain-ai/langchain-mcp-adapters)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [Google Gemini API](https://ai.google.dev/)
- [Tavily Search API](https://docs.tavily.com/)

---

## 2. Overall Description

### 2.1 Product Perspective

The Fashion Agent Autonomous system is a standalone AI pipeline deployed as a LangGraph application. It integrates with:

- **External MCP servers** for web scraping, image processing, video analysis, and outfit generation.
- **Google Gemini 2.5 Pro** as the large language model (LLM) powering all agents.
- **Supabase** as the cloud database for persistent storage of results and media assets.
- **SQLite** for local-development checkpointing of the LangGraph workflow state.
- **LangSmith** (optional) for managed cloud deployment with PostgreSQL-based checkpointing.

### 2.2 Product Functions

The system performs the following high-level functions:

1. **User Input Collection**: Accept user-provided URLs, images, and video URLs as supplemental analysis input via an HITL pause.
2. **Web Data Collection**: Scrape Indian fashion news sites and extract article metadata, images, and trend indicators.
3. **Content Analysis**: Deep-analyze each scraped URL to extract colors, fabrics, silhouettes, sellout signals, and trend forecasts.
4. **Video Trend Analysis**: Analyze fashion show videos to identify visual trends with frequency-based quantification.
5. **Trend Synthesis**: Merge content analysis and video analysis into a structured, confidence-scored trend report.
6. **Outfit Design**: Generate AI-created outfit images based on trend data, targeting the Indian 18–26 demographic.
7. **Human Outfit Review**: Pause for a human to approve, reject, or request edits on generated outfits (HITL).
8. **Video Generation**: Create short runway-style presentation videos from approved outfit images.

### 2.3 User Classes and Characteristics

| User Class | Description | Interaction Type |
|------------|-------------|-----------------|
| Fashion Analyst | Reviews trend reports and outfit designs | HITL via LangGraph API |
| System Administrator | Configures MCP endpoints, API keys, and video URLs | Configuration files |
| Developer | Extends agents, adds new MCP tools, deploys | Source code and LangGraph API |

### 2.4 Operating Environment

- **Python**: 3.11 or higher
- **Runtime**: Async Python (asyncio) with LangGraph workflow orchestration
- **Deployment Options**: Local development (SQLite checkpointer) or LangSmith cloud (PostgreSQL checkpointer)
- **LLM Provider**: Google Generative AI (Gemini 2.5 Pro)
- **Database**: Supabase (PostgreSQL-backed) for persistent storage
- **MCP Transport**: Streamable HTTP (all MCPs use HTTP streaming transport)

---

## 3. System Architecture

### 3.1 Workflow Overview

The system is built on **LangGraph** using a directed acyclic graph (DAG) with one conditional loop for the outfit review cycle. The complete agent workflow is:

```
START
  │
  ▼
[1] user_input_collector   (HITL pause – collect custom URLs, images, videos)
  │
  ├──────────────────────────────┐
  ▼                              ▼
[2] data_collector          [3] video_analyzer       ← Parallel execution
  │                              │
  ▼                              │
[2a] content_analyzer            │
  │                              │
  └──────────────┬───────────────┘
                 ▼
           [4] coordination    (fan-in barrier – both parallel branches merge here)
                 │
                 ▼
           [5] final_processor
                 │
                 ▼
           [6] outfit_designer
                 │
                 ▼
           [7] outfit_reviewer  (HITL pause – human approve/reject/edit)
                 │
        ┌────────┴─────────────────────────────┐
        │ approve                edit           │ reject
        ▼                         ▼             ▼
  [8] video_generator      [6] outfit_designer  END
        │
        ▼
       END
```

### 3.2 Agent Nodes Summary

| # | Node Name | Role | MCP(s) Used | HITL |
|---|-----------|------|-------------|------|
| 1 | `user_input_collector` | Collect user-provided URLs, images, videos | — | ✅ |
| 2 | `data_collector` | Scrape fashion websites and social platforms | Fashion News Scraper, Tavily | ❌ |
| 2a | `content_analyzer` | Analyze scraped URLs for deep trend insights | Website Processing, Tavily | ❌ |
| 3 | `video_analyzer` | Analyze fashion show videos for visual trends | Video Processing | ❌ |
| 4 | `coordination` | Fan-in barrier – synchronize parallel branches | — | ❌ |
| 5 | `final_processor` | Synthesize content + video data into trend report | — | ❌ |
| 6 | `outfit_designer` | Generate outfit designs with iterative reflection | Outfit Generation | ❌ |
| 7 | `outfit_reviewer` | Present outfits to human for approval/edit/reject | — | ✅ |
| 8 | `video_generator` | Create runway videos from approved outfit images | — | ❌ |

### 3.3 Parallel Execution

Nodes `data_collector` → `content_analyzer` (sequential chain) and `video_analyzer` execute **in parallel** after the `user_input_collector` completes. The `coordination` node acts as a fan-in synchronization barrier, ensuring both branches have completed before `final_processor` runs.

### 3.4 Human-in-the-Loop Design

Two HITL pause points use LangGraph's `interrupt()` mechanism:

1. **`user_input_collector`**: Pauses to receive custom URLs, images, and video URLs from the user.
2. **`outfit_reviewer`**: Pauses to present generated outfit designs for human review. Accepts one of:
   - `approve` → proceeds to video generation
   - `reject` → terminates workflow (requires feedback)
   - `edit` → loops back to `outfit_designer` with change instructions (can loop multiple times)

---

## 4. MCP Server Integrations

The system uses **5 MCP (Model Context Protocol) servers** via HTTP streaming transport (`streamable_http`). All MCPs are configured in `config.py`.

### 4.1 Fashion News Scraper MCP

| Property | Value |
|----------|-------|
| **Name** | Fashion News Scraper MCP |
| **Endpoint** | `https://mcpserver.onelogica.com/mcp` |
| **Transport** | `streamable_http` |
| **Timeout** | 500 seconds |
| **SSE Read Timeout** | 1200 seconds |
| **Used By** | Data Collector Agent |

**Purpose**: Scrapes fashion news articles, blog posts, and social media content from Indian fashion publications.

**Tools Exposed**:

| Tool Name | Description |
|-----------|-------------|
| `scrape_webpage_with_images` | Scrapes a webpage and returns content with embedded images |
| `get_webpage_summary` | Returns a summarized version of a webpage's content |

**Functional Requirements**:
- FR-MCP1.1: The Data Collector agent SHALL use `scrape_webpage_with_images` to extract full article content and images from fashion websites.
- FR-MCP1.2: The Data Collector agent SHALL use `get_webpage_summary` to generate concise summaries for filtering relevance.
- FR-MCP1.3: Scraped results SHALL be filtered to include only fashion-relevant content before being added to the URL list.
- FR-MCP1.4: The system SHALL retry MCP calls on transient failures up to `MAX_RETRIES` (3) times with exponential backoff.

---

### 4.2 Website Processing MCP

| Property | Value |
|----------|-------|
| **Name** | Website Processing MCP |
| **Endpoint** | `https://urlprocesser.onelogica.com/mcp` |
| **Transport** | `streamable_http` |
| **Timeout** | 600 seconds |
| **SSE Read Timeout** | 1200 seconds |
| **Used By** | Content Analyzer Agent |

**Purpose**: Captures screenshots, extracts structured content, and analyzes webpage structure for deeper analysis of fashion article URLs.

**Tools Exposed**:

| Tool Name | Description |
|-----------|-------------|
| `capture_full_page_screenshot` | Captures a full-page screenshot of a URL |
| `extract_webpage_content_for_llm` | Extracts clean, LLM-optimized content from a URL |
| `analyze_webpage_structure` | Returns structural analysis of the webpage layout |
| `batch_screenshot_urls` | Captures screenshots for multiple URLs in one call |
| `extract_content_with_custom_wait` | Extracts content after a configurable wait time (for dynamic pages) |

**Functional Requirements**:
- FR-MCP2.1: The Content Analyzer agent SHALL use `extract_webpage_content_for_llm` as the primary tool for per-URL content extraction.
- FR-MCP2.2: The Content Analyzer agent SHALL use `capture_full_page_screenshot` to obtain visual context when image analysis is required.
- FR-MCP2.3: The Content Analyzer agent MAY use `batch_screenshot_urls` to process multiple URLs efficiently.

---

### 4.3 Video Processing MCP

| Property | Value |
|----------|-------|
| **Name** | Video Processing MCP |
| **Endpoint** | `https://videomcp.onelogica.com/mcp` |
| **Transport** | `streamable_http` |
| **Timeout** | 600 seconds |
| **SSE Read Timeout** | 1200 seconds |
| **Used By** | Video Analyzer Agent |

**Purpose**: Processes fashion show videos to extract frame-level trend data, including silhouettes, colors, fabrics, and patterns with frequency quantification.

**Functional Requirements**:
- FR-MCP3.1: The Video Analyzer agent SHALL submit each configured video URL to the Video Processing MCP for analysis.
- FR-MCP3.2: The MCP SHALL return per-video structured analysis including silhouette trends, color palettes, fabric trends, prints, and patterns with frequency counts.
- FR-MCP3.3: The system SHALL skip video analysis entirely if no video URLs are configured (VIDEO_URLS is empty and no custom_videos provided).
- FR-MCP3.4: The system SHALL inject the original video URL into each per-video result for source traceability.

---

### 4.4 Outfit Generation MCP

| Property | Value |
|----------|-------|
| **Name** | Outfit Generation MCP (`outfit_server`) |
| **Endpoint** | `https://outfitmcp.onelogica.com/mcp` |
| **Transport** | `streamable_http` |
| **Timeout** | 600 seconds |
| **SSE Read Timeout** | 1200 seconds |
| **Used By** | Outfit Designer Agent |

**Purpose**: Generates photorealistic outfit design images from detailed garment specifications and provides AI-powered reflection/critique of generated designs.

**Tools Exposed**:

| Tool Name | Description |
|-----------|-------------|
| `generate_outfit_image` | Generates an outfit image from a structured garment specification |
| `list_generated_images` | Lists all previously generated outfit images |
| `delete_generated_image` | Deletes a specific generated image by ID |
| `verify_outfit_designs` | Validates that generated designs meet quality standards |

**Functional Requirements**:
- FR-MCP4.1: The Outfit Designer agent SHALL use `generate_outfit_image` with a full garment specification JSON to create each outfit design.
- FR-MCP4.2: Garment specifications SHALL include: `garment_type`, `garment_subtype`, `design_elements`, `color_palette`, `pattern_design`, `fabric_specifications`, and `style_attributes`.
- FR-MCP4.3: The Outfit Designer agent SHALL perform a reflection loop after each generation, iterating up to 5 times to refine designs based on feedback.
- FR-MCP4.4: The system SHALL produce a minimum of 3 distinct outfit designs per workflow run.
- FR-MCP4.5: Each generated outfit image path SHALL be persisted in the `OutfitDesignOutput.saved_image_path` field for downstream use by the Video Generator.

---

### 4.5 Tavily MCP

| Property | Value |
|----------|-------|
| **Name** | Tavily MCP |
| **Endpoint** | `https://mcp.tavily.com/mcp/?tavilyApiKey={API_KEY}` |
| **Transport** | `streamable_http` |
| **Timeout** | 120 seconds |
| **SSE Read Timeout** | 300 seconds |
| **Used By** | Data Collector Agent, Content Analyzer Agent |
| **Activation** | Only activated when `TavilyAPI` environment variable is set |

**Purpose**: Provides AI-optimized web search and content extraction capabilities, enabling agents to discover new fashion URLs and extract clean content from known URLs.

**Tools Exposed**:

| Tool Name | Description |
|-----------|-------------|
| `tavily-search` | AI-powered web search returning ranked, relevant results |
| `tavily-extract` | Extracts clean, structured content from one or more URLs |

**Functional Requirements**:
- FR-MCP5.1: The Data Collector agent SHALL use `tavily-search` to discover fashion-relevant articles and URLs not covered by the scraper MCP.
- FR-MCP5.2: The Content Analyzer agent SHALL use `tavily-extract` to obtain clean, LLM-optimized content from article URLs.
- FR-MCP5.3: If the `TavilyAPI` key is not set, the Tavily MCP configuration SHALL be empty and Tavily tools SHALL NOT be loaded.
- FR-MCP5.4: Tavily search results SHALL be filtered for relevance to Indian fashion trends for the 18–26 demographic before inclusion.

---

## 5. Functional Requirements

### 5.1 User Input Collector (Agent 1 – HITL)

| ID | Requirement |
|----|-------------|
| FR-1.1 | The system SHALL pause at the start of each workflow run and present an input interface for the user to provide custom URLs, images, and/or video URLs. |
| FR-1.2 | Custom URLs provided by the user SHALL be validated and passed to the Data Collector for inclusion in the scraping plan. |
| FR-1.3 | Custom video URLs SHALL be passed to the Video Analyzer and appended to the configured `VIDEO_URLS` list. |
| FR-1.4 | Custom images SHALL be passed as base64 or file paths to the Content Analyzer for vision-based trend extraction. |
| FR-1.5 | User input SHALL be stored in the workflow state under the `user_input` field. |
| FR-1.6 | If no user input is provided, the system SHALL proceed using only the default configurations. |

### 5.2 Data Collector (Agent 2)

| ID | Requirement |
|----|-------------|
| FR-2.1 | The Data Collector SHALL use the Fashion News Scraper MCP to scrape configured fashion websites and extract article metadata. |
| FR-2.2 | The agent SHALL use Tavily search (if configured) to discover additional fashion-relevant URLs. |
| FR-2.3 | The agent SHALL filter all results to retain only content relevant to Indian fashion trends for the 18–26 age group. |
| FR-2.4 | The agent SHALL NOT duplicate URLs in the output `url_list`. |
| FR-2.5 | The agent SHALL NOT invent or fabricate URLs; all URLs must originate from tool outputs. |
| FR-2.6 | Website article URLs and Instagram display URLs SHALL be handled separately: website URLs go into `url_list[].url`; Instagram image URLs go into `url_list[].image_url`. |
| FR-2.7 | The agent SHALL produce a `self_analysis` string summarizing collected hypotheses, patterns, and failures. |
| FR-2.8 | The structured output SHALL conform to the `DataCollectorOutput` Pydantic schema. |
| FR-2.9 | The agent SHALL retry on rate-limit errors (HTTP 429) with exponential backoff up to `MAX_RETRIES` times. |
| FR-2.10 | Output SHALL be saved to `data/data_collector_output.json` for traceability. |

### 5.3 Content Analyzer (Agent 3)

| ID | Requirement |
|----|-------------|
| FR-3.1 | The Content Analyzer SHALL receive the URL list from the Data Collector and analyze each URL for trend signals. |
| FR-3.2 | The agent SHALL use the Website Processing MCP to extract deep content from each URL. |
| FR-3.3 | For each URL, the agent SHALL extract: colors (with Pantone codes), fabrics, silhouettes, sellout signals, micro-trends, macro-trends, influencer mentions, and sentiment. |
| FR-3.4 | Each URL analysis SHALL include an `evidence_strength` confidence score (0.0–1.0). |
| FR-3.5 | The agent SHALL produce an `enhanced_thesis`, `final_report`, and `trend_insights` summary across all analyzed URLs. |
| FR-3.6 | The structured output SHALL conform to the `ContentAnalysisOutput` Pydantic schema. |
| FR-3.7 | The agent SHALL use `tavily-extract` (if Tavily is configured) as a fallback content extraction method. |

### 5.4 Video Analyzer (Agent 4)

| ID | Requirement |
|----|-------------|
| FR-4.1 | The Video Analyzer SHALL process all video URLs from the `VIDEO_URLS` configuration and any user-provided custom videos. |
| FR-4.2 | For each video, the agent SHALL extract: silhouette trends, color palettes, fabric trends, prints, patterns, accessories, and commercial potential with frequency counts. |
| FR-4.3 | The agent SHALL produce overall `trending_elements` and `commercial_insights` summaries across all videos. |
| FR-4.4 | Per-video results SHALL include the original `video_url` for source traceability. |
| FR-4.5 | The structured output SHALL conform to the `VideoTrendOutput` Pydantic schema. |
| FR-4.6 | If no video URLs are configured, the agent SHALL return an empty result set and mark its status as `skipped`. |
| FR-4.7 | Output SHALL be saved to `data/video_analyzer_output.json` for traceability. |

### 5.5 Final Processor / Trend Synthesizer (Agent 5)

| ID | Requirement |
|----|-------------|
| FR-5.1 | The Final Processor SHALL receive both `ContentAnalysisOutput` and `VideoTrendOutput` as inputs and synthesize a unified trend report. |
| FR-5.2 | The synthesized report SHALL cover: dominant color trends, style trends, pattern trends, print trends, material trends, silhouette trends, and seasonal insights. |
| FR-5.3 | All trend claims SHALL be supported by quantitative evidence (frequency counts, confidence scores, cross-source validation percentages). |
| FR-5.4 | Trends confirmed in both data sources (content + video) SHALL receive a confidence boost of +0.2. |
| FR-5.5 | The agent SHALL produce `predicted_next_season_trends` with a 3–6 month forecast horizon. |
| FR-5.6 | The structured output SHALL conform to the `TrendAnalysisList` Pydantic schema. |
| FR-5.7 | The `overall_confidence_score` SHALL be a decimal between 0.0 and 1.0. |
| FR-5.8 | Output SHALL be saved to `data/trend_processor_output.json` for traceability. |

### 5.6 Outfit Designer (Agent 6)

| ID | Requirement |
|----|-------------|
| FR-6.1 | The Outfit Designer SHALL use the trend analysis from the Final Processor to design outfits targeting the Indian 18–26 demographic. |
| FR-6.2 | The agent SHALL generate a minimum of 3 distinct outfit designs per run. |
| FR-6.3 | Each outfit SHALL be generated using the Outfit Generation MCP with a detailed garment specification. |
| FR-6.4 | After each generation, the agent SHALL run a reflection loop using the outfit image and all trend reports as ground truth, iterating up to 5 times. |
| FR-6.5 | Each outfit output SHALL include: name, description, season, occasion, dominant colors, style tags, fashion metrics (formality, trendiness, boldness, wearability), trend incorporation list, revision history, and saved image path. |
| FR-6.6 | The structured output SHALL conform to the `ListofOutfits` Pydantic schema. |
| FR-6.7 | **Revision Mode**: When triggered by an `edit` decision from the Outfit Reviewer, the agent SHALL apply only the changes specified in `edit_instructions`, preserving all other design aspects. |
| FR-6.8 | In Revision Mode, if `selected_outfit_ids` is provided, only the specified outfits SHALL be regenerated; others are returned unchanged. |
| FR-6.9 | Output SHALL be saved to `data/outfit_designer_output.json` and a combined `data/dashboard_data.json`. |

### 5.7 Outfit Reviewer (Agent 7 – HITL)

| ID | Requirement |
|----|-------------|
| FR-7.1 | The Outfit Reviewer SHALL pause the workflow and present all generated outfit designs for human review via the LangGraph `interrupt()` mechanism. |
| FR-7.2 | The review payload SHALL include: outfit name, description, dominant colors, style tags, and image path for each outfit. |
| FR-7.3 | The human reviewer SHALL provide one of three decision types: `approve`, `reject`, or `edit`. |
| FR-7.4 | If decision is `approve`, the workflow SHALL proceed to the Video Generator. |
| FR-7.5 | If decision is `reject`, a `rejection_feedback` field SHALL be mandatory; the workflow SHALL terminate. |
| FR-7.6 | If decision is `edit`, an `edit_instructions` field SHALL be mandatory; the workflow SHALL loop back to the Outfit Designer. |
| FR-7.7 | The reviewer SHALL support an optional `selected_outfit_ids` list to target specific outfits for editing or approval. |
| FR-7.8 | The reviewer SHALL NOT trigger a second interrupt if a `completed` or `approve`/`reject` decision is already recorded in state (guard against LangGraph replay). |

### 5.8 Video Generator (Agent 8)

| ID | Requirement |
|----|-------------|
| FR-8.1 | The Video Generator SHALL create runway-style presentation videos from the saved outfit images. |
| FR-8.2 | Each approved outfit with a valid `saved_image_path` SHALL have a video generated for it. |
| FR-8.3 | If `selected_outfit_ids` is specified in the review decision, only videos for those outfits SHALL be generated. |
| FR-8.4 | Generated videos SHALL be saved locally to the `videos/` directory in MP4 format. |
| FR-8.5 | Each video output SHALL include: outfit_id, input_image_path, output_video_path, generation_success flag, generation_time, video_duration, and video_format. |
| FR-8.6 | Generated videos SHALL be uploaded to Supabase cloud storage; the public URL SHALL replace the local path in the output record. |
| FR-8.7 | The structured output SHALL conform to the `VideoGenerationCollectionOutput` Pydantic schema. |
| FR-8.8 | The system SHALL log and continue on individual video generation failures, reporting `failed_videos` in the output. |

### 5.9 State and Checkpointing

| ID | Requirement |
|----|-------------|
| FR-9.1 | The system SHALL use LangGraph's SQLite checkpointer in local development mode for workflow state persistence. |
| FR-9.2 | In LangSmith cloud deployment, the system SHALL use the auto-configured PostgreSQL checkpointer. |
| FR-9.3 | Each workflow run SHALL be identified by a unique `thread_id` used for checkpointing and storage record IDs. |
| FR-9.4 | All agent outputs SHALL be persisted to Supabase using the `storage` utility module after successful completion. |
| FR-9.5 | The system SHALL log token usage per agent using the global `TokenUsageTracker`. |

---

## 6. Non-Functional Requirements

### 6.1 Performance

| ID | Requirement |
|----|-------------|
| NFR-1.1 | Each individual agent node SHALL have a maximum execution timeout of 300 seconds (5 minutes) per attempt via `asyncio.wait_for`. Note: MCP server connection timeouts (500–600 s) and SSE read timeouts (1200 s) are configured separately on the MCP transport layer and may exceed the agent-level timeout; if an MCP call is still in-flight when the agent timeout fires, the attempt will be retried. |
| NFR-1.2 | The Data Collector and Video Analyzer nodes SHALL execute in parallel to reduce total workflow latency. |
| NFR-1.3 | The complete workflow (from start to video generation) SHOULD complete within 45 minutes under normal load conditions. |
| NFR-1.4 | MCP tool calls SHALL be retried on rate-limit (HTTP 429) or transient errors with exponential backoff. The initial retry delay is `BASE_DELAY = 22` seconds (as configured in `config.py`); subsequent delays grow as `BASE_DELAY × 2ⁿ` (e.g., 22 s, 44 s, 88 s for attempts 1, 2, 3). When the API response includes a `retry in Xs` header, that specific delay is used instead. |

### 6.2 Reliability

| ID | Requirement |
|----|-------------|
| NFR-2.1 | Each agent SHALL retry failed operations up to `MAX_RETRIES` (3) times before propagating the error. |
| NFR-2.2 | Agent failures SHALL be captured in the workflow state `errors` dict without terminating the entire pipeline (where possible). |
| NFR-2.3 | LangGraph checkpointing SHALL ensure the workflow can be resumed from the last successful checkpoint after a crash or timeout. |
| NFR-2.4 | MCP server connections SHALL use SSE (Server-Sent Events) with a 1200-second read timeout to handle long-running scraping and video processing operations. |

### 6.3 Security

| ID | Requirement |
|----|-------------|
| NFR-3.1 | All API keys (GoogleAPI, TavilyAPI, Supabase credentials) SHALL be loaded exclusively from environment variables via `python-decouple`; they SHALL NOT be hard-coded. |
| NFR-3.2 | The Tavily MCP endpoint URL SHALL embed the API key as a query parameter; this URL SHALL be treated as a secret. |
| NFR-3.3 | Supabase storage uploads SHALL use authenticated API calls. |
| NFR-3.4 | The system SHALL validate the structure of human review decisions (using Pydantic models) before acting on them to prevent injection attacks via HITL inputs. |

### 6.4 Maintainability

| ID | Requirement |
|----|-------------|
| NFR-4.1 | All agent system prompts SHALL be defined as separate functions in `config.py` to allow independent modification. |
| NFR-4.2 | All MCP configurations SHALL be defined as named constants in `config.py`. |
| NFR-4.3 | Agent tool name lists (`SCRAPER_TOOL_NAMES`, `OUTFIT_TOOL_NAMES`, etc.) SHALL be defined in `config.py` to allow tool additions without modifying agent logic. |
| NFR-4.4 | All structured data outputs SHALL use Pydantic v2 models defined in `state.py`. |

### 6.5 Scalability

| ID | Requirement |
|----|-------------|
| NFR-5.1 | The number of video URLs can be extended by adding entries to `VIDEO_URLS` in `config.py` without code changes. |
| NFR-5.2 | Additional scraper tools can be enabled by uncommenting entries in `SCRAPER_TOOL_NAMES`. |
| NFR-5.3 | The system architecture supports deployment to LangSmith for horizontal scalability using managed infrastructure. |

### 6.6 Observability and Logging

| ID | Requirement |
|----|-------------|
| NFR-6.1 | All agent operations SHALL be logged to `fashion_analysis.log` (file logger) with timestamps and log levels. |
| NFR-6.2 | High-level progress SHALL be output to the console via the console logger. |
| NFR-6.3 | Token usage (input, output, total) SHALL be tracked per agent and accessible via `TokenUsageTracker.get_usage()`. |
| NFR-6.4 | All raw agent outputs SHALL be logged at INFO level in `fashion_analysis.log` for audit purposes. |

---

## 7. Data Models and State Management

### 7.1 Main Workflow State (`FashionAnalysisState`)

The global state shared across all nodes in the LangGraph workflow:

| Field | Type | Description | Reducer |
|-------|------|-------------|---------|
| `query` | `str` | User's analysis query | Last-write-wins |
| `user_input` | `Dict` | User-provided URLs, images, videos | Last-write-wins |
| `awaiting_outfit_review` | `bool` | Flag: paused for outfit review | Last-write-wins |
| `outfit_review_decision` | `Dict` | Human review decision (approve/reject/edit) | Last-write-wins |
| `data_collection` | `Dict` | Data Collector structured output | Last-write-wins |
| `content_analysis` | `List[Dict]` | Content Analyzer outputs (accumulated) | `operator.add` (append) |
| `video_analysis` | `List[Dict]` | Video Analyzer outputs (accumulated) | `operator.add` (append) |
| `final_processor` | `Dict` | Trend Synthesizer output | Last-write-wins |
| `outfit_designs` | `List[Dict]` | Outfit Designer outputs | Replace with latest |
| `outfit_videos` | `List[Dict]` | Video Generator outputs | Replace with latest |
| `agent_memories` | `Dict[str, Dict]` | Per-agent memory/context storage | `merge_agent_memories` |
| `execution_status` | `Dict[str, str]` | Status per agent (completed/failed/skipped) | `merge_dicts` |
| `errors` | `Dict[str, str]` | Error messages per agent | `merge_dicts` |
| `token_usage` | `Dict` | Cumulative LLM token usage | `merge_token_usage` |

### 7.2 Key Output Schemas

| Schema | Agent | Key Fields |
|--------|-------|-----------|
| `DataCollectorOutput` | Data Collector | `url_list`, `self_analysis`, `errors` |
| `ContentAnalysisOutput` | Content Analyzer | `per_url_findings`, `enhanced_thesis`, `final_report`, `trend_insights` |
| `VideoTrendOutput` | Video Analyzer | `per_video_results`, `trending_elements`, `commercial_insights` |
| `TrendAnalysisList` | Final Processor | `trend_analysis`, `overall_confidence_score`, `analysis_summary` |
| `ListofOutfits` | Outfit Designer | `Outfits` (list of `OutfitDesignOutput`) |
| `VideoGenerationCollectionOutput` | Video Generator | `video_results`, `successful_videos`, `failed_videos` |

### 7.3 Human-in-the-Loop Schemas

| Schema | Fields |
|--------|--------|
| `UserInput` | `custom_urls`, `custom_images`, `custom_videos`, `query` |
| `OutfitReviewDecision` | `decision_type`, `rejection_feedback`, `edit_instructions`, `selected_outfit_ids` |

---

## 8. External Interface Requirements

### 8.1 LangGraph API

- The system is served via the LangGraph server (`langgraph dev`) using the `get_graph()` entry point in `graph.py`.
- The graph is registered in `langgraph.json` as `"agent": "./graph.py:get_graph"`.
- Human-in-the-loop interactions are managed via the LangGraph API's `thread` update mechanism (`interrupt` / `Command` resume).

### 8.2 Google Gemini API

- **Model**: `gemini-2.5-pro`
- **Key Configuration**: `GoogleAPI` environment variable
- **Features Used**: Text generation, multimodal vision (image analysis), streaming with token usage tracking
- **Temperature**: 0 (deterministic output for structured data extraction)

### 8.3 Supabase (Storage)

- **Module**: `utils/storage.py`
- **Operations**: Create run records, update per-agent outputs, upload generated videos and outfit images
- **Authentication**: Supabase URL + API key from environment variables
- **Record ID Pattern**: `fashion_analysis_{thread_id}`

### 8.4 SQLite Checkpointer (Local Development)

- **Location**: `data/checkpoints.db`
- **Library**: `langgraph-checkpoint-sqlite`
- **Scope**: Local development only; replaced by PostgreSQL in LangSmith deployments

### 8.5 File System

| Path | Purpose |
|------|---------|
| `data/data_collector_output.json` | Persisted Data Collector output |
| `data/video_analyzer_output.json` | Persisted Video Analyzer output |
| `data/trend_processor_output.json` | Persisted Final Processor output |
| `data/outfit_designer_output.json` | Persisted Outfit Designer output |
| `data/dashboard_data.json` | Combined trend + outfit data for UI dashboard |
| `data/video_generation_collection_output.json` | Persisted Video Generator output |
| `videos/` | Generated runway presentation videos (MP4) |
| `assets/` | Static assets (logo, sample AI-generated images) |
| `fashion_analysis.log` | Operational log file |

---

## 9. Constraints and Assumptions

### 9.1 Constraints

- C-1: The system requires a valid `GoogleAPI` environment variable for the Gemini LLM. If missing, the system SHALL fail to start with a `RuntimeError`.
- C-2: All five MCP servers must be reachable over HTTPS. Network failures will cause the dependent agents to fail after exhausting retries.
- C-3: The Tavily MCP is optional and only available when `TavilyAPI` is set.
- C-4: Video generation for outfits requires a valid `saved_image_path` in the outfit design; outfits without an image path will be skipped.
- C-5: The outfit review loop is bounded only by the number of `edit` decisions; there is no hard limit on review iterations.
- C-6: Python 3.11 or higher is required.

### 9.2 Assumptions

- A-1: All MCP servers are maintained by Onelogica (`onelogica.com`) and are assumed to be available during workflow execution.
- A-2: The target market for all outfit designs is the Indian youth demographic aged 18–26.
- A-3: The system operates in async mode throughout; blocking I/O is offloaded using `asyncio.to_thread`.
- A-4: In production (LangSmith), the checkpointer is automatically configured; no manual setup is needed.
- A-5: Supabase credentials are pre-configured in the environment before deployment.

---

## 10. Glossary

| Term | Definition |
|------|-----------|
| **Agent** | An autonomous AI unit that uses an LLM + tools to complete a specific task within the workflow |
| **Checkpointer** | LangGraph component that persists workflow state at each step, enabling replay and HITL interrupts |
| **Fan-in barrier** | A synchronization point that waits for all parallel branches to complete before proceeding |
| **HITL** | Human-in-the-Loop — a mechanism to pause an automated workflow for a human decision |
| **LangGraph** | A library from LangChain for building stateful, multi-agent workflows as directed graphs |
| **LangSmith** | A cloud platform by LangChain for deploying, monitoring, and managing LangGraph applications |
| **MCP** | Model Context Protocol — an open standard for connecting AI models to external data sources and tools |
| **Pantone Code** | A standardized color identification system used in the fashion industry |
| **Pydantic** | A Python library for data validation and serialization using type annotations |
| **Silhouette** | The overall shape and structure of a garment (e.g., A-line, oversized, fitted) |
| **Sellout Signal** | An indicator that a product or style is likely to see high consumer demand |
| **Streamable HTTP** | An MCP transport mechanism using HTTP with Server-Sent Events (SSE) for streaming responses |
| **Supabase** | An open-source Firebase alternative providing a PostgreSQL database, storage, and authentication |
| **Token Usage** | The count of input and output tokens consumed by LLM API calls, tracked for cost management |
| **Thread ID** | A unique identifier for a single workflow run, used for checkpointing and storage record correlation |
