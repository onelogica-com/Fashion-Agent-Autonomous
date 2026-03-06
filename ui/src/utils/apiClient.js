const API_URL = "http://localhost:2024";

/**
 * Enhanced error class for API errors
 */
class APIError extends Error {
  constructor(message, statusCode, details = null) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Parse error response and create user-friendly error message
 */
function parseErrorResponse(statusCode, errorData) {
  let message = 'An error occurred';

  switch (statusCode) {
    case 404:
      message = 'Resource not found. The thread or assistant may not exist.';
      break;
    case 409:
      message = 'Conflict: Another run is already in progress on this thread. Please wait for it to complete.';
      break;
    case 422:
      message = 'Validation error: The request data is invalid.';
      if (errorData && typeof errorData === 'string') {
        message += ` Details: ${errorData}`;
      }
      break;
    case 500:
      message = 'Server error. Please try again later.';
      break;
    default:
      if (errorData && typeof errorData === 'string') {
        message = errorData;
      }
  }

  return message;
}

/**
 * Fetch from API with enhanced error handling
 */
async function fetchFromApi(path, options = {}) {
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });

    if (!response) {
      throw new APIError("No response from server", 0);
    }

    if (!response.ok) {
      const contentType = response.headers.get("content-type");
      let errorData;

      if (contentType && contentType.includes("application/json")) {
        try {
          errorData = await response.json();
        } catch (e) {
          errorData = await response.text();
        }
      } else {
        errorData = await response.text();
      }

      const message = parseErrorResponse(response.status, errorData);
      throw new APIError(message, response.status, errorData);
    }

    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return response.json();
    }
    return response.text();
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    // Network error or other fetch errors
    throw new APIError(
      `Network error: ${error.message}. Please check your connection and ensure the LangGraph server is running.`,
      0,
      error
    );
  }
}

/**
 * Validate URL format
 */
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Validate user input data before sending
 */
function validateUserInput(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid user input data');
  }

  // Validate URLs if provided
  if (data.custom_urls && Array.isArray(data.custom_urls)) {
    const invalidUrls = data.custom_urls.filter(url => url && !isValidUrl(url));
    if (invalidUrls.length > 0) {
      throw new Error(`Invalid URLs: ${invalidUrls.join(', ')}`);
    }
  }

  // Validate image URLs if provided
  if (data.custom_images && Array.isArray(data.custom_images)) {
    const invalidImages = data.custom_images.filter(url => url && !isValidUrl(url));
    if (invalidImages.length > 0) {
      throw new Error(`Invalid image URLs: ${invalidImages.join(', ')}`);
    }
  }

  // Validate video URLs if provided
  if (data.custom_videos && Array.isArray(data.custom_videos)) {
    const invalidVideos = data.custom_videos.filter(url => url && !isValidUrl(url));
    if (invalidVideos.length > 0) {
      throw new Error(`Invalid video URLs: ${invalidVideos.join(', ')}`);
    }
  }

  return true;
}

/**
 * Validate outfit review data
 */
function validateReviewData(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid review data');
  }

  if (!data.decision_type || !['approve', 'reject', 'edit'].includes(data.decision_type)) {
    throw new Error('Invalid decision type. Must be approve, reject, or edit.');
  }

  if (data.decision_type === 'reject' && (!data.rejection_feedback || !data.rejection_feedback.trim())) {
    throw new Error('Rejection feedback is required when rejecting outfits');
  }

  if (data.decision_type === 'edit' && (!data.edit_instructions || !data.edit_instructions.trim())) {
    throw new Error('Edit instructions are required when requesting changes');
  }

  return true;
}

/**
 * Create a new thread
 */
export async function createThread() {
  return fetchFromApi("/threads", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

/**
 * Search/list threads with filtering and pagination
 * @param {Object} options - Search options
 * @param {number} options.limit - Max results to return (default 20)
 * @param {number} options.offset - Results to skip for pagination (default 0)
 * @param {string} options.status - Filter by status (e.g., "idle", "busy")
 * @param {Object} options.metadata - Filter by metadata key-value pairs
 */
export async function searchThreads(options = {}) {
  const { limit = 20, offset = 0, status = null, metadata = {} } = options;

  const body = {
    limit,
    offset,
    order_by: "created_at",
    sort_order: "desc"
  };

  if (status) body.status = status;
  if (Object.keys(metadata).length > 0) body.metadata = metadata;

  return fetchFromApi("/threads/search", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

/**
 * Stream a run on a thread
 */
export async function streamRun(threadId, input) {
  if (!threadId) {
    throw new Error('Thread ID is required');
  }

  try {
    const payload = {
      assistant_id: "agent",
    };

    if (input) {
      payload.input = { input };
    } else {
      payload.input = null;
    }

    const response = await fetch(`${API_URL}/threads/${threadId}/runs/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const message = parseErrorResponse(response.status, errorText);
      throw new APIError(message, response.status, errorText);
    }

    if (!response.body) {
      throw new APIError("Response body is null", 0);
    }
    return response.body.getReader();
  } catch (error) {
    if (error instanceof APIError) {
      throw error;
    }
    console.error("Stream run error:", error);
    throw new APIError(
      `Network error during stream: ${error.message}. Please check if the server is running.`,
      0,
      error
    );
  }
}

/**
 * Resume a run from an interrupt
 */
export const resumeRun = async (threadId, checkpoint, input, interruptId) => {
  if (!threadId) {
    throw new Error('Thread ID is required');
  }

  if (!checkpoint || !checkpoint.checkpoint_id) {
    throw new Error('Valid checkpoint is required');
  }

  if (!interruptId) {
    throw new Error('Interrupt ID is required for resume');
  }

  const url = `${API_URL}/threads/${threadId}/runs/stream`;

  const requestBody = {
    command: {
      resume: {
        [interruptId]: input || null  // Put user's response data here
      }
    },
    config: {
      configurable: {
        thread_id: threadId
      }
    },
    stream_mode: ["values"],
    stream_subgraphs: true,
    assistant_id: 'agent',
    interrupt_before: [],
    interrupt_after: [],
    checkpoint: {
      checkpoint_id: checkpoint.checkpoint_id,
      thread_id: threadId,
      checkpoint_ns: checkpoint.checkpoint_ns || ""
    },
    multitask_strategy: "rollback",
    checkpoint_during: true
  };

  console.log('Resume run request:', {
    url,
    threadId,
    interruptId,
    checkpointId: checkpoint.checkpoint_id,
    body: requestBody
  });
  console.log('Resume run payload:', JSON.stringify(requestBody, null, 2));
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Resume run failed:', response.status, errorText);
      throw new Error(`Failed to resume run: ${response.status} ${errorText}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    return response.body.getReader();

  } catch (error) {
    console.error('Error in resumeRun:', error);
    throw error;
  }
};

// add to apiClient.js (near other exported helpers)
export async function saveStateThenStream({
  threadId,
  values,            // the "values" array you want to save: e.g. [ [ {...} ] ]
  as_node = "__copy__",  // optional (your example uses "__copy__")
  assistant_id = "agent", // default assistant id; override if needed
  metadata = { from_studio: true, LANGGRAPH_API_URL: API_URL }, // optional metadata object
  stream_mode = ["debug", "messages"], // default stream modes (your example)
  stream_subgraphs = true,
  multitask_strategy = "rollback",
  checkpoint_during = true
}) {
  if (!threadId) throw new Error("threadId is required");
  if (!values) throw new Error("values payload is required");

  // 1) POST state and get checkpoint back
  const statePayload = {
    values,
    checkpoint: undefined, // not sending existing checkpoint (we are creating one)
    as_node
  };

  // Use existing updateState to keep consistent error handling
  let stateResponse;
  try {
    console.log("saveStateThenStream: posting state:", { threadId, statePayload });
    stateResponse = await fetch(`${API_URL}/threads/${threadId}/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(statePayload),
    });

    if (!stateResponse.ok) {
      const errText = await stateResponse.text();
      const message = parseErrorResponse(stateResponse.status, errText);
      throw new APIError(message, stateResponse.status, errText);
    }
  } catch (err) {
    if (err instanceof APIError) throw err;
    throw new APIError(`Network error when updating state: ${err.message}`, 0, err);
  }

  // parse JSON checkpoint
  let stateJson;
  try {
    stateJson = await stateResponse.json();
  } catch (err) {
    throw new APIError("Failed to parse state response JSON", 0, err);
  }

  const checkpoint = stateJson?.checkpoint || stateJson?.configurable || stateJson?.checkpoint_id ? stateJson.checkpoint : null;
  // fallback if API returns top-level checkpoint_id like in your example:
  if (!checkpoint && stateJson?.checkpoint_id) {
    // Some responses include checkpoint_id at top level; construct minimal checkpoint object
    stateJson.checkpoint = {
      checkpoint_id: stateJson.checkpoint_id,
      thread_id: stateJson?.configurable?.thread_id || threadId,
      checkpoint_ns: stateJson?.configurable?.checkpoint_ns || ""
    };
  }

  const finalCheckpoint = stateJson?.checkpoint;
  if (!finalCheckpoint || !finalCheckpoint.checkpoint_id) {
    throw new APIError("No checkpoint received from state API", 0, stateJson);
  }

  // 2) POST to runs/stream using the checkpoint
  const streamUrl = `${API_URL}/threads/${threadId}/runs/stream`;
  const streamBody = {
    config: {
      configurable: {
        thread_id: threadId
      }
    },
    metadata,
    stream_mode,
    stream_subgraphs,
    assistant_id,
    interrupt_before: [],
    interrupt_after: [],
    checkpoint: finalCheckpoint,
    multitask_strategy,
    checkpoint_during
  };

  try {
    const streamResponse = await fetch(streamUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(streamBody),
    });

    if (!streamResponse.ok) {
      const errorText = await streamResponse.text();
      const message = parseErrorResponse(streamResponse.status, errorText);
      throw new APIError(message, streamResponse.status, errorText);
    }

    if (!streamResponse.body) {
      throw new APIError("Stream response body is null", 0);
    }

    // return a reader so caller can consume the stream (same as streamRun)
    return {
      reader: streamResponse.body.getReader(),
      checkpoint: finalCheckpoint,
      rawStateResponse: stateJson
    };

  } catch (err) {
    if (err instanceof APIError) throw err;
    throw new APIError(`Network error when starting stream: ${err.message}`, 0, err);
  }
}


/**
 * Get the current state of a thread
 */
export async function getThreadState(threadId) {
  if (!threadId) {
    throw new Error('Thread ID is required');
  }

  return fetchFromApi(`/threads/${threadId}/state`);
}

/**
 * Update the state of a thread
 */
export async function updateState(threadId, values, checkpointId, asNode) {
  if (!threadId) {
    throw new Error('Thread ID is required');
  }

  const payload = {
    values,
    checkpoint: checkpointId ? { checkpoint_id: checkpointId } : undefined,
    as_node: asNode
  };
  console.log("Updating thread state with payload:", payload);
  return fetchFromApi(`/threads/${threadId}/state`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Cancel a running run
 */
export async function cancelRun(threadId, runId) {
  if (!threadId || !runId) {
    throw new Error('Thread ID and Run ID are required');
  }

  return fetchFromApi(`/threads/${threadId}/runs/${runId}/cancel`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

/**
 * List runs for a thread
 */
export async function listRuns(threadId) {
  if (!threadId) {
    throw new Error('Thread ID is required');
  }

  return fetchFromApi(`/threads/${threadId}/runs`);
}


/**
 * Get the history (checkpoints) for a thread
 */
export async function getThreadHistory(threadId, options = {}) {
  if (!threadId) {
    throw new Error('Thread ID is required');
  }
  const { limit = 50, before = null } = options;
  let url = `/threads/${threadId}/history?limit=${limit}`;
  if (before) {
    url += `&before=${before}`;
  }
  return fetchFromApi(url);
}

/**
 * Find a checkpoint for a specific node in the thread history
 */
export async function findCheckpointByNode(threadId, nodeName) {
  if (!threadId) {
    throw new Error('Thread ID is required');
  }
  if (!nodeName) {
    throw new Error('Node name is required');
  }
  const history = await getThreadHistory(threadId, { limit: 50 });

  if (!history || history.length === 0) {
    throw new Error('No history found for this thread');
  }
  // Find the checkpoint where this node appears in the next nodes to execute
  // OR where the node was the last one executed
  const targetState = history.find(state => {
    // Check if node is in the next array (waiting to execute)
    if (state.next && state.next.includes(nodeName)) {
      return true;
    }

    // Check metadata for node information
    if (state.metadata && state.metadata.checkpoint_node === nodeName) {
      return true;
    }

    // Check values for last executed node
    if (state.values && state.values.last_node === nodeName) {
      return true;
    }

    return false;
  });
  if (!targetState) {
    throw new Error(`No checkpoint found for node: ${nodeName}`);
  }
  return targetState;
}

/**
 * Update state at a specific node and rerun the workflow from that checkpoint
 */
export async function updateStateAndRerun(threadId, nodeName, updatedData) {
  if (!threadId) {
    throw new Error('Thread ID is required');
  }
  if (!nodeName) {
    throw new Error('Node name is required');
  }
  if (!updatedData) {
    throw new Error('Updated data is required');
  }
  console.log(`Updating state and rerunning from node: ${nodeName}`);
  // Step 1: Find the checkpoint for this node
  const targetState = await findCheckpointByNode(threadId, nodeName);
  console.log('Found checkpoint:', targetState.checkpoint);
  // Step 2: Update the state at this checkpoint
  const updatePayload = {
    values: updatedData,
    checkpoint: targetState.checkpoint,
    as_node: nodeName // Update as if this node just executed
  };
  console.log('Updating state with payload:', updatePayload);
  const updateResponse = await fetchFromApi(`/threads/${threadId}/state`, {
    method: 'POST',
    body: JSON.stringify(updatePayload),
  });
  // Step 3: Get the new checkpoint from the update response
  const newCheckpoint = updateResponse.checkpoint;

  if (!newCheckpoint || !newCheckpoint.checkpoint_id) {
    throw new Error('No checkpoint received from state update');
  }
  console.log('Received new checkpoint:', newCheckpoint);
  // Step 4: Start streaming from the new checkpoint
  const streamUrl = `${API_URL}/threads/${threadId}/runs/stream`;
  const streamPayload = {
    config: {
      configurable: {
        thread_id: threadId
      }
    },
    assistant_id: 'agent',
    checkpoint: newCheckpoint,
    stream_mode: ['values', 'debug'],
    stream_subgraphs: true,
    multitask_strategy: 'rollback',
    checkpoint_during: true
  };
  console.log('Starting stream with new checkpoint');
  const streamResponse = await fetch(streamUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(streamPayload),
  });
  if (!streamResponse.ok) {
    const errorText = await streamResponse.text();
    throw new Error(`Failed to resume workflow: ${streamResponse.status} ${errorText}`);
  }
  if (!streamResponse.body) {
    throw new Error('Stream response body is null');
  }
  return {
    checkpoint: newCheckpoint,
    reader: streamResponse.body.getReader()
  };
}

/**
 * Export error class and validation functions for use in components
 */
export { APIError, validateUserInput, validateReviewData, isValidUrl };